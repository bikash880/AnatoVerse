/**
 * Shared look: HDRI studio lighting + post-processing (ambient occlusion, bloom, ACES tone
 * mapping). Quality adapts automatically: if the frame rate drops, ambient occlusion is turned
 * off first (iPad-friendly). Canvases using this must set `flat` (tone mapping happens here).
 */
import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { tickTissue, tissueUniforms } from './tissue';
import { useAtlasStore } from '../store/useAtlasStore';

export const HDRI = `${import.meta.env.BASE_URL}hdri/studio_small_09_1k.hdr`;

/** CC0 studio HDRI (Poly Haven "Studio Small 09") as image-based lighting only — background stays dark. */
export function StudioEnvironment({ intensity = 0.9 }: { intensity?: number }) {
  return <Environment files={HDRI} environmentIntensity={intensity} />;
}

/** Advances the shared tissue shader clock (neural pulses, peristalsis, …). */
export function TissueClock() {
  useFrame((state) => tickTissue(state.clock.elapsedTime, useAtlasStore.getState().live));
  return null;
}

/** `?quality=low` forces the fast path (no AO, no procedural tissue detail) for weak devices. */
const FORCE_LOW = typeof location !== 'undefined' && /quality=low/.test(location.search);
if (FORCE_LOW) tissueUniforms.uDetail.value = 0;

export function PostFX({ aoRadius = 0.08, bloom = 0.55, aoIntensity = 2.2 }: { aoRadius?: number; bloom?: number; aoIntensity?: number }) {
  const [hq, setHq] = useState(!FORCE_LOW);
  // when the frame rate drops: first ambient occlusion goes, then procedural tissue detail
  const degrade = () => {
    if (hq) setHq(false);
    else tissueUniforms.uDetail.value = 0;
  };
  return (
    <>
      <PerformanceMonitor onDecline={degrade} flipflops={3} onFallback={() => { setHq(false); tissueUniforms.uDetail.value = 0; }} />
      <EffectComposer multisampling={hq ? 4 : 0} enableNormalPass={false}>
        {hq ? <N8AO aoRadius={aoRadius} intensity={aoIntensity} distanceFalloff={0.6} halfRes quality="performance" /> : <></>}
        <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={bloom} radius={0.6} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}
