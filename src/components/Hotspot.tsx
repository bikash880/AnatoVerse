/**
 * Numbered hotspot pin attached to an organ. It lives inside the organ group, so it follows
 * rotation and animation; it fades when the organ surface is between it and the camera.
 */
import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import type { Hotspot as HotspotData } from '../types';

interface Props {
  data: HotspotData;
  position: THREE.Vector3;
  /** meshes that can occlude the pin */
  occluders: React.MutableRefObject<THREE.Object3D | null>;
  clipPlane: THREE.Plane | null;
  open: boolean;
  onToggle: () => void;
}

const ray = new THREE.Raycaster();
const world = new THREE.Vector3();

export function Hotspot({ data, position, occluders, clipPlane, open, onToggle }: Props) {
  const ref = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t - last.current < 0.12 || !ref.current || !occluders.current) return;
    last.current = t;
    ref.current.getWorldPosition(world);
    const dir = world.clone().sub(camera.position);
    const dist = dir.length();
    ray.set(camera.position, dir.normalize());
    ray.far = dist - 0.03;
    const hits = ray.intersectObject(occluders.current, true).filter((h) => {
      const m = (h.object as THREE.Mesh).material as THREE.Material;
      if (m.transparent && m.opacity < 0.6) return false; // see-through (cornea, lens…)
      if (clipPlane && clipPlane.distanceToPoint(h.point) < 0) return false; // removed by cross-section
      return true;
    });
    const occluded = hits.length > 0;
    if (occluded !== hidden) setHidden(occluded);
  });

  return (
    <group ref={ref} position={position}>
      <Html center zIndexRange={[40, 10]} style={{ pointerEvents: hidden ? 'none' : 'auto' }}>
        <div className="relative" style={{ opacity: hidden ? 0.12 : 1, transition: 'opacity 220ms ease' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12px] font-bold text-white transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              data.important ? 'border-amber bg-amber/85 shadow-[0_0_16px_#F59E0B]' : 'border-accent-soft bg-accent/85 shadow-[0_0_16px_#14B8A6]'
            } ${open ? 'scale-110 ring-2 ring-white/70' : ''}`}
            aria-label={`${data.number}. ${data.label}`}
          >
            {data.number}
          </button>
          <AnimatePresence>
            {open && !hidden && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                className="glass-strong absolute left-9 top-1/2 w-56 -translate-y-1/2 rounded-2xl p-3 text-left"
              >
                <div className="text-[13.5px] font-semibold text-white">{data.label}</div>
                <div className="mt-0.5 text-[12px] leading-snug text-white/70">{data.description}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Html>
    </group>
  );
}
