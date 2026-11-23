/**
 * Procedural geometry toolkit used to build the built-in anatomical model.
 *
 * All builders return geometry in WORLD space (metres, body standing on y = 0, facing +Z,
 * patient's LEFT side on +X). The mesh registry later re-centres every geometry on its own
 * centroid so each structure can be moved independently (explode view).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

/** Deterministic PRNG so the model is identical on every load. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a seed. */
export function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Mirror a left-side point to the requested side (+1 = left, −1 = right). */
export const sx = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Map a unit geometry built along +Y (height 0..1, radius ≈1 around Y) onto the segment a→b.
 * `width` scales local X, `thickness` local Z. `normal` is the preferred direction of local Z
 * (e.g. the body surface normal for flat muscles).
 */
export function orientBetween(
  geom: THREE.BufferGeometry,
  a: V3,
  b: V3,
  width: number,
  thickness: number,
  normal: V3 = [0, 0, 1],
): THREE.BufferGeometry {
  const A = v(a);
  const dir = v(b).sub(A);
  const len = dir.length() || 1e-4;
  const Y = dir.clone().normalize();
  let Z = v(normal).normalize();
  // Orthogonalise Z against Y (fall back if parallel).
  Z.sub(Y.clone().multiplyScalar(Z.dot(Y)));
  if (Z.lengthSq() < 1e-6) Z = new THREE.Vector3(1, 0, 0).sub(Y.clone().multiplyScalar(Y.x));
  Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const m = new THREE.Matrix4().makeBasis(
    X.multiplyScalar(width),
    Y.multiplyScalar(len),
    Z.multiplyScalar(thickness),
  );
  m.setPosition(A);
  geom.applyMatrix4(m);
  return geom;
}

/** Lathe from a radius profile r(t), t ∈ [0,1] along the length. */
function latheProfile(r: (t: number) => number, steps = 12, radial = 12) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(new THREE.Vector2(Math.max(r(t), 1e-4), t));
  }
  return new THREE.LatheGeometry(pts, radial);
}

/** Long bone: slim shaft with bulbous epiphyses (femur, humerus, phalanges…). */
export function longBone(a: V3, b: V3, r: number, opts: { epi?: number; epiB?: number; normal?: V3 } = {}) {
  const ea = opts.epi ?? 1.7;
  const eb = opts.epiB ?? ea;
  const g = latheProfile(
    (t) => {
      const capA = Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(t, 0.12) / 0.12, 2)));
      const capB = Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(1 - t, 0.12) / 0.12, 2)));
      const knobA = 1 + (ea - 1) * Math.exp(-Math.pow(t / 0.12, 2));
      const knobB = 1 + (eb - 1) * Math.exp(-Math.pow((1 - t) / 0.12, 2));
      return Math.min(capA, capB) * Math.max(knobA, knobB);
    },
    16,
    12,
  );
  return orientBetween(g, a, b, r, r, opts.normal);
}

/**
 * Muscle belly: spindle tapering to tendons at both ends, flattened along the surface normal.
 * `belly` shifts the widest point (0.5 = centre).
 */
export function spindle(
  a: V3,
  b: V3,
  width: number,
  thickness: number,
  normal: V3 = [0, 0, 1],
  opts: { belly?: number; tendon?: number; sharp?: number } = {},
) {
  const belly = opts.belly ?? 0.5;
  const tendon = opts.tendon ?? 0.12;
  const sharp = opts.sharp ?? 0.8;
  const g = latheProfile(
    (t) => {
      const u = t < belly ? (t / belly) * 0.5 : 0.5 + ((t - belly) / (1 - belly)) * 0.5;
      return tendon + (1 - tendon) * Math.pow(Math.sin(Math.PI * u), sharp);
    },
    14,
    14,
  );
  return orientBetween(g, a, b, width, thickness, normal);
}

