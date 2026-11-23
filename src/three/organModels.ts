/**
 * High-detail procedural organ models for the Organ Deep-Dive screen.
 * Organ space: roughly unit-sized, centred on the origin, anterior surface facing +Z.
 * Each builder returns a group plus an `animate(t, strength)` callback (heartbeat, breathing…).
 * Internal structures (chambers, pyramids, rugae, bronchial tree, lens…) are revealed by the
 * cross-section clipping plane.
 */
import * as THREE from 'three';
import type { OrganId } from '../types';
import { blob, merge, ring, rng, shell, spindle, tube, type V3 } from '../anatomy/geometry';

export interface OrganBuild {
  group: THREE.Group;
  animate: (t: number) => void;
  dispose: () => void;
}

const materials: THREE.Material[] = [];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function mat(color: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.36,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.25,
    sheen: 0.6,
    sheenRoughness: 0.45,
    sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.4),
    side: THREE.DoubleSide,
    ...o,
  });
  materials.push(m);
  return m;
}

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  return m;
}

/** Point on a (deformed, rotated) ellipsoid surface — same transform order as `blob`. */
function surfacePoint(center: V3, radii: V3, dir: THREE.Vector3, rot: V3 = [0, 0, 0], deform?: (d: THREE.Vector3) => number, lift = 1.01) {
  const d = dir.clone().normalize();
  const k = (deform ? deform(d) : 1) * lift;
  const p = new THREE.Vector3(d.x * radii[0] * k, d.y * radii[1] * k, d.z * radii[2] * k);
  p.applyEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'));
  return p.add(new THREE.Vector3(...center));
}

/** Small branching vessels crawling over an ellipsoid surface. */
function surfaceVessels(center: V3, radii: V3, rot: V3, deform: ((d: THREE.Vector3) => number) | undefined, seed: number, count: number, dirBias: THREE.Vector3, r = 0.012) {
  const rand = rng(seed);
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    let d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    if (d.dot(dirBias) < 0) d.negate();
    const pts: V3[] = [];
    const step = new THREE.Vector3(rand() - 0.5, -0.6 - rand() * 0.4, rand() - 0.5).normalize().multiplyScalar(0.11);
    for (let k = 0; k < 7; k++) {
      const p = surfacePoint(center, radii, d, rot, deform, 1.012);
      pts.push([p.x, p.y, p.z]);
      d = d.add(step.clone().add(new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).multiplyScalar(0.08))).normalize();
    }
    out.push(tube(pts, (t) => r * (1 - t * 0.7), { radial: 6, tubular: 24 }));
  }
  return merge(out);
}

