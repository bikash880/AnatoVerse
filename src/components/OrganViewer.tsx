/**
 * Organ Deep-Dive: full-screen high-detail organ with hotspot pins, animation, cross-section
 * clipping plane and labels toggle. Auto-rotates until the user touches it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { useAtlasStore } from '../store/useAtlasStore';
import organs from '../data/organs.json';
import type { Hotspot as HotspotData, OrganId, OrganRecord } from '../types';
import { hasRealOrgan, loadRealOrgan } from '../three/realOrgans';
import { PostFX, StudioEnvironment, TissueClock } from '../three/PostFX';

const LIVE_LABEL: Record<OrganId, string> = { heart: '72 bpm', lungs: '14 breaths/min', brain: 'neural pulses', kidneys: 'renal flow', liver: 'breathing', stomach: 'peristalsis', eye: 'pupil & gaze' };
import { buildOrgan, setClipping } from '../three/organModels';
import { revealAndFocus } from '../actions';
import { Hotspot } from './Hotspot';
import { OrganIcon } from './organIcons';
import { Icon, Slider, Switch } from './ui';

const ORGANS = organs as OrganRecord[];

/** What the scene renders: a real BodyParts3D organ or the procedural fallback. */
interface OrganModel {
  group: THREE.Group;
  hotspots: HotspotData[];
  /** hotspots from the real model are already anchored on the geometry; procedural ones get snapped */
  anchored: boolean;
  animate: (t: number, dt: number, live: boolean) => void;
  dispose: () => void;
  source: 'bodyparts3d' | 'procedural';
}

function proceduralModel(id: OrganId): OrganModel {
  const b = buildOrgan(id);
  const record = ORGANS.find((o) => o.id === id)!;
  return { group: b.group, hotspots: record.hotspots, anchored: false, animate: (t, _dt, live) => live && b.animate(t), dispose: b.dispose, source: 'procedural' };
}

function OrganScene({ model, cut, labels, openPin, setOpenPin, onInteract }: { model: OrganModel; cut: number | null; labels: boolean; openPin: number | null; setOpenPin: (n: number | null) => void; onInteract: () => void }) {
  const rootRef = useRef<THREE.Object3D | null>(model.group);
  rootRef.current = model.group;
  const gl = useThree((s) => s.gl);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 2), []);

  useEffect(() => () => model.dispose(), [model]);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  useEffect(() => {
    plane.constant = cut ?? 2;
    setClipping(model.group, cut === null ? null : plane);
  }, [cut, model, plane]);

  // Procedural organs: snap surface hotspots onto the outer surface of the model.
  const pins = useMemo(() => {
    if (model.anchored) return model.hotspots.map((h) => ({ h, p: new THREE.Vector3(...h.position) }));
    model.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.group);
    const c = box.getCenter(new THREE.Vector3());
    const rc = new THREE.Raycaster();
    return model.hotspots.map((h) => {
      const p = new THREE.Vector3(...h.position);
      if (h.internal) return { h, p };
      const dir = p.clone().sub(c).normalize();
      rc.set(p.clone().addScaledVector(dir, 1.5), dir.clone().negate());
      const hit = rc.intersectObject(model.group, true).find((x) => {
        const m = (x.object as THREE.Mesh).material as THREE.Material;
        return !(m.transparent && m.opacity < 0.6);
      });
      return { h, p: hit ? hit.point.clone().addScaledVector(dir, 0.03) : p };
    });
  }, [model]);

  useFrame((state, dt) => model.animate(state.clock.elapsedTime, Math.min(dt, 0.1), useAtlasStore.getState().live));

  return (
    <>
      <primitive object={model.group} onPointerDown={onInteract} />
      <ContactShadows position={[0, -1.35, 0]} opacity={0.5} scale={5} blur={2.8} far={2.5} resolution={512} frames={1} />
      {labels &&
        pins.map(({ h, p }) => (
          <Hotspot key={h.number} data={h} position={p} occluders={rootRef} clipPlane={cut === null ? null : plane} open={openPin === h.number} onToggle={() => setOpenPin(openPin === h.number ? null : h.number)} />
        ))}
    </>
  );
}