/** Fan-shaped muscle (pectoralis, deltoid, trapezius…): several spindles merged. */
export function fan(
  origins: V3[],
  insertions: V3[] | V3,
  width: number,
  thickness: number,
  normal: V3 = [0, 0, 1],
) {
  const parts = origins.map((o, i) => {
    const ins = Array.isArray(insertions[0]) ? (insertions as V3[])[i] : (insertions as V3);
    return spindle(o, ins, width, thickness, normal, { tendon: 0.25, sharp: 0.6 });
  });
  return merge(parts);
}

/**
 * Tube with a variable radius along a smooth curve (vessels, nerves, intestines, oesophagus…).
 * Ends are capped so the tube looks solid when seen in isolation.
 */
export function tube(
  points: V3[],
  radius: number | ((t: number) => number),
  opts: { tubular?: number; radial?: number; closed?: boolean } = {},
) {
  const curve = new THREE.CatmullRomCurve3(points.map(v), !!opts.closed, 'centripetal');
  const tubular = opts.tubular ?? Math.max(8, Math.min(64, Math.round(curve.getLength() * 90)));
  const radial = opts.radial ?? 8;
  const rf = typeof radius === 'number' ? () => radius : radius;
  const frames = curve.computeFrenetFrames(tubular, !!opts.closed);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const r = rf(t);
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const s = Math.sin(ang);
      const c = -Math.cos(ang);
      N.set(0, 0, 0)
        .addScaledVector(frames.normals[i], c)
        .addScaledVector(frames.binormals[i], s)
        .normalize();
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nor.push(N.x, N.y, N.z);
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  if (!opts.closed) {
    // end caps (fan around the centre point)
    for (const end of [0, 1]) {
      const ci = pos.length / 3;
      curve.getPointAt(end, P);
      const T = curve.getTangentAt(end).multiplyScalar(end ? 1 : -1);
      pos.push(P.x, P.y, P.z);
      nor.push(T.x, T.y, T.z);
      const ring = end ? tubular * (radial + 1) : 0;
      for (let j = 0; j < radial; j++) {
        if (end) idx.push(ci, ring + j, ring + j + 1);
        else idx.push(ci, ring + j + 1, ring + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Deformed ellipsoid ("blob") for organs. `deform` receives the unit-sphere direction and may
 * return a radius multiplier, letting builders carve lobes, notches and flat surfaces.
 */
export function blob(
  center: V3,
  radii: V3,
  opts: { w?: number; h?: number; deform?: (d: THREE.Vector3) => number; rotate?: V3; noise?: number; seed?: number } = {},
) {
  const g = new THREE.SphereGeometry(1, opts.w ?? 20, opts.h ?? 14);
  g.deleteAttribute('uv');
  const p = g.attributes.position as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  const r = rng(opts.seed ?? 7);
  const phase = [r() * 10, r() * 10, r() * 10];
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    let k = opts.deform ? opts.deform(d) : 1;
    if (opts.noise)
      k *=
        1 +
        opts.noise *
          (Math.sin(d.x * 7 + phase[0]) * Math.sin(d.y * 6 + phase[1]) * Math.sin(d.z * 8 + phase[2]));
    p.setXYZ(i, d.x * radii[0] * k, d.y * radii[1] * k, d.z * radii[2] * k);
  }
  g.computeVertexNormals();
  if (opts.rotate) g.rotateX(opts.rotate[0]).rotateY(opts.rotate[1]).rotateZ(opts.rotate[2]);
  g.translate(center[0], center[1], center[2]);
  return g;
}

/** Part of a sphere shell (skull plates). Angles in radians, see THREE.SphereGeometry. */
export function shell(
  center: V3,
  radii: V3,
  phiStart: number,
  phiLength: number,
  thetaStart: number,
  thetaLength: number,
) {
  const g = new THREE.SphereGeometry(1, 18, 12, phiStart, phiLength, thetaStart, thetaLength);
  g.deleteAttribute('uv');
  g.scale(radii[0], radii[1], radii[2]);
  g.translate(center[0], center[1], center[2]);
  return g;
}

/** Simple box (vertebral processes, carpal-like blocks). */
export function box(center: V3, size: V3, rot: V3 = [0, 0, 0]) {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  g.deleteAttribute('uv');
  g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  g.translate(center[0], center[1], center[2]);
  return g;
}

/** Cylinder between two points. */
export function cylinder(a: V3, b: V3, r: number, radial = 12) {
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, 1);
  g.deleteAttribute('uv');
  g.translate(0, 0.5, 0);
  return orientBetween(g, a, b, r, r);
}

/** Flat extruded polygon (scapula, ilium wing, diaphragm dome slices). Points in a local plane. */
export function plate(outline: [number, number][], depth: number, transform: THREE.Matrix4) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.4,
    bevelSize: depth * 0.5,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  g.applyMatrix4(transform);
  return g;
}

/**
 * Thick flat plate through 3-D points (scapula body, diaphragm leaflets…). The outline is
 * projected onto the plane through the first three points.
 */
export function polyPlate(points: V3[], thickness: number) {
  const a = v(points[0]);
  const e1 = v(points[1]).sub(a).normalize();
  const n = new THREE.Vector3().crossVectors(e1, v(points[2]).sub(a)).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1);
  const outline = points.map((p) => {
    const d = v(p).sub(a);
    return [d.dot(e1), d.dot(e2)] as [number, number];
  });
  const m = new THREE.Matrix4().makeBasis(e1, e2, n).setPosition(a);
  return plate(outline, thickness, m);
}

/** Thin ribbon surface stretched between two curves (intercostal muscles, mesentery…). */
export function ribbon(a: V3[], b: V3[], samples = 24, inset = 0.15) {
  const ca = new THREE.CatmullRomCurve3(a.map(v));
  const cb = new THREE.CatmullRomCurve3(b.map(v));
  const pos: number[] = [];
  const idx: number[] = [];
  const rows = 3;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pa = ca.getPointAt(t);
    const pb = cb.getPointAt(t);
    for (let r = 0; r <= rows; r++) {
      const k = inset + (1 - 2 * inset) * (r / rows);
      const p = pa.clone().lerp(pb, k);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < samples; i++)
    for (let r = 0; r < rows; r++) {
      const q = i * (rows + 1) + r;
      const w = (i + 1) * (rows + 1) + r;
      idx.push(q, w, q + 1, w, w + 1, q + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Torus placed at a point and rotated (orbicularis muscles, sphincters, rings). */
export function ring(center: V3, radius: number, tubeR: number, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]) {
  const g = new THREE.TorusGeometry(radius, tubeR, 8, 28);
  g.deleteAttribute('uv');
  g.scale(scale[0], scale[1], scale[2]);
  g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  g.translate(center[0], center[1], center[2]);
  return g;
}

/** Merge heterogeneous geometries (strips uv / index differences first). */
export function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = geoms.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    return ng;
  });
  const out = mergeGeometries(clean, false);
  return out ?? clean[0];
}

/** Body-shape warp applied to every vertex of the female model (narrower shoulders, wider hips). */
export function femaleWarp(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const xs = (y: number) => {
    // piecewise-smooth width multiplier by height (metres in male coordinates)
    const knots: [number, number][] = [
      [0.0, 1.0],
      [0.5, 1.02],
      [0.8, 1.1],
      [0.95, 1.14],
      [1.08, 0.96],
      [1.2, 0.9],
      [1.45, 0.88],
      [1.6, 0.94],
      [1.9, 0.94],
    ];
    for (let i = 1; i < knots.length; i++) {
      if (y <= knots[i][0]) {
        const [y0, a] = knots[i - 1];
        const [y1, b] = knots[i];
        const t = (y - y0) / (y1 - y0);
        const s = t * t * (3 - 2 * t);
        return a + (b - a) * s;
      }
    }
    return knots[knots.length - 1][1];
  };
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setXYZ(i, p.getX(i) * xs(y), y * 0.94, p.getZ(i) * 0.95);
  }
  p.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