/* =============================== HEART =============================== */
function heart(): OrganBuild {
  const g = new THREE.Group();
  const muscle = mat('#B23A44', { sheenColor: new THREE.Color('#ff9aa4') });
  const muscle2 = mat('#C24B53');
  const atrium = mat('#BE5A63');
  const artery = mat('#D7353C', { clearcoat: 1, roughness: 0.25 });
  const vein = mat('#3563D0', { clearcoat: 1, roughness: 0.25 });
  const fat = mat('#E8C46A', { roughness: 0.5, sheen: 0.2 });
  const inner = mat('#6E1C24', { roughness: 0.6, clearcoat: 0.2 });

  const taper = (d: THREE.Vector3) => 1 - 0.36 * Math.pow(Math.max(0, -d.y), 1.6) + 0.04 * Math.max(0, d.y);
  const LVc: V3 = [0.22, -0.2, -0.05], LVr: V3 = [0.5, 0.74, 0.5], LVrot: V3 = [0.15, 0.2, 0.45];
  const RVc: V3 = [-0.12, -0.12, 0.2], RVr: V3 = [0.5, 0.62, 0.42], RVrot: V3 = [0.15, 0.2, 0.45];

  const ventricles = new THREE.Group();
  ventricles.name = 'ventricles';
  ventricles.add(mesh(blob(LVc, LVr, { w: 64, h: 48, rotate: LVrot, deform: taper, noise: 0.015, seed: 2 }), muscle, 'Left ventricle'));
  ventricles.add(mesh(blob(RVc, RVr, { w: 64, h: 48, rotate: RVrot, deform: taper, noise: 0.015, seed: 3 }), muscle2, 'Right ventricle'));
  // chamber cavities (seen in cross-section)
  ventricles.add(mesh(blob([0.24, -0.18, -0.05], [0.28, 0.5, 0.28], { rotate: LVrot, deform: taper }), inner, 'LV cavity'));
  ventricles.add(mesh(blob([-0.14, -0.1, 0.26], [0.3, 0.4, 0.2], { rotate: RVrot, deform: taper }), inner, 'RV cavity'));
  // coronary arteries & cardiac veins in fat-lined grooves
  ventricles.add(mesh(tube([[-0.05, 0.32, 0.42], [-0.4, 0.17, 0.48], [-0.66, -0.12, 0.28], [-0.6, -0.35, -0.12], [-0.2, -0.42, -0.42]], 0.035), artery, 'RCA'));
  ventricles.add(mesh(tube([[0.08, 0.32, 0.44], [0.1, 0.02, 0.6], [0.24, -0.38, 0.56], [0.44, -0.8, 0.3]], (t) => 0.034 - t * 0.016), artery, 'LAD'));
  ventricles.add(mesh(tube([[0.12, 0.3, 0.38], [0.46, 0.25, 0.22], [0.66, 0.04, -0.1], [0.5, -0.12, -0.46]], 0.028), artery, 'Circumflex'));
  ventricles.add(mesh(tube([[0.16, 0.3, 0.42], [0.17, 0.02, 0.61], [0.3, -0.38, 0.55], [0.48, -0.78, 0.28]], (t) => 0.026 - t * 0.012), vein, 'Great cardiac vein'));
  ventricles.add(mesh(tube([[-0.02, 0.33, 0.43], [-0.38, 0.2, 0.47], [-0.64, -0.08, 0.3]], 0.05), fat, 'AV groove fat'));
  ventricles.add(mesh(surfaceVessels(LVc, LVr, LVrot, taper, 11, 16, new THREE.Vector3(0.6, 0, 0.6)), artery, 'Surface arteries'));
  ventricles.add(mesh(surfaceVessels(RVc, RVr, RVrot, taper, 17, 12, new THREE.Vector3(-0.3, 0, 1), 0.01), vein, 'Surface veins'));
  g.add(ventricles);

  const atria = new THREE.Group();
  atria.name = 'atria';
  atria.add(mesh(blob([-0.55, 0.32, 0.05], [0.34, 0.36, 0.34], { w: 48, h: 36, noise: 0.02, seed: 5 }), atrium, 'Right atrium'));
  atria.add(mesh(blob([-0.3, 0.56, 0.36], [0.17, 0.1, 0.13], { rotate: [0.3, 0, -0.4], noise: 0.08 }), atrium, 'Right auricle'));
  atria.add(mesh(blob([0.25, 0.42, -0.38], [0.38, 0.27, 0.3], { w: 48, h: 36, noise: 0.02, seed: 6 }), atrium, 'Left atrium'));
  atria.add(mesh(blob([0.52, 0.45, 0.14], [0.14, 0.09, 0.13], { rotate: [0, 0, 0.5], noise: 0.08 }), atrium, 'Left auricle'));
  atria.add(mesh(blob([-0.55, 0.32, 0.05], [0.2, 0.22, 0.2]), inner, 'RA cavity'));
  g.add(atria);

  // great vessels
  g.add(mesh(tube([[0.0, 0.2, 0.05], [-0.05, 0.7, 0.1], [0.0, 1.08, 0.02], [0.22, 1.18, -0.15], [0.38, 1.02, -0.35], [0.42, 0.6, -0.5], [0.42, 0.05, -0.55]], 0.17, { radial: 24 }), artery, 'Aorta'));
  g.add(mesh(merge([
    tube([[0.04, 1.14, 0.0], [-0.06, 1.35, 0.04], [-0.1, 1.55, 0.05]], 0.07),
    tube([[0.18, 1.2, -0.08], [0.2, 1.4, -0.06], [0.2, 1.58, -0.05]], 0.055),
    tube([[0.31, 1.14, -0.22], [0.42, 1.35, -0.25], [0.5, 1.52, -0.26]], 0.06),
  ]), artery, 'Arch branches'));
  g.add(mesh(merge([
    tube([[0.12, 0.05, 0.42], [0.18, 0.55, 0.42], [0.15, 0.82, 0.15]], 0.15, { radial: 20 }),
    tube([[0.15, 0.82, 0.15], [0.5, 0.86, -0.05], [0.82, 0.8, -0.15]], 0.1),
    tube([[0.15, 0.82, 0.15], [-0.2, 0.86, -0.22], [-0.62, 0.8, -0.32]], 0.1),
  ]), vein, 'Pulmonary trunk'));
  g.add(mesh(tube([[-0.5, 1.3, 0.0], [-0.52, 0.85, 0.04], [-0.52, 0.5, 0.06]], 0.12, { radial: 18 }), vein, 'Superior vena cava'));
  g.add(mesh(tube([[-0.48, -0.8, -0.15], [-0.5, -0.45, -0.08], [-0.52, -0.1, -0.02]], 0.13, { radial: 18 }), vein, 'Inferior vena cava'));
  g.add(mesh(merge([
    tube([[0.75, 0.52, -0.45], [0.45, 0.46, -0.42]], 0.07),
    tube([[0.75, 0.3, -0.45], [0.45, 0.36, -0.42]], 0.07),
    tube([[-0.3, 0.52, -0.52], [0.02, 0.46, -0.44]], 0.07),
    tube([[-0.3, 0.3, -0.52], [0.02, 0.36, -0.44]], 0.07),
  ]), artery, 'Pulmonary veins'));

  return {
    group: g,
    animate: (t) => {
      // lub-dub: atrial kick then ventricular systole, ~70 bpm
      const ph = (t % 0.86) / 0.86;
      const sys = Math.exp(-Math.pow((ph - 0.32) / 0.09, 2));
      const atr = Math.exp(-Math.pow((ph - 0.12) / 0.06, 2));
      const v = 1 - 0.065 * sys;
      ventricles.scale.set(v, 1 - 0.04 * sys, v);
      const a = 1 - 0.07 * atr + 0.03 * sys;
      atria.scale.setScalar(a);
    },
    dispose: () => {},
  };
}