export function OrganViewer({ id }: { id: OrganId }) {
  const record = ORGANS.find((o) => o.id === id)!;
  const live = useAtlasStore((s) => s.live);
  const setLive = useAtlasStore((s) => s.setLive);
  const [model, setModel] = useState<OrganModel | null>(() => (hasRealOrgan(id) ? null : proceduralModel(id)));
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState(false);
  // stream the real organ model (Draco GLB) with a progress bar; fall back to procedural on error
  useEffect(() => {
    if (!hasRealOrgan(id)) return;
    let alive = true;
    loadRealOrgan(id, (p) => alive && setProgress(p))
      .then((r) => alive && setModel({ group: r.group, hotspots: r.hotspots, anchored: true, animate: r.animate, dispose: r.dispose, source: 'bodyparts3d' }))
      .catch(() => {
        if (!alive) return;
        setLoadError(true);
        setModel(proceduralModel(id));
      });
    return () => {
      alive = false;
    };
  }, [id]);
  const hotspots = model?.hotspots ?? [];
  const [cutOn, setCutOn] = useState(false);
  const [cut, setCut] = useState(0.2);
  const [labels, setLabels] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [openPin, setOpenPin] = useState<number | null>(null);

  const back = () => useAtlasStore.getState().setScreen('explorer');
  const showInBody = () => {
    back();
    if (record.bodyStructureId) setTimeout(() => revealAndFocus(record.bodyStructureId!), 450);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openPin !== null) setOpenPin(null);
        else back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPin]);

  return (
    <motion.div
      className="fixed inset-0 z-40 bg-ink"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_48%,rgba(20,184,166,0.14),rgba(10,14,20,0)_55%)]" />
      <Canvas
        className="!absolute inset-0 touch-none"
        camera={{ position: [0, 0.2, 5.6], fov: 35, near: 0.02, far: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: true }}
        flat
        onPointerMissed={() => setOpenPin(null)}
      >
        <ambientLight intensity={0.1} />
        <directionalLight position={[3, 4, 4]} intensity={1.2} />
        <directionalLight position={[-4, 1, -3]} intensity={0.6} color="#8fd3ff" />
        <StudioEnvironment intensity={1} />
        <TissueClock />
        {model && <OrganScene model={model} cut={cutOn ? cut : null} labels={labels} openPin={openPin} setOpenPin={setOpenPin} onInteract={() => setAutoRotate(false)} />}
        <PostFX aoRadius={0.12} aoIntensity={2.5} bloom={0.7} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.55} maxDistance={9} autoRotate={autoRotate} autoRotateSpeed={0.8} onStart={() => setAutoRotate(false)} />
      </Canvas>

      {!model && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <OrganIcon id={id} size={40} className="animate-pulse text-accent-soft" />
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="text-xs text-white/45">Loading {record.nameEn.toLowerCase()} model… {Math.round(progress * 100)}%</div>
        </div>
      )}

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="pointer-events-auto">
          <button className="btn glass mb-4 !rounded-full !px-3.5" onClick={back}>
            <Icon name="back" size={15} /> Back to body
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent-soft">
              <OrganIcon id={id} size={26} />
            </span>
            <div>
              <h1 className="font-display text-4xl font-semibold leading-none text-white sm:text-5xl">{record.nameEn}</h1>
              <div className="mt-1 font-display text-lg italic text-white/55">{record.nameLatin}</div>
              {model && (
                <div className="mt-1 text-[11px] text-white/40">
                  {model.source === 'bodyparts3d' ? 'Real anatomy · BodyParts3D (CC BY-SA 2.1 JP)' : loadError ? 'Model failed to load — showing the simplified model' : 'Simplified procedural model'}
                </div>
              )}
            </div>
          </div>
        </div>
        {record.bodyStructureId && (
          <button className="btn glass pointer-events-auto !rounded-full" onClick={showInBody}>
            <Icon name="body" size={15} /> Show in body
          </button>
        )}
      </div>

      {/* Hotspot list (tablet / desktop) */}
      {labels && (
        <div className="glass scroll-thin absolute right-4 top-1/2 hidden max-h-[60vh] w-60 -translate-y-1/2 overflow-y-auto rounded-[18px] p-2 lg:block">
          <div className="section-title px-2 pb-1 pt-1">Structures</div>
          {hotspots.map((h) => (
            <button key={h.number} onClick={() => { setOpenPin(openPin === h.number ? null : h.number); setAutoRotate(false); }} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px] transition ${openPin === h.number ? 'bg-accent/15 text-white' : 'text-white/75 hover:bg-white/5'}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${h.important ? 'bg-amber' : 'bg-accent'}`}>{h.number}</span>
              {h.label}
            </button>
          ))}
        </div>
      )}

      {/* Bottom toggles */}
      <div className="absolute bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 sm:bottom-6">
        <div className="glass flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-[18px] px-4 py-3">
          <label className="flex items-center gap-2 text-[13px] text-white/80" title="Heartbeat, breathing, neural pulses, peristalsis, blood flow">
            <Switch on={live} onChange={setLive} label="Live" />
            Live <span className="text-white/40">({LIVE_LABEL[id]})</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-white/80">
            <Switch on={cutOn} onChange={setCutOn} label="Cross-section" />
            Cross-section
          </label>
          {cutOn && (
            <div className="flex w-full items-center gap-2 sm:w-44">
              <Icon name="scissors" size={14} className="text-white/50" />
              <Slider label="Cross-section depth" value={cut} min={-1} max={1.2} step={0.01} onChange={setCut} />
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-white/80">
            <Switch on={labels} onChange={setLabels} label="Labels" />
            Labels
          </label>
          <button className="btn !py-1" onClick={() => setAutoRotate((a) => !a)}>
            <Icon name={autoRotate ? 'pause' : 'play'} size={13} /> {autoRotate ? 'Stop rotation' : 'Auto-rotate'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
