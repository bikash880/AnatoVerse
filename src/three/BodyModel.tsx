/**
 * The full-body model: lazily loads systems, applies visibility / selection materials, handles
 * picking, and animates the explode view in useFrame (positions written directly to meshes).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useAtlasStore } from '../store/useAtlasStore';
import type { SystemId } from '../types';
import { SYSTEMS } from '../data/systems';
import { ensureSystem, getEntries, getRoot, HIDDEN_LAYER, isLoaded, isVisible, type Entry } from './meshRegistry';
import { baseMaterialFor, fadeKey, ghostMaterial, quizMaterial, setSystemOpacity } from './materials';

type St = ReturnType<typeof useAtlasStore.getState>;
const FADE_KEYS = [...SYSTEMS.map((x) => x.id as string), '__skin'];
const fadeTarget = (k: string, s: St) =>
  k === '__skin' ? s.visibleSystems.integumentary && s.layerDepth < 1 : !!s.visibleSystems[k as SystemId];
const fadeOpacity = (k: string, s: St) => s.systemOpacity?.[(k === '__skin' ? 'integumentary' : k) as SystemId] ?? 1;
import { applyExplode, bodyCenter, computeGrid, RADIAL_END, type GridLayout } from './explode';
import { focusBox, focusObject, resetView } from './cameraRig';

import { explodeShared } from './explodeShared';

export function BodyModel() {
  const sex = useAtlasStore((s) => s.sex);
  const visibleSystems = useAtlasStore((s) => s.visibleSystems);
  const layerDepth = useAtlasStore((s) => s.layerDepth);
  const camera = useThree((s) => s.camera);

  const visibleList = useRef<Entry[]>([]);
  /** Per-system fade 0..1 (eye toggles fade systems in/out instead of popping). */
  const fades = useRef<Record<string, number>>(
    Object.fromEntries(FADE_KEYS.map((k) => [k, fadeTarget(k, useAtlasStore.getState()) ? 1 : 0])),
  );
  const appliedAlpha = useRef<Record<string, number>>({});
  const applyRef = useRef<() => void>(() => {});
  const ex = useRef({ cur: 0, applied: -1, dirty: true, center: new THREE.Vector3(0, 0.95, 0), grid: null as GridLayout | null });

  // ---------- lazy loading of systems ----------
  useEffect(() => {
    let cancelled = false;
    const st = useAtlasStore.getState();
    const needed = SYSTEMS.map((s) => s.id).filter(
      (id) => (id === 'integumentary' ? layerDepth < 1 : visibleSystems[id]) && !isLoaded(sex, id),
    ) as SystemId[];
    if (!needed.length) {
      if (!st.bootstrapped) st.setBootstrapped();
      st.setLoading({ active: false });
      return;
    }
    (async () => {
      for (let i = 0; i < needed.length; i++) {
        if (cancelled) return;
        const sys = needed[i];
        const label = SYSTEMS.find((s) => s.id === sys)!.label;
        useAtlasStore.getState().setLoading({ active: true, label: `Loading ${label.toLowerCase()} system…`, progress: i / needed.length });
        await ensureSystem(sex, sys, (p) =>
          useAtlasStore.getState().setLoading({ progress: (i + p) / needed.length }),
        );
        useAtlasStore.getState().markLoaded(sex, sys);
      }
      const s2 = useAtlasStore.getState();
      s2.setLoading({ active: false, progress: 1 });
      if (!s2.bootstrapped) s2.setBootstrapped();
    })();
    return () => {
      cancelled = true;
    };
  }, [sex, visibleSystems, layerDepth]);

  // ---------- visibility & materials (imperative) ----------
  useEffect(() => {
    const apply = () => {
      const s = useAtlasStore.getState();
      const entries = getEntries(s.sex);
      const highlight = s.studyMode === 'quiz' ? s.quizState.targetId : s.selectedId;
      const list: Entry[] = [];
      let highlightVisible = false;
      const allOn = { ...s, visibleSystems: Object.fromEntries(SYSTEMS.map((x) => [x.id, true])) as typeof s.visibleSystems };
      const shown = new Set<Entry>();
      for (const e of entries.values()) {
        const vis = isVisible(e.def, s);
        if (vis) {
          list.push(e);
          shown.add(e);
          if (e.def.id === highlight) highlightVisible = true;
        } else if (
          !s.isolateIds &&
          !fadeTarget(fadeKey(e.def), s) &&
          fades.current[fadeKey(e.def)] > 0.01 &&
          isVisible(e.def, e.def.kind === 'skin' ? { ...allOn, layerDepth: 0 } : allOn)
        ) {
          shown.add(e); // still fading out
        }
      }
      for (const e of entries.values()) {
        const vis = shown.has(e);
        e.mesh.visible = vis;
        e.mesh.layers.set(vis ? 0 : HIDDEN_LAYER);
        if (!vis) continue;
        if (highlight && highlightVisible) {
          // the selection keeps its real tissue look; <SelectionGlow/> adds the glowing outline
          e.mesh.material =
            e.def.id === highlight ? (s.studyMode === 'quiz' ? quizMaterial : baseMaterialFor(e.def)) : ghostMaterial(e.def.kind);
          e.mesh.renderOrder = e.def.id === highlight ? 10 : 1;
        } else {
          e.mesh.material = baseMaterialFor(e.def);
          e.mesh.renderOrder = e.def.kind === 'skin' ? 2 : 0;
        }
      }
      const prev = visibleList.current;
      const changed = prev.length !== list.length || prev.some((e, i) => e !== list[i]);
      visibleList.current = list;
      if (changed) {
        ex.current.dirty = true;
        ex.current.grid = null;
      }
      if (s.visibleCount !== list.length) s.setVisibleCount(list.length);
      explodeShared.version++;
    };
    applyRef.current = apply;
    apply();
    return useAtlasStore.subscribe((s, p) => {
      if (
        s.sex !== p.sex ||
        s.visibleSystems !== p.visibleSystems ||
        s.layerDepth !== p.layerDepth ||
        s.hiddenIds !== p.hiddenIds ||
        s.isolateIds !== p.isolateIds ||
        s.activeRegion !== p.activeRegion ||
        s.selectedId !== p.selectedId ||
        s.loadedSystems !== p.loadedSystems ||
        s.studyMode !== p.studyMode ||
        s.quizState.targetId !== p.quizState.targetId
      )
        apply();
    });
  }, []);

  // ---------- camera framing when an explode change is committed ----------
  useEffect(
    () =>
      useAtlasStore.subscribe((s, p) => {
        if (s.explodeCommit === p.explodeCommit) return;
        const t = s.explodeValue / 100;
        const list = visibleList.current;
        if (!list.length) return;
        const e = ex.current;
        e.center = bodyCenter(list);
        if (t > RADIAL_END && !e.grid) e.grid = makeGrid(list, e.center, camera);
        // bounds of the target arrangement
        const box = new THREE.Box3();
        const tmp = list.map((it) => it.mesh.position.clone());
        applyExplode(list, t, e.center, e.grid);
        if (t > RADIAL_END && e.grid) box.copy(e.grid.bounds);
        else for (const it of list) box.expandByPoint(it.mesh.position);
        list.forEach((it, i) => it.mesh.position.copy(tmp[i]));
        focusBox(box, t > RADIAL_END ? 1.06 : 1.08);
      }),
    [camera],
  );

  // ---------- per-system fade + opacity, LOD swap ----------
  const lodTick = useRef(0);
  const tmpV = useRef(new THREE.Vector3());
  useFrame((state, dt) => {
    const st = useAtlasStore.getState();
    let ended = false;
    for (const id of FADE_KEYS) {
      const target = fadeTarget(id, st) ? 1 : 0;
      let f = fades.current[id];
      if (f !== target) {
        f = THREE.MathUtils.damp(f, target, 7, Math.min(dt, 0.05));
        if (Math.abs(f - target) < 0.01) {
          f = target;
          if (target === 0) ended = true;
        }
        fades.current[id] = f;
      }
      const a = f * fadeOpacity(id, st);
      if (appliedAlpha.current[id] !== a) {
        appliedAlpha.current[id] = a;
        setSystemOpacity(id, a);
      }
    }
    if (ended) applyRef.current();

    // level of detail: swap to the simplified mesh when a big structure covers few pixels
    if (++lodTick.current % 12) return;
    const cam = state.camera as THREE.PerspectiveCamera;
    const k = state.size.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const sel = st.selectedId;
    for (const it of visibleList.current) {
      if (!it.lod) continue;
      const g = it.lod.hi;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const r = g.boundingSphere!.radius;
      it.mesh.getWorldPosition(tmpV.current);
      const px = (r * k) / Math.max(0.01, tmpV.current.distanceTo(cam.position));
      const useLo = px < 140 && it.def.id !== sel;
      const want = useLo ? it.lod.lo : it.lod.hi;
      if (it.mesh.geometry !== want) it.mesh.geometry = want;
    }
  });

  // ---------- explode animation ----------
  useFrame((_, dt) => {
    const e = ex.current;
    const target = useAtlasStore.getState().explodeValue / 100;
    e.cur = THREE.MathUtils.damp(e.cur, target, 5.5, Math.min(dt, 0.05));
    if (Math.abs(e.cur - target) < 1e-4) e.cur = target;
    if (e.cur === e.applied && !e.dirty) return;
    const list = visibleList.current;
    if (e.dirty || e.applied <= 0) e.center = bodyCenter(list);
    if (e.cur > RADIAL_END && !e.grid) e.grid = makeGrid(list, e.center, camera);
    applyExplode(list, e.cur, e.center, e.grid);
    // hidden entries snap back to their assembled position
    if (e.dirty) for (const it of getEntries(useAtlasStore.getState().sex).values()) if (!it.mesh.visible) it.mesh.position.copy(it.orig);
    e.applied = e.cur;
    e.dirty = false;
    explodeShared.t = e.cur;
    explodeShared.grid = e.cur > RADIAL_END ? e.grid : null;
  });

  // ---------- "Live": subtle breathing (14 / min) and heartbeat (72 bpm) on the assembled body ----------
  const liveRig = useRef<{ key: number; chest: Entry[]; dia: Entry[]; heart: Entry[]; chestC: THREE.Vector3; heartC: THREE.Vector3; active: boolean } | null>(null);
  useFrame((state) => {
    const st = useAtlasStore.getState();
    const e = ex.current;
    const on = st.live && e.cur === 0 && st.screen === 'explorer';
    // (re)collect the moving structures when the visible set changes
    if (!liveRig.current || liveRig.current.key !== explodeShared.version) {
      const list = visibleList.current;
      const name = (it: Entry) => `${it.def.id} ${it.def.nameEn}`.toLowerCase();
      const chest = list.filter((it) => it.def.region === 'thorax' && /rib|costal|sternum|manubrium|xiphoid|intercostal|lung|lobe|bronch|pectoral|serratus/.test(name(it)));
      const dia = list.filter((it) => /diaphragm/.test(name(it)));
      const heart = list.filter((it) => it.def.region === 'thorax' && /heart|atrium|ventric|myocardium|valve|leaflet|cusp|papillary|coronary|cardiac vein|interventricular|marginal/.test(name(it)));
      const ctr = (l: Entry[]) => (l.length ? l.reduce((s, it) => s.add(it.orig), new THREE.Vector3()).divideScalar(l.length) : new THREE.Vector3(0, 1.3, 0));
      if (liveRig.current?.active) for (const it of [...liveRig.current.chest, ...liveRig.current.dia, ...liveRig.current.heart]) {
        it.mesh.position.copy(it.orig);
        it.mesh.scale.setScalar(1);
      }
      liveRig.current = { key: explodeShared.version, chest, dia, heart, chestC: ctr(chest), heartC: ctr(heart), active: false };
    }
    const r = liveRig.current;
    if (!on) {
      if (r.active) {
        for (const it of [...r.chest, ...r.dia, ...r.heart]) {
          if (e.cur === 0) it.mesh.position.copy(it.orig);
          it.mesh.scale.setScalar(1);
        }
        r.active = false;
      }
      return;
    }
    r.active = true;
    const t = state.clock.elapsedTime;
    const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / (60 / 14)); // inspiration 0..1
    const ph = (t % (60 / 72)) / (60 / 72);
    const v = Math.exp(-Math.pow((ph - 0.34) / 0.1, 2)); // ventricular systole
    for (const it of r.chest) {
      // the rib cage and lungs expand outward (antero-posterior and lateral), not upward
      it.mesh.position.set(it.orig.x + (it.orig.x - r.chestC.x) * 0.025 * b, it.orig.y + 0.002 * b, it.orig.z + (it.orig.z - r.chestC.z) * 0.035 * b);
      if (/lung|lobe/.test(it.def.id)) it.mesh.scale.setScalar(1 + 0.03 * b);
    }
    for (const it of r.dia) it.mesh.position.set(it.orig.x, it.orig.y - 0.012 * b, it.orig.z);
    for (const it of r.heart) {
      it.mesh.position.copy(it.orig).addScaledVector(it.orig.clone().sub(r.heartC), -0.04 * v);
      it.mesh.scale.setScalar(1 - 0.04 * v);
    }
  });

  // ---------- picking ----------
  const onMove = (ev: ThreeEvent<PointerEvent>) => {
    if (ev.pointerType !== 'mouse') return;
    ev.stopPropagation();
    useAtlasStore.getState().setHovered(ev.object.userData.id ?? null);
  };
  const onOut = () => useAtlasStore.getState().setHovered(null);
  const onClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 6) return; // was a drag / orbit
    ev.stopPropagation();
    const st = useAtlasStore.getState();
    if (st.studyMode === 'quiz' || st.studyMode === 'flashcards') return;
    const id = ev.object.userData.id as string | undefined;
    if (!id) return;
    st.select(id);
    // smooth animated zoom to the picked structure (only on the assembled body; the grid stays put)
    if (st.explodeValue === 0) {
      st.setViewPreset(null);
      focusObject(ev.object);
    }
  };

  // double-click anywhere on the body → back to the full-body view (selection is kept)
  const onDouble = (ev: ThreeEvent<MouseEvent>) => {
    ev.stopPropagation();
    const st = useAtlasStore.getState();
    if (st.explodeValue !== 0) return;
    st.setViewPreset('front');
    resetView();
  };

  return <primitive object={getRoot(sex)} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} onDoubleClick={onDouble} />;
}

function makeGrid(list: Entry[], center: THREE.Vector3, camera: THREE.Camera) {
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  return computeGrid(list, center, right, up);
}