/* =============================== LUNGS =============================== */
function lungs(): OrganBuild {
  const g = new THREE.Group();
  const lobeMats = ['#E89AA6', '#EBA6B0', '#E3909D', '#EAA1AC', '#E2939F'].map((c) => mat(c, { roughness: 0.5, sheen: 0.8 }));
  const cart = mat('#DDE3E8', { roughness: 0.35 });
  const airway = mat('#F0C9CF', { roughness: 0.45 });
  const artery = mat('#3563D0');
  const vein = mat('#D7353C');
  const diaphragm = mat('#B8434C', { transparent: true, opacity: 0.55, depthWrite: false });

  const lobes: [string, V3, V3, number][] = [
    ['Right upper lobe', [-0.56, 0.36, 0.02], [0.45, 0.56, 0.46], -1],
    ['Right middle lobe', [-0.62, -0.2, 0.25], [0.42, 0.28, 0.3], -1],
    ['Right lower lobe', [-0.6, -0.32, -0.15], [0.47, 0.56, 0.43], -1],
    ['Left upper lobe', [0.56, 0.24, 0.06], [0.43, 0.66, 0.43], 1],
    ['Left lower lobe', [0.6, -0.34, -0.13], [0.45, 0.55, 0.42], 1],
  ];
  const lungGroup = new THREE.Group();
  lungGroup.name = 'lobes';
  lobes.forEach(([name, c, r, s], i) => {
    lungGroup.add(
      mesh(
        blob(c, r, {
          w: 56,
          h: 40,
          noise: 0.02,
          seed: 30 + i,
          deform: (d) => {
            let k = 1;
            if (-d.x * s > 0.4) k *= 0.82 + 0.18 * (1 - (-d.x * s - 0.4));
            if (name === 'Left upper lobe') k *= 1 - 0.3 * smooth(0.0, 0.6, -d.x) * smooth(0.0, 0.6, d.z) * Math.exp(-Math.pow((d.y + 0.35) / 0.35, 2)); // cardiac notch
            if (d.y < -0.7) k *= 0.9;
            return k;
          },
        }),
        lobeMats[i],
        name,
      ),
    );
  });
  g.add(lungGroup);

  // trachea with cartilage rings and bronchial tree (visible with cross-section)
  const rings = Array.from({ length: 11 }, (_, i) => ring([0, 1.25 - i * 0.065, 0.06], 0.105, 0.018, [Math.PI / 2, 0, 0]));
  g.add(mesh(merge([tube([[0, 1.32, 0.06], [0, 0.9, 0.04], [0, 0.55, 0.0]], 0.095, { radial: 20 }), ...rings]), cart, 'Trachea'));
  const tree: THREE.BufferGeometry[] = [];
  const rand = rng(77);
  const inside = (p: THREE.Vector3) =>
    lobes.some(([, c, r]) => Math.pow((p.x - c[0]) / (r[0] * 0.85), 2) + Math.pow((p.y - c[1]) / (r[1] * 0.85), 2) + Math.pow((p.z - c[2]) / (r[2] * 0.85), 2) < 1);
  const branch = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const b = a.clone().addScaledVector(dir, len);
    if (!inside(b)) return;
    tree.push(tube([[a.x, a.y, a.z], [b.x, b.y, b.z]], r, { radial: 8, tubular: 4 }));
    if (depth === 0) return;
    for (let k = 0; k < 2; k++) {
      const nd = dir.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.6, rand() - 0.5).multiplyScalar(0.9)).normalize();
      branch(b, nd, len * 0.72, r * 0.7, depth - 1);
    }
  };
  tree.push(tube([[0, 0.55, 0], [-0.32, 0.4, -0.02]], 0.075), tube([[0, 0.55, 0], [0.36, 0.34, -0.03]], 0.068));
  branch(new THREE.Vector3(-0.32, 0.4, -0.02), new THREE.Vector3(-0.5, 0.8, 0.1).normalize(), 0.2, 0.05, 4);
  branch(new THREE.Vector3(-0.32, 0.4, -0.02), new THREE.Vector3(-0.3, -0.9, 0.1).normalize(), 0.3, 0.055, 4);
  branch(new THREE.Vector3(0.36, 0.34, -0.03), new THREE.Vector3(0.45, 0.8, 0.1).normalize(), 0.2, 0.05, 4);
  branch(new THREE.Vector3(0.36, 0.34, -0.03), new THREE.Vector3(0.3, -0.9, 0.0).normalize(), 0.3, 0.05, 4);
  g.add(mesh(merge(tree), airway, 'Bronchial tree'));
  g.add(mesh(merge([tube([[-0.05, 0.62, 0.15], [-0.25, 0.42, 0.1], [-0.38, 0.36, 0.05]], 0.05), tube([[0.05, 0.62, 0.15], [0.28, 0.42, 0.1], [0.4, 0.32, 0.05]], 0.05)]), artery, 'Pulmonary arteries'));
  g.add(mesh(merge([tube([[-0.05, 0.25, -0.12], [-0.3, 0.2, -0.1]], 0.04), tube([[0.05, 0.25, -0.12], [0.32, 0.18, -0.1]], 0.04)]), vein, 'Pulmonary veins'));
  g.add(mesh(shell([0, -0.95, -0.02], [1.15, 0.38, 0.72], 0, Math.PI * 2, 0, Math.PI / 2), diaphragm, 'Diaphragm'));

  return {
    group: g,
    animate: (t) => {
      const b = 0.5 - 0.5 * Math.cos((t / 4.2) * Math.PI * 2);
      lungGroup.scale.set(1 + 0.05 * b, 1 + 0.07 * b, 1 + 0.05 * b);
      lungGroup.position.y = -0.04 * b;
    },
    dispose: () => {},
  };
}

