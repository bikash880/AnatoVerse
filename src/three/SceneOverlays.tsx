/**
 * In-scene overlays: hover outline, floating selection label with leader line, and the group
 * headings of the exploded parts grid.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useAtlasStore } from '../store/useAtlasStore';
import { getEntry } from './meshRegistry';
import { makeOutlineMaterial, ACCENT } from './materials';
import { explodeShared } from './explodeShared';
import { getStructure } from '../anatomy/catalog';
import { displayName } from '../anatomy/def';
import { registerRig, setView, stopMove, tickRig, BODY_TARGET } from './cameraRig';
import { COLUMN_GAP } from './explode';
import { GROUP_BY_ID } from '../data/systems';
import type { GridLayout } from './explode';

/** Soft accent outline around the hovered structure (desktop only). */
export function HoverOutline() {
  const hoveredId = useAtlasStore((s) => s.hoveredId);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const sex = useAtlasStore((s) => s.sex);
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => makeOutlineMaterial(ACCENT, 0.0018), []);
  const entry = hoveredId && hoveredId !== selectedId ? getEntry(sex, hoveredId) : undefined;
  useFrame(() => {
    if (ref.current && entry) ref.current.position.copy(entry.mesh.position);
  });
  if (!entry || !entry.mesh.visible) return null;
  return <mesh ref={ref} geometry={entry.mesh.geometry} material={mat} raycast={() => null} renderOrder={3} />;
}

/** Pulsing glow outline around the selected structure (two shells: crisp rim + soft halo). */
export function SelectionGlow() {
  const selectedId = useAtlasStore((s) => (s.studyMode === 'quiz' ? null : s.selectedId));
  const sex = useAtlasStore((s) => s.sex);
  const group = useRef<THREE.Group>(null);
  const [rim, halo] = useMemo(() => {
    const r = makeOutlineMaterial('#5EEAD4', 0.0016);
    const h = makeOutlineMaterial(ACCENT, 0.0045);
    h.blending = r.blending = THREE.AdditiveBlending;
    return [r, h];
  }, []);
  const entry = getEntry(sex, selectedId);
  useFrame((st) => {
    if (!group.current || !entry) return;
    group.current.position.copy(entry.mesh.position);
    group.current.scale.copy(entry.mesh.scale);
    const p = 0.5 + 0.5 * Math.sin(st.clock.elapsedTime * 3);
    rim.opacity = 0.75 + 0.25 * p;
    halo.opacity = 0.18 + 0.22 * p;
  });
  if (!entry || !entry.mesh.visible) return null;
  const g = entry.lod?.hi ?? entry.mesh.geometry;
  return (
    <group ref={group}>
      <mesh geometry={g} material={halo} raycast={() => null} renderOrder={11} />
      <mesh geometry={g} material={rim} raycast={() => null} renderOrder={12} />
    </group>
  );
}

/** Floating name tag + leader line attached to the selected structure. */
export function SelectionLabel() {
  const selectedId = useAtlasStore((s) => s.selectedId);
  const sex = useAtlasStore((s) => s.sex);
  const suppress = useAtlasStore((s) => s.suppressLabel);
  const studyMode = useAtlasStore((s) => s.studyMode);
  const labelMode = useAtlasStore((s) => s.labelMode);
  const group = useRef<THREE.Group>(null);
  const entry = getEntry(sex, selectedId);
  const def = getStructure(sex, selectedId);
  useFrame(() => {
    if (group.current && entry) group.current.position.copy(entry.mesh.position);
  });
  if (!entry || !def || suppress || studyMode === 'quiz' || labelMode === 'off') return null;
  return (
    <group ref={group}>
      <Html zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="relative" style={{ transform: 'translate(0, 0)' }}>
          <span className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full bg-accent shadow-[0_0_12px_#14B8A6] ring-2 ring-white/70" />
          <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1">
            <polyline points="0,0 38,-38 70,-38" fill="none" stroke="#5EEAD4" strokeWidth="1.5" />
          </svg>
          <div className="glass absolute left-[72px] top-[-52px] whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] font-semibold text-white">
            {displayName(def)}
            <div className="text-[11px] font-normal italic text-white/55">{def.nameLatin}</div>
          </div>
        </div>
      </Html>
    </group>
  );
}

/** Pulsing amber ring marking the quiz target (so even tiny structures are easy to find). */
export function QuizMarker() {
  const targetId = useAtlasStore((s) => (s.studyMode === 'quiz' ? s.quizState.targetId : null));
  const sex = useAtlasStore((s) => s.sex);
  const group = useRef<THREE.Group>(null);
  const entry = getEntry(sex, targetId);
  useFrame(() => {
    if (group.current && entry) group.current.position.copy(entry.mesh.position);
  });
  if (!entry) return null;
  return (
    <group ref={group}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <span className="relative flex h-10 w-10 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full border-2 border-amber opacity-70" />
          <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-amber shadow-[0_0_14px_#F59E0B]" />
        </span>
      </Html>
    </group>
  );
}

/** Headings over each block of the exploded parts grid. */
export function GridLabels() {
  const [grid, setGrid] = useState<GridLayout | null>(null);
  const [opacity, setOpacity] = useState(0);
  const [, setTick] = useState(0);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const lastZoom = useRef(0);
  useFrame(() => {
    if (explodeShared.grid !== grid) setGrid(explodeShared.grid);
    const o = Math.max(0, Math.min(1, (explodeShared.t - 0.8) / 0.2));
    if (Math.abs(o - opacity) > 0.04 || (o === 0) !== (opacity === 0)) setOpacity(o);
    // header widths depend on zoom → re-render when the camera distance changes noticeably
    const z = camera.position.length();
    if (Math.abs(z - lastZoom.current) / (lastZoom.current || 1) > 0.04) {
      lastZoom.current = z;
      setTick((t) => t + 1);
    }
  });
  if (!grid || opacity === 0) return null;
  // column width in px, so a header can never run into the next column
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  return (
    <>
      {grid.labels.map((l) => {
        v1.copy(l.position).project(camera);
        // the header may use most of the gap to the next column
        v2.copy(l.position).addScaledVector(grid.right, l.width + COLUMN_GAP * 0.85).project(camera);
        const px = Math.abs(v2.x - v1.x) * 0.5 * size.width;
        const g = GROUP_BY_ID[l.id];
        return (
          <Html key={l.id} position={l.position} style={{ pointerEvents: 'none', opacity, transform: 'translate(0, -100%)' }}>
            {/* the group name never truncates; the count is dropped first when space is tight */}
            <div style={{ maxWidth: Math.max(92, px) }} className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85 backdrop-blur">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
              <span className="shrink-0">{l.label}</span>
              <span className="min-w-0 truncate text-white/45">· {l.count}</span>
            </div>
          </Html>
        );
      })}
    </>
  );
}

/** OrbitControls + registration with the GSAP camera rig. */
export function Controls({ autoRotate: autoProp = false }: { autoRotate?: boolean }) {
  const autoStore = useAtlasStore((s) => s.autoRotate && s.screen === 'explorer');
  const autoRotate = autoProp || autoStore;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.target.copy(BODY_TARGET);
    ref.current.update();
    registerRig(camera, ref.current);
    // initial framing (insets were set by <ViewOffset/>, an earlier sibling)
    setView('front', undefined, 0);
  }, [camera]);
  useFrame((_, dt) => tickRig(dt));
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      panSpeed={0.8}
      minDistance={0.12}
      maxDistance={30}
      autoRotate={autoRotate}
      autoRotateSpeed={0.8}
      onStart={stopMove}
    />
  );
}
