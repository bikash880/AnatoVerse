/**
 * Builds every procedural structure for both sexes and checks for problems:
 * duplicate ids, empty geometry, NaN vertices, structures far outside the body.
 * Run: npm run validate
 */
import { getCatalog } from '../src/anatomy/catalog';
import { femaleWarp } from '../src/anatomy/geometry';
import * as THREE from 'three';
import type { Sex } from '../src/types';

let problems = 0;
for (const sex of ['male', 'female'] as Sex[]) {
  const cat = getCatalog(sex);
  const ids = new Set<string>();
  const perSystem: Record<string, number> = {};
  let verts = 0;
  const t0 = Date.now();
  for (const d of cat.list) {
    if (ids.has(d.id)) {
      console.error(`[${sex}] duplicate id ${d.id}`);
      problems++;
    }
    ids.add(d.id);
    perSystem[d.system] = (perSystem[d.system] ?? 0) + 1;
    const g = d.build();
    if (sex === 'female') femaleWarp(g);
    const p = g.attributes.position;
    if (!p || p.count === 0) {
      console.error(`[${sex}] empty geometry ${d.id}`);
      problems++;
      continue;
    }
    verts += p.count;
    const arr = p.array as Float32Array;
    let bad = false;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) bad = true;
    if (bad) {
      console.error(`[${sex}] NaN in ${d.id}`);
      problems++;
    }
    g.computeBoundingBox();
    const b = g.boundingBox!;
    if (b.min.y < -0.05 || b.max.y > 1.85 || Math.abs(b.min.x) > 0.6 || Math.abs(b.max.x) > 0.6 || Math.abs(b.min.z) > 0.4 || Math.abs(b.max.z) > 0.4) {
      console.error(`[${sex}] out of bounds ${d.id}`, b.min.toArray().map((x) => x.toFixed(2)), b.max.toArray().map((x) => x.toFixed(2)));
      problems++;
    }
  }
  console.log(`${sex}: ${cat.list.length} structures, ${verts.toLocaleString()} vertices, built in ${Date.now() - t0} ms`);
  console.log('  ', Object.entries(perSystem).map(([k, v]) => `${k}=${v}`).join('  '));
}
/*
 * Joint-gap check: every bone of the wrist / hand and ankle / foot (plus the forearm and leg
 * bones they attach to) must touch at least one other bone — nearest surface distance ≤ 1 mm.
 */
{
  const cat = getCatalog('male');
  const HAND_FOOT = /^(radius|ulna|tibia|fibula|scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|phalanx|talus|calcaneus|navicular|cuboid|.*cuneiform|metatarsal|toe-phalanx)/;
  const bones = cat.list.filter((d) => d.system === 'skeletal' && d.side === 'left');
  const pts = new Map<string, Float32Array>();
  for (const d of bones) {
    const g = d.build();
    pts.set(d.id, (g.index ? g.toNonIndexed() : g).attributes.position.array as Float32Array);
  }
  const tris = (a: Float32Array) => {
    const out: THREE.Triangle[] = [];
    for (let i = 0; i < a.length; i += 9)
      out.push(new THREE.Triangle(new THREE.Vector3(a[i], a[i + 1], a[i + 2]), new THREE.Vector3(a[i + 3], a[i + 4], a[i + 5]), new THREE.Vector3(a[i + 6], a[i + 7], a[i + 8])));
    return out;
  };
  /** Exact surface distance: 0 if an edge of one mesh pierces a triangle of the other. */
  const minDist = (A: Float32Array, B: Float32Array) => {
    const ta = tris(A);
    const tb = tris(B);
    const ray = new THREE.Ray();
    const hit = new THREE.Vector3();
    for (const [P, Q] of [[ta, tb], [tb, ta]]) {
      for (const t of P) {
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
          const len = u.distanceTo(v);
          ray.origin.copy(u);
          ray.direction.subVectors(v, u).normalize();
          for (const q of Q) if (ray.intersectTriangle(q.a, q.b, q.c, false, hit) && hit.distanceTo(u) <= len) return 0;
        }
      }
    }
    let best = Infinity;
    const c = new THREE.Vector3();
    for (const [P, Q] of [[ta, tb], [tb, ta]])
      for (const t of P) for (const p of [t.a, t.b, t.c]) for (const q of Q) best = Math.min(best, q.closestPointToPoint(p, c).distanceTo(p));
    return best;
  };
  // bounding boxes to skip far-away pairs quickly
  const box = new Map<string, number[]>();
  for (const [id, a] of pts) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], a[i + k]); b[k + 3] = Math.max(b[k + 3], a[i + k]); }
    box.set(id, b);
  }
  let gaps = 0;
  for (const d of bones.filter((b) => HAND_FOOT.test(b.id))) {
    const A = box.get(d.id)!;
    let best = Infinity;
    for (const o of bones) {
      if (o.id === d.id) continue;
      const B = box.get(o.id)!;
      if (A[0] - B[3] > 0.01 || B[0] - A[3] > 0.01 || A[1] - B[4] > 0.01 || B[1] - A[4] > 0.01 || A[2] - B[5] > 0.01 || B[2] - A[5] > 0.01) continue;
      best = Math.min(best, minDist(pts.get(d.id)!, pts.get(o.id)!));
      if (best <= 0.001) break;
    }
    if (best > 0.001) {
      console.error(`gap: ${d.id} is ${(best * 1000).toFixed(1)} mm from the nearest bone`);
      gaps++;
    }
  }
  console.log(gaps ? `joint-gap check: ${gaps} bone(s) not connected` : 'joint-gap check: all hand, wrist, foot and ankle bones connect');
  problems += gaps;
}
console.log(problems ? `${problems} problem(s)` : 'OK — no problems found');
process.exit(problems ? 1 : 0);