/* =============================== BRAIN =============================== */
function gyri(d: THREE.Vector3, seed = 0) {
  const g =
    Math.sin(d.x * 17 + Math.sin(d.z * 11 + seed) * 2.2) *
    Math.sin(d.y * 15 + Math.sin(d.x * 9 + seed) * 2.0) *
    Math.sin(d.z * 16 + Math.sin(d.y * 10 + seed) * 2.4);
  return 1 - 0.06 * Math.pow(1 - Math.min(1, Math.abs(g) * 2.2), 4);
}

function brain(): OrganBuild {
  const g = new THREE.Group();
  const cortex = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.4, sheen: 0.7, sheenColor: new THREE.Color('#ffd6dc'), side: THREE.DoubleSide });
  materials.push(cortex);
  const white = mat('#F1E6DA', { roughness: 0.5 });
  const cereb = mat('#D99AA3', { roughness: 0.5 });
  const stem = mat('#E2B9A8', { roughness: 0.45 });
  const ventricle = mat('#7FC4E8', { roughness: 0.3 });
  const artery = mat('#D7353C');

  const lobeColor = (p: THREE.Vector3) => {
    // subtle lobe tints: frontal / parietal / temporal / occipital
    if (p.z > 0.25 && p.y > -0.15) return new THREE.Color('#EBB3BA');
    if (p.y < -0.12 && p.z > -0.45) return new THREE.Color('#E5A9A3');
    if (p.z < -0.5) return new THREE.Color('#DDA4B6');
    return new THREE.Color('#E9B9B4');
  };
  for (const s of [-1, 1]) {
    const geom = blob([s * 0.33, 0.1, 0], [0.62, 0.72, 0.97], {
      w: 160,
      h: 120,
      deform: (d) => {
        let k = gyri(d, s);
        if (-d.x * s > 0.5) k *= Math.min(1, 0.52 / (-d.x * s)); // medial flat surface
        if (d.y < -0.35 && d.z < 0.2 && d.z > -0.6) k *= 0.86; // temporal underside
        // central sulcus groove
        const cs = Math.abs(d.z - 0.05 - 0.25 * d.y);
        if (d.y > 0 && cs < 0.05) k *= 0.965;
        return k;
      },
    });
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const c = lobeColor(p);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(mesh(geom, cortex, s < 0 ? 'Right cerebral hemisphere' : 'Left cerebral hemisphere'));
    g.add(mesh(blob([s * 0.3, 0.05, 0], [0.48, 0.56, 0.78]), white, 'White matter'));
    g.add(mesh(blob([s * 0.1, 0.1, 0.0], [0.06, 0.12, 0.35], { rotate: [0.2, 0, 0] }), ventricle, 'Lateral ventricle'));
  }
  g.add(mesh(blob([0, -0.47, -0.66], [0.56, 0.3, 0.36], { w: 96, h: 64, deform: (d) => 1 - 0.035 * Math.pow(1 - Math.abs(Math.sin(d.y * 38)), 6) - (Math.abs(d.x) < 0.08 ? 0.05 : 0) }), cereb, 'Cerebellum'));
  g.add(mesh(merge([tube([[0, -0.12, -0.12], [0, -0.55, -0.28], [0, -1.05, -0.34]], (t) => 0.15 - t * 0.05, { radial: 20 }), blob([0, -0.45, -0.14], [0.2, 0.17, 0.17])]), stem, 'Brainstem'));
  g.add(mesh(tube([[0, 0.25, 0.42], [0, 0.42, 0.1], [0, 0.4, -0.3], [0, 0.22, -0.48]], (t) => 0.06 + 0.03 * Math.sin(Math.PI * t), { radial: 14 }), white, 'Corpus callosum'));
  g.add(mesh(merge([
    tube([[0, -0.25, 0.2], [0.1, -0.3, 0.45], [0.18, -0.3, 0.75]], 0.022),
    tube([[0, -0.25, 0.2], [-0.1, -0.3, 0.45], [-0.18, -0.3, 0.75]], 0.022),
    tube([[0, -0.32, 0.05], [0.25, -0.35, 0.2], [0.45, -0.25, 0.3]], 0.02),
    tube([[0, -0.32, 0.05], [-0.25, -0.35, 0.2], [-0.45, -0.25, 0.3]], 0.02),
    tube([[0, -0.6, -0.15], [0, -0.35, -0.05], [0, -0.3, 0.05]], 0.022),
  ]), artery, 'Circle of Willis'));

  return {
    group: g,
    animate: (t) => {
      // gentle "activity" shimmer
      cortex.emissive.set('#ff6b8a');
      cortex.emissiveIntensity = 0.04 + 0.04 * (0.5 + 0.5 * Math.sin(t * 2.4));
    },
    dispose: () => {},
  };
}

