/**
 * Camera rig: eased camera moves (advanced from the R3F render loop) shared by the dock, keyboard shortcuts, search and
 * the info card. The R3F scene registers its camera + OrbitControls here on mount.
 */
import * as THREE from 'three';
import type { ViewPreset } from '../types';

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  enabled: boolean;
}


const rig: { camera: THREE.PerspectiveCamera | null; controls: ControlsLike | null } = { camera: null, controls: null };

export function registerRig(camera: THREE.PerspectiveCamera, controls: ControlsLike) {
  rig.camera = camera;
  rig.controls = controls;
  // `?debug` exposes the rig for automated end-to-end checks
  if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __rig: typeof rig }).__rig = rig;
}

export const BODY_TARGET = new THREE.Vector3(0, 0.9, 0);
const DIST = 3.9;

/**
 * Screen insets (px) covered by UI (sidebar on the right, dock / sheet at the bottom, header at
 * the top). The projection is shifted with setViewOffset so the model is centred in the free
 * area, and framing uses the free area's aspect ratio.
 */
export const insets = { right: 0, bottom: 0, top: 0, width: 1, height: 1 };

export function applyViewOffset(camera: THREE.PerspectiveCamera, width: number, height: number, right: number, bottom: number, top: number) {
  Object.assign(insets, { right, bottom, top, width, height });
  camera.setViewOffset(width, height, right / 2, (bottom - top) / 2, width, height);
  camera.updateProjectionMatrix();
}

/** Half-angles (radians) of the free (uncovered) part of the canvas. */
function freeHalfAngles(camera: THREE.PerspectiveCamera) {
  // room for label callouts / the left camera rail: up to 300 px, less on narrow windows
  const avail = insets.width - insets.right;
  const freeW = Math.max(120, avail - (insets.right ? Math.min(300, avail * 0.28) : 0));
  const freeH = Math.max(120, insets.height - insets.bottom - insets.top);
  const t = Math.tan((camera.fov * Math.PI) / 360);
  return { h: Math.atan(t * (freeW / insets.height)), v: Math.atan(t * (freeH / insets.height)) };
}

/** Distance at which a sphere of radius r fits in the free (uncovered) part of the canvas. */
function fitDistance(camera: THREE.PerspectiveCamera, r: number, padding: number) {
  const { h, v } = freeHalfAngles(camera);
  return (r * padding) / Math.sin(Math.min(h, v));
}

/**
 * Distance at which a box fits, measuring its width and height in the camera's own screen axes
 * (much tighter than a bounding sphere for wide shapes such as the exploded parts grid).
 */
function fitBoxDistance(camera: THREE.PerspectiveCamera, box: THREE.Box3, dir: THREE.Vector3, padding: number) {
  const size = box.getSize(new THREE.Vector3());
  const forward = dir.clone().negate().normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const extent = (axis: THREE.Vector3) => Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z;
  const { h, v } = freeHalfAngles(camera);
  const depth = extent(forward);
  return Math.max(((extent(right) / 2) * padding) / Math.tan(h), ((extent(up) / 2) * padding) / Math.tan(v)) + depth / 2;
}

export const PRESETS: Record<ViewPreset, { label: string; pos: [number, number, number] }> = {
  front: { label: 'Front', pos: [0, 0.98, DIST] },
  back: { label: 'Back', pos: [0, 0.98, -DIST] },
  // the patient's left side is +X
  left: { label: 'Left', pos: [DIST, 0.98, 0] },
  right: { label: 'Right', pos: [-DIST, 0.98, 0] },
  threeQuarter: { label: '3/4 View', pos: [2.6, 1.45, 2.85] },
};

/** The active camera move; advanced by `tickRig` in the render loop (no separate timer). */
let move: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; dur: number; t: number } | null = null;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2); // power3.inOut

/** Smoothly move the camera to `pos` looking at `target`. */
export function flyTo(pos: THREE.Vector3, target: THREE.Vector3, duration = 1.1) {
  const { camera, controls } = rig;
  if (!camera || !controls) return;
  if (duration <= 0) {
    move = null;
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
    return;
  }
  move = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), dur: duration, t: 0 };
}

/** Cancel an in-flight move (e.g. when the user starts dragging). */
export function stopMove() {
  move = null;
}

export function isMoving() {
  return !!move;
}

/** Advance the active camera move; call once per frame. */
export function tickRig(dt: number) {
  const { camera, controls } = rig;
  if (!move || !camera || !controls) return;
  move.t = Math.min(move.dur, move.t + Math.min(dt, 0.25));
  const k = ease(move.t / move.dur);
  camera.position.lerpVectors(move.p0, move.p1, k);
  controls.target.lerpVectors(move.t0, move.t1, k);
  controls.update();
  if (move.t >= move.dur) move = null;
}

/** Body bounding-sphere radius (m) used to fit presets into the visible area. */
const BODY_RADIUS = 0.97;

export function setView(preset: ViewPreset, center = BODY_TARGET, duration = 1.1) {
  const p = PRESETS[preset].pos;
  const offset = new THREE.Vector3(p[0], p[1] - BODY_TARGET.y, p[2]);
  if (rig.camera) offset.setLength(Math.max(DIST, fitDistance(rig.camera, BODY_RADIUS, 1.04)));
  flyTo(center.clone().add(offset), center.clone(), duration);
}

/** Frame an object (or a world-space box) keeping the current viewing direction. */
export function focusBox(box: THREE.Box3, padding = 1.1) {
  const { camera, controls } = rig;
  if (!camera || !controls || box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(0.4, fitBoxDistance(camera, box, dir, padding));
  flyTo(center.clone().addScaledVector(dir, dist), center.clone(), 1.2);
}

/** Frame a single structure with some surrounding context. */
export function focusObject(obj: THREE.Object3D) {
  focusBox(new THREE.Box3().setFromObject(obj), 1.9);
}

export function zoom(factor: number) {
  const { camera, controls } = rig;
  if (!camera || !controls) return;
  const dir = camera.position.clone().sub(controls.target).multiplyScalar(factor);
  flyTo(controls.target.clone().add(dir), controls.target.clone(), 0.35);
}

/** Orbit the camera around the target's vertical axis by `deg` degrees. */
export function orbit(deg: number) {
  const { camera, controls } = rig;
  if (!camera || !controls) return;
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
  flyTo(controls.target.clone().add(off), controls.target.clone(), 0.5);
}

export function resetView() {
  setView('front');
}

export function getCamera() {
  return rig.camera;
}
