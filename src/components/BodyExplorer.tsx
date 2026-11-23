/**
 * Full-body explorer canvas: studio lighting, the anatomical model, overlays and controls.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { applyViewOffset } from '../three/cameraRig';
import { useSkelly } from '../skelly/skellyStore';
import { ContactShadows } from '@react-three/drei';
import { PostFX, StudioEnvironment, TissueClock } from '../three/PostFX';
import { useAtlasStore } from '../store/useAtlasStore';
import { BodyModel } from '../three/BodyModel';
import { Controls, GridLabels, HoverOutline, QuizMarker, SelectionGlow, SelectionLabel } from '../three/SceneOverlays';
import { resetView } from '../three/cameraRig';
import { LabelOverlay } from '../three/LabelOverlay';

/** Contact shadows are rendered once (frames=1) and refreshed only when the scene settles. */
function SettledShadows() {
  const [key, setKey] = useState(0);
  const explode = useAtlasStore((s) => s.explodeValue);
  const count = useAtlasStore((s) => s.visibleCount);
  const sex = useAtlasStore((s) => s.sex);
  useEffect(() => {
    const t = setTimeout(() => setKey((k) => k + 1), 900);
    return () => clearTimeout(t);
  }, [explode, count, sex]);
  if (explode > 0) return null;
  return <ContactShadows key={key} frames={1} position={[0, 0.001, 0]} opacity={0.55} scale={2.4} blur={2.6} far={1.1} resolution={512} color="#000000" />;
}

/** Shift the projection so the body is centred in the area not covered by the sidebar / dock. */
function ViewOffset() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const chatOpen = useSkelly((s) => s.open);
  useEffect(() => {
    const phone = size.width < 768;
    // the open Skelly chat panel (desktop/tablet) also covers the canvas → keep structures clear of it
    const right = phone ? 0 : (size.width >= 1024 ? 392 : 372) + (chatOpen ? 380 : 0);
    // dock (+ bottom sheet peek on phones); the dock wraps to two rows below 1280 px
    // phone: dock + Explore peek, or the Skelly chat sheet (66vh) while it is open
    const bottom = phone ? (chatOpen ? Math.round(size.height * 0.66) + 8 : 272) : size.width < 1600 ? 132 : 96;
    const top = phone ? 110 : 60;
    applyViewOffset(camera, size.width, size.height, right, bottom, top);
  }, [camera, size, chatOpen]);
  return null;
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.1} color="#fff6ee" />
      <directionalLight position={[-3, 2, -2.5]} intensity={0.5} color="#9fd8ff" />
      <StudioEnvironment intensity={0.85} />
    </>
  );
}

export function BodyExplorer() {
  const screen = useAtlasStore((s) => s.screen);
  const lastMiss = useRef(0);

  /** Double-tap / double-click on empty space deselects and resets the view. */
  const onMissed = (e: MouseEvent) => {
    if (e.type !== 'click') return;
    const now = performance.now();
    if (now - lastMiss.current < 380) {
      const st = useAtlasStore.getState();
      if (st.studyMode !== 'quiz') st.select(null);
      if (st.explodeValue === 0) {
        st.setViewPreset('front');
        resetView();
      }
    }
    lastMiss.current = now;
  };

  return (
    <Canvas
      className="!absolute inset-0 touch-none"
      camera={{ position: [0, 0.98, 3.9], fov: 35, near: 0.01, far: 80 }}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      flat
      frameloop={screen === 'explorer' ? 'always' : 'never'}
      onPointerMissed={onMissed}
    >
      <ViewOffset />
      <StudioLights />
      <BodyModel />
      <HoverOutline />
      <SelectionGlow />
      <SelectionLabel />
      <QuizMarker />
      <GridLabels />
      <LabelOverlay />
      <SettledShadows />
      <Controls />
      <TissueClock />
      <PostFX aoRadius={0.05} aoIntensity={1.8} />
    </Canvas>
  );
}