/* =============================== KIDNEYS =============================== */
function kidneys(): OrganBuild {
  const g = new THREE.Group();
  const cortex = mat('#9E3B36', { roughness: 0.4 });
  const medulla = mat('#6F2226', { roughness: 0.5 });
  const pelvis = mat('#EBD8A8', { roughness: 0.4 });
  const artery = mat('#D7353C');
  const vein = mat('#3563D0');
  const adrenal = mat('#D9A441', { roughness: 0.5 });
  const ureter = mat('#E8C9A0');

  const pulse = new THREE.Group();
  for (const s of [-1, 1]) {
    const c: V3 = [s * 0.62, s > 0 ? 0.06 : -0.04, 0];
    const rot: V3 = [0, -0.35 * s, -0.18 * s];
    g.add(mesh(blob(c, [0.33, 0.62, 0.24], { w: 64, h: 48, rotate: rot, noise: 0.012, deform: (d) => 1 - 0.34 * smooth(0.35, 0.85, -d.x * s) * Math.exp(-Math.pow(d.y / 0.28, 2)) }), cortex, s > 0 ? 'Left kidney' : 'Right kidney'));
    // pyramids
    const pyr: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 7) * Math.PI * 0.95 - Math.PI * 0.475;
      const outer = new THREE.Vector3(c[0] + s * 0.18 * Math.cos(a), c[1] + 0.46 * Math.sin(a), c[2]);
      const innerP = new THREE.Vector3(c[0] - s * 0.08, c[1] + 0.12 * Math.sin(a), c[2]);
      pyr.push(spindle([innerP.x, innerP.y, innerP.z], [outer.x, outer.y, outer.z], 0.07, 0.06, [0, 0, 1], { belly: 0.85, tendon: 0.05 }));
    }
    g.add(mesh(merge(pyr), medulla, 'Renal pyramids'));
    g.add(mesh(merge([blob([c[0] - s * 0.14, c[1], c[2]], [0.09, 0.14, 0.07]), tube([[c[0] - s * 0.14, c[1] - 0.1, c[2]], [c[0] - s * 0.22, c[1] - 0.3, c[2] + 0.03], [s * 0.25, -0.4, 0.04]], 0.035)]), pelvis, 'Renal pelvis'));
    g.add(mesh(tube([[s * 0.25, -0.4, 0.04], [s * 0.2, -0.9, 0.06], [s * 0.15, -1.35, 0.08]], 0.032), ureter, 'Ureter'));
    pulse.add(mesh(tube([[s * 0.06, 0.06, -0.06], [s * 0.25, 0.04, 0.02], [c[0] - s * 0.2, c[1] + 0.02, c[2] + 0.02]], 0.05), artery, 'Renal artery'));
    pulse.add(mesh(tube([[-0.12 + s * 0.02, -0.02, 0.06], [s * 0.25, -0.02, 0.1], [c[0] - s * 0.2, c[1] - 0.04, c[2] + 0.06]], 0.06), vein, 'Renal vein'));
    g.add(mesh(blob([c[0] - s * 0.06, c[1] + 0.68, c[2]], [0.2, 0.13, 0.08], { deform: (d) => (d.y > 0 ? 1 - 0.5 * d.y : 1), noise: 0.05 }), adrenal, 'Adrenal gland'));
  }
  pulse.add(mesh(tube([[0.06, 1.1, -0.08], [0.06, 0.0, -0.06], [0.04, -1.3, -0.04]], 0.1, { radial: 18 }), artery, 'Abdominal aorta'));
  pulse.add(mesh(tube([[-0.14, 1.1, 0.04], [-0.14, 0.0, 0.05], [-0.12, -1.3, 0.05]], 0.11, { radial: 18 }), vein, 'Inferior vena cava'));
  g.add(pulse);
  return {
    group: g,
    animate: (t) => {
      const p = 1 + 0.04 * Math.exp(-Math.pow(((t % 0.86) / 0.86 - 0.3) / 0.08, 2));
      pulse.scale.set(p, 1, p);
    },
    dispose: () => {},
  };
}

/* =============================== LIVER =============================== */
function liver(): OrganBuild {
  const g = new THREE.Group();
  const liv = mat('#8C3A30', { roughness: 0.3, sheen: 0.5 });
  const liv2 = mat('#96433A', { roughness: 0.3 });
  const gb = mat('#5E8F3E', { roughness: 0.3 });
  const bile = mat('#7FB24A');
  const artery = mat('#D7353C');
  const vein = mat('#3563D0');
  const portal = mat('#6B4FC7');
  const lig = mat('#F1E2C8', { roughness: 0.6 });

  const body = new THREE.Group();
  body.add(mesh(blob([-0.3, 0.0, 0.0], [0.78, 0.56, 0.62], { w: 72, h: 52, noise: 0.012, deform: (d) => (d.y < -0.2 ? 0.8 : 1) * (d.y > 0.4 ? 1.04 : 1) }), liv, 'Right lobe'));
  body.add(mesh(blob([0.52, 0.14, 0.06], [0.58, 0.3, 0.44], { w: 64, h: 44, deform: (d) => (d.x > 0 ? 1 - 0.45 * d.x : 1) * (d.y < -0.2 ? 0.82 : 1) }), liv2, 'Left lobe'));
  body.add(mesh(blob([0.05, -0.1, -0.38], [0.2, 0.22, 0.16]), liv2, 'Caudate lobe'));
  body.add(mesh(blob([0.08, -0.32, 0.28], [0.17, 0.12, 0.17]), liv2, 'Quadrate lobe'));
  body.add(mesh(tube([[0.22, 0.58, 0.18], [0.24, 0.35, 0.6], [0.2, -0.1, 0.62], [0.18, -0.38, 0.55]], 0.018), lig, 'Falciform ligament'));
  g.add(body);
  g.add(mesh(blob([-0.32, -0.5, 0.45], [0.13, 0.24, 0.13], { rotate: [0.8, 0, 0.2], deform: (d) => (d.y > 0 ? 0.8 : 1) }), gb, 'Gallbladder'));
  g.add(mesh(tube([[-0.2, -0.45, 0.25], [-0.05, -0.55, 0.15], [0.0, -0.95, 0.12]], 0.035), bile, 'Common bile duct'));
  g.add(mesh(tube([[0.25, -1.0, 0.05], [0.12, -0.6, 0.0], [0.05, -0.38, -0.05], [-0.15, -0.3, -0.05]], 0.07), portal, 'Hepatic portal vein'));
  g.add(mesh(tube([[0.4, -0.95, 0.12], [0.2, -0.6, 0.1], [0.06, -0.4, 0.06], [-0.1, -0.32, 0.05]], 0.032), artery, 'Hepatic artery proper'));
  g.add(mesh(tube([[0.15, -0.9, -0.42], [0.12, 0.0, -0.45], [0.1, 0.9, -0.42]], 0.13, { radial: 18 }), vein, 'Inferior vena cava'));
  g.add(mesh(merge([tube([[0.12, 0.35, -0.45], [-0.35, 0.3, -0.2]], 0.05), tube([[0.12, 0.38, -0.45], [0.5, 0.3, -0.1]], 0.045), tube([[0.12, 0.38, -0.45], [0.1, 0.25, 0.05]], 0.04)]), vein, 'Hepatic veins'));
  return {
    group: g,
    animate: (t) => {
      const b = 0.5 - 0.5 * Math.cos((t / 4.2) * Math.PI * 2);
      g.position.y = -0.06 * b; // moves with the diaphragm
    },
    dispose: () => {},
  };
}

/* =============================== STOMACH =============================== */
/** Tube whose radius varies with angle (rugae folds). */
function ruggedTube(points: V3[], radius: (t: number) => number, folds: number) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, 120, 1, 48, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const frames = curve.computeFrenetFrames(120, false);
  const P = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    curve.getPointAt(t, C);
    for (let j = 0; j <= 48; j++) {
      const idx = i * 49 + j;
      const a = (j / 48) * Math.PI * 2;
      const r = radius(t) * (1 + 0.08 * Math.pow(Math.abs(Math.sin(a * folds / 2 + t * 6)), 3));
      P.copy(C).addScaledVector(frames.normals[i], -Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
      pos.setXYZ(idx, P.x, P.y, P.z);
    }
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function stomach(): OrganBuild {
  const g = new THREE.Group();
  const wall = mat('#E39A8F', { roughness: 0.35, sheen: 0.8 });
  const mucosa = mat('#C9606A', { roughness: 0.5 });
  const oes = mat('#D98880');
  const duo = mat('#E7B08F');
  const artery = mat('#D7353C');
  const pts: V3[] = [[-0.05, 0.62, 0], [0.3, 0.75, -0.05], [0.56, 0.42, 0.0], [0.52, -0.1, 0.1], [0.26, -0.45, 0.15], [-0.15, -0.5, 0.15], [-0.45, -0.36, 0.1], [-0.62, -0.25, 0.05]];
  const rad = (t: number) => 0.14 + 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.12)) - 0.2 * Math.max(0, t - 0.7) * 3.3;
  const body = new THREE.Group();
  body.add(mesh(tube(pts, rad, { radial: 48, tubular: 120 }), wall, 'Stomach wall'));
  body.add(mesh(ruggedTube(pts, (t) => rad(t) * 0.86, 14), mucosa, 'Gastric rugae'));
  body.add(mesh(ring([-0.62, -0.25, 0.05], 0.1, 0.035, [0, Math.PI / 2, 0.3]), wall, 'Pyloric sphincter'));
  g.add(body);
  g.add(mesh(tube([[-0.2, 1.3, -0.05], [-0.1, 0.95, -0.02], [-0.05, 0.62, 0]], 0.09, { radial: 20 }), oes, 'Oesophagus'));
  g.add(mesh(tube([[-0.62, -0.25, 0.05], [-0.88, -0.3, 0.0], [-0.92, -0.7, -0.05], [-0.62, -0.92, -0.05], [-0.3, -0.85, -0.05]], 0.11, { radial: 20 }), duo, 'Duodenum'));
  g.add(mesh(merge([
    tube([[0.15, 0.62, 0.15], [0.05, 0.3, 0.32], [-0.2, 0.0, 0.32], [-0.5, -0.15, 0.25]], 0.02),
    tube([[0.75, 0.45, 0.1], [0.8, 0.0, 0.2], [0.55, -0.55, 0.3], [0.0, -0.8, 0.3], [-0.5, -0.6, 0.2]], 0.022),
  ]), artery, 'Gastric arteries'));
  return {
    group: g,
    animate: (t) => {
      const w = Math.sin(t * 1.6);
      body.scale.set(1 + 0.025 * w, 1 - 0.015 * w, 1 + 0.025 * Math.sin(t * 1.6 + 1));
    },
    dispose: () => {},
  };
}

/* =============================== EYE =============================== */
function eye(): OrganBuild {
  const g = new THREE.Group();
  const globe = new THREE.Group();
  const sclera = mat('#F4EFE8', { roughness: 0.3, sheen: 0.3 });
  const cornea = mat('#CFE8F5', { transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, depthWrite: false });
  const retina = mat('#E0743D', { roughness: 0.5 });
  const lens = mat('#F3E6B8', { transparent: true, opacity: 0.55, roughness: 0.1 });
  const pupil = mat('#050505', { roughness: 0.2 });
  const nerve = mat('#F2CC3D');
  const muscle = mat('#B23A44');
  const vessel = mat('#C9303A');

  globe.add(mesh(blob([0, 0, 0], [0.6, 0.6, 0.6], { w: 64, h: 48 }), sclera, 'Sclera'));
  globe.add(mesh(shell([0, 0, 0], [0.585, 0.585, 0.585], 0, Math.PI * 2, 0.6, Math.PI - 0.6).rotateX(Math.PI / 2), retina, 'Retina'));
  globe.add(mesh(shell([0, 0.16, 0], [0.46, 0.5, 0.46], 0, Math.PI * 2, 0, 0.75).rotateX(Math.PI / 2), cornea, 'Cornea'));
  // iris with radial colour variation
  const irisG = new THREE.RingGeometry(0.11, 0.3, 64, 6);
  const ic = new Float32Array(irisG.attributes.position.count * 3);
  const ip = irisG.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ip.count; i++) {
    const x = ip.getX(i);
    const y = ip.getY(i);
    const a = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    const c = new THREE.Color('#3F7FA0').lerp(new THREE.Color('#8B5A2B'), (0.5 + 0.5 * Math.sin(a * 40)) * 0.35 + (r < 0.16 ? 0.5 : 0));
    ic.set([c.r, c.g, c.b], i * 3);
  }
  irisG.setAttribute('color', new THREE.BufferAttribute(ic, 3));
  irisG.translate(0, 0, 0.5);
  const irisMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.6, side: THREE.DoubleSide });
  materials.push(irisMat);
  globe.add(mesh(irisG, irisMat, 'Iris'));
  globe.add(mesh(new THREE.CircleGeometry(0.11, 48).translate(0, 0, 0.495), pupil, 'Pupil'));
  globe.add(mesh(blob([0, 0, 0.4], [0.2, 0.2, 0.09]), lens, 'Lens'));
  globe.add(mesh(surfaceVessels([0, 0, 0], [0.6, 0.6, 0.6], [0, 0, 0], undefined, 5, 14, new THREE.Vector3(0.3, 0, 0.5), 0.006), vessel, 'Scleral vessels'));
  g.add(globe);
  g.add(mesh(tube([[0.06, 0, -0.56], [0.12, 0.0, -0.9], [0.2, 0.0, -1.35]], 0.12, { radial: 20 }), nerve, 'Optic nerve'));
  const apex: V3 = [0.2, 0, -1.3];
  g.add(mesh(merge([
    spindle(apex, [0, 0.42, 0.22], 0.12, 0.05, [0, 1, 0]),
    spindle(apex, [0, -0.42, 0.22], 0.12, 0.05, [0, -1, 0]),
    spindle(apex, [0.45, 0, 0.18], 0.12, 0.05, [1, 0, 0]),
    spindle(apex, [-0.42, 0, 0.22], 0.12, 0.05, [-1, 0, 0]),
  ]), muscle, 'Rectus muscles'));
  g.add(mesh(merge([spindle([-0.5, 0.45, 0.35], [0.05, 0.5, -0.1], 0.06, 0.03, [0, 1, 0]), spindle([-0.45, -0.5, 0.2], [0.3, -0.45, -0.2], 0.06, 0.03, [0, -1, 0])]), muscle, 'Oblique muscles'));
  return {
    group: g,
    animate: (t) => {
      // occasional saccades
      const k = Math.floor(t / 1.6);
      const r = rng(k + 1);
      globe.rotation.y = THREE.MathUtils.damp(globe.rotation.y, (r() - 0.5) * 0.35, 12, 0.016);
      globe.rotation.x = THREE.MathUtils.damp(globe.rotation.x, (r() - 0.5) * 0.2, 12, 0.016);
    },
    dispose: () => {},
  };
}

const BUILDERS: Record<OrganId, () => OrganBuild> = { heart, lungs, brain, kidneys, liver, stomach, eye };

export function buildOrgan(id: OrganId): OrganBuild {
  materials.length = 0;
  const b = BUILDERS[id]();
  const mats = [...materials];
  return {
    ...b,
    dispose: () => {
      b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/** Apply (or clear) a clipping plane on every material of an organ. */
export function setClipping(group: THREE.Object3D, plane: THREE.Plane | null) {
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m) return;
    m.clippingPlanes = plane ? [plane] : null;
    m.needsUpdate = true;
  });
}
