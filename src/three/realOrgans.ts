/**
 * Real organ models (BodyParts3D GLBs built by scripts/build-models.ts) for the Organ Deep-Dive:
 * PBR tissue materials per part role, plus "Live" physiology:
 *   heart    – atrial then ventricular contraction at 72 bpm; blood particles in the great vessels
 *   lungs    – breathing at 14 / min, lobes expand and the diaphragm descends
 *   brain    – neural pulses travelling across the cortex (shader)
 *   stomach  – peristaltic waves along the stomach's long axis (shader)
 *   kidneys  – particles flowing in renal arteries, aorta, IVC and ureters
 *   liver    – moves with breathing
 *   eye      – pupil constricts / dilates, the globe glances around
 */
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import type { Hotspot, OrganId } from '../types';
import { gltf } from './meshRegistry';
import { getModelManifest, modelUrl } from '../modelsInit';
import { tissuePreset, type TissuePreset } from './tissue';

// BVH-accelerated raycasting (hotspot occlusion on 180k-vertex organs stays cheap)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
declare module 'three' {
  interface BufferGeometry {
    computeBoundsTree: typeof computeBoundsTree;
    disposeBoundsTree: typeof disposeBoundsTree;
  }
}

export interface RealOrgan {
  group: THREE.Group;
  hotspots: Hotspot[];
  /** advance animation; `live` toggles physiology */
  animate: (t: number, dt: number, live: boolean) => void;
  dispose: () => void;
}

export const hasRealOrgan = (id: OrganId) => !!getModelManifest()?.organs?.[id];

/* ----------------------------- helpers ----------------------------- */
const BPM_PERIOD = 60 / 72;
const BREATH_PERIOD = 60 / 14;

function centroidOf(geoms: THREE.BufferGeometry[]) {
  const c = new THREE.Vector3();
  let n = 0;
  const v = new THREE.Vector3();
  for (const g of geoms) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      c.add(v.fromBufferAttribute(p, i));
      n++;
    }
  }
  return n ? c.divideScalar(n) : c;
}

/** Wrap meshes in a pivot group so they can be scaled about `pivot`. */
function pivotGroup(meshes: THREE.Mesh[], pivot: THREE.Vector3, parent: THREE.Group) {
  const g = new THREE.Group();
  g.position.copy(pivot);
  for (const m of meshes) {
    m.position.sub(pivot);
    g.add(m);
  }
  parent.add(g);
  return g;
}

/** First principal axis of a point set (power iteration on the covariance matrix). */
function principalAxis(geom: THREE.BufferGeometry, c: THREE.Vector3) {
  const p = geom.attributes.position;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(c);
    const a = [v.x, v.y, v.z];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[r * 3 + k] += a[r] * a[k];
  }
  let x = new THREE.Vector3(1, 1, 1).normalize();
  for (let it = 0; it < 30; it++) x = new THREE.Vector3(m[0] * x.x + m[1] * x.y + m[2] * x.z, m[3] * x.x + m[4] * x.y + m[5] * x.z, m[6] * x.x + m[7] * x.y + m[8] * x.z).normalize();
  let ext = 0;
  for (let i = 0; i < p.count; i++) ext = Math.max(ext, Math.abs(v.fromBufferAttribute(p, i).sub(c).dot(x)));
  return { axis: x, length: ext * 2 };
}

/**
 * Vessel centre-line: graph distance from one end of the tube, bucketed into rings whose
 * centroids follow the vessel even around curves (aortic arch). Returns points + local radius.
 */
function centerline(geom: THREE.BufferGeometry, samples = 36) {
  const p = geom.attributes.position;
  const n = p.count;
  const idx = geom.index?.array;
  if (!idx || n < 8) return null;
  // weld coincident vertices (Draco keeps seams split)
  const key = new Map<string, number>();
  const rep = new Int32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const k = `${Math.round(v.x * 2000)}_${Math.round(v.y * 2000)}_${Math.round(v.z * 2000)}`;
    let r = key.get(k);
    if (r === undefined) key.set(k, (r = i));
    rep[i] = r;
  }
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < idx.length; i += 3)
    for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
      const ra = rep[a], rb = rep[b];
      if (ra !== rb) {
        adj[ra].push(rb);
        adj[rb].push(ra);
      }
    }
  const c = centroidOf([geom]);
  let start = 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i) continue;
    const d = v.fromBufferAttribute(p, i).distanceToSquared(c);
    if (d > best) {
      best = d;
      start = i;
    }
  }
  const dist = new Int32Array(n).fill(-1);
  dist[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) for (const j of adj[q[h]]) if (dist[j] < 0) {
    dist[j] = dist[q[h]] + 1;
    q.push(j);
  }
  const maxD = Math.max(...Array.from(dist));
  if (maxD < 4) return null;
  const buckets = Array.from({ length: samples }, () => ({ c: new THREE.Vector3(), n: 0, pts: [] as THREE.Vector3[] }));
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i || dist[i] < 0) continue;
    const b = buckets[Math.min(samples - 1, Math.floor((dist[i] / (maxD + 1)) * samples))];
    const pt = new THREE.Vector3().fromBufferAttribute(p, i);
    b.c.add(pt);
    b.n++;
    b.pts.push(pt);
  }
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (const b of buckets) {
    if (!b.n) continue;
    const cc = b.c.divideScalar(b.n);
    pts.push(cc);
    radii.push(b.pts.reduce((s, q2) => s + q2.distanceTo(cc), 0) / b.n);
  }
  return pts.length >= 3 ? { pts, radii } : null;
}

let spriteTex: THREE.Texture | null = null;
function sprite() {
  if (spriteTex) return spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  spriteTex = new THREE.CanvasTexture(c);
  return spriteTex;
}

interface FlowPath {
  curve: THREE.CatmullRomCurve3;
  radii: number[];
  color: THREE.Color;
  speed: number;
  pulsatile: boolean;
  count: number;
}

/** Glowing particles streaming along vessel centre-lines. */
class Flow {
  points: THREE.Points;
  private paths: FlowPath[];
  private u: Float32Array;
  private off: THREE.Vector3[];
  private owner: Int32Array;
  constructor(paths: FlowPath[], size: number) {
    this.paths = paths;
    const total = paths.reduce((s, p) => s + p.count, 0);
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    this.u = new Float32Array(total);
    this.owner = new Int32Array(total);
    this.off = [];
    let k = 0;
    paths.forEach((p, pi) => {
      for (let i = 0; i < p.count; i++, k++) {
        this.u[k] = Math.random();
        this.owner[k] = pi;
        this.off.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random()));
        const c = p.color.clone().multiplyScalar(1.8 + Math.random() * 0.8); // HDR → bloom
        col.set([c.r, c.g, c.b], k * 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, map: sprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true });
    this.points = new THREE.Points(g, m);
    this.points.renderOrder = 5;
    this.points.frustumCulled = false;
  }
  update(dt: number, beat: number) {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let k = 0; k < this.u.length; k++) {
      const p = this.paths[this.owner[k]];
      const pulse = p.pulsatile ? 0.35 + 2.2 * beat : 1;
      this.u[k] = (this.u[k] + p.speed * pulse * dt) % 1;
      p.curve.getPointAt(this.u[k], v);
      const ri = p.radii[Math.min(p.radii.length - 1, Math.floor(this.u[k] * p.radii.length))];
      v.addScaledVector(this.off[k], ri * 0.55);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }
}

/* ----------------------------- loader ----------------------------- */
const ROLE_PRESET: Record<string, TissuePreset> = {
  artery: 'artery', vein: 'vein', airway: 'airway', bile: 'bile', cavity: 'cavity', valve: 'valve', cornea: 'cornea',
  lens: 'lens', iris: 'iris', sclera: 'sclera', choroid: 'choroid', vitreous: 'vitreous', muscle: 'muscle',
  diaphragm: 'diaphragm', lung: 'lung', cortex: 'cortex', cerebellum: 'cerebellum', brainstem: 'brainstem',
  kidney: 'kidney', adrenal: 'adrenal', ureter: 'ureter', liver: 'liver', stomach: 'stomach', esophagus: 'esophagus',
  duodenum: 'duodenum', myocardium: 'myocardium', tissue: 'organ',
};

export async function loadRealOrgan(id: OrganId, onProgress: (p: number) => void): Promise<RealOrgan> {
  const rel = getModelManifest()!.organs![id];
  const meta = (await (await fetch(modelUrl(rel.replace(/\.glb$/, '.json')))).json()) as { scale: number; hotspots: Hotspot[] };
  const model = await gltf().loadAsync(modelUrl(rel), (e) => e.total && onProgress(0.95 * (e.loaded / e.total)));
  const unit = meta.scale; // organ units per metre (keeps texture detail physically scaled)
  const root = new THREE.Group();
  root.name = id;
  const meshes: THREE.Mesh[] = [];
  model.scene.updateMatrixWorld(true);
  model.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g.computeVertexNormals();
    g.computeBoundingBox();
    const ud = (m.userData?.role ? m.userData : m.parent?.userData) ?? {};
    const mesh = new THREE.Mesh(g, undefined);
    mesh.name = String(ud.part ?? m.name);
    mesh.userData.role = String(ud.role ?? 'tissue');
    meshes.push(mesh);
  });
  const byRole = (r: string | RegExp) => meshes.filter((m) => (typeof r === 'string' ? m.userData.role === r : r.test(m.name)));
  const center = centroidOf(meshes.map((m) => m.geometry));
  const matCache = new Map<string, THREE.Material>();
  const mat = (preset: TissuePreset, extra?: Parameters<typeof tissuePreset>[2]) => {
    if (extra) return tissuePreset(preset, unit, extra);
    let m = matCache.get(preset);
    if (!m) matCache.set(preset, (m = tissuePreset(preset, unit)));
    return m;
  };
  const preset = (m: THREE.Mesh): TissuePreset => {
    const role = m.userData.role as string;
    if (id === 'heart' && role === 'artery' && /coronary|interventricular|marginal|conus|ventricular branch|nodal/i.test(m.name)) return 'coronary';
    if (id === 'heart' && role === 'vein' && /cardiac vein|coronary sinus|marginal vein|vein of left ventricle/i.test(m.name)) return 'cardiacVein';
    if (id === 'heart' && /pulmonary (trunk|artery)/i.test(m.name)) return 'vein'; // deoxygenated blood → blue (atlas convention)
    if (id === 'heart' && /pulmonary vein/i.test(m.name)) return 'artery'; // oxygenated → red
    if (/atrium/i.test(m.name) && role !== 'cavity') return 'myocardium';
    return ROLE_PRESET[role] ?? 'organ';
  };
  for (const m of meshes) {
    m.material = mat(preset(m));
    m.geometry.computeBoundsTree();
  }

  let animate: RealOrgan['animate'] = () => {};
  let flow: Flow | null = null;
  const vesselGlass = (ms: THREE.Mesh[]) => {
    // vessels carrying particles become translucent glass-like tubes so the flow is visible
    for (const m of ms) {
      const base = m.material as THREE.MeshPhysicalMaterial;
      const glass = base.clone();
      glass.userData = base.userData;
      glass.onBeforeCompile = base.onBeforeCompile;
      glass.customProgramCacheKey = base.customProgramCacheKey;
      glass.transparent = true;
      glass.opacity = 0.55;
      glass.depthWrite = false;
      m.material = glass;
      m.renderOrder = 2;
    }
  };
  const flowPath = (m: THREE.Mesh, color: string, speed: number, opts: { reverse?: boolean; towards?: THREE.Vector3; away?: THREE.Vector3; pulsatile?: boolean; count?: number } = {}): FlowPath | null => {
    const cl = centerline(m.geometry);
    if (!cl) return null;
    let pts = cl.pts;
    let radii = cl.radii;
    const ref = opts.towards ?? opts.away;
    if (ref) {
      const startNear = pts[0].distanceTo(ref) < pts[pts.length - 1].distanceTo(ref);
      // "away": start near the reference; "towards": end near it
      if ((opts.away && !startNear) || (opts.towards && startNear)) {
        pts = [...pts].reverse();
        radii = [...radii].reverse();
      }
    } else if (opts.reverse) {
      pts = [...pts].reverse();
      radii = [...radii].reverse();
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    return { curve, radii, color: new THREE.Color(color), speed: speed / Math.max(len, 0.05), pulsatile: !!opts.pulsatile, count: opts.count ?? Math.round(30 + len * 30) };
  };

  /* ------------------------------ per organ ------------------------------ */
  if (id === 'heart') {
    const isVessel = (m: THREE.Mesh) => /aorta|pulmonary trunk|pulmonary artery|vena cava|pulmonary vein|brachiocephalic|carotid|subclavian/i.test(m.name);
    const atria = meshes.filter((m) => /atrium|auricle/i.test(m.name));
    const ventr = meshes.filter((m) => !isVessel(m) && !atria.includes(m));
    const fixed = meshes.filter(isVessel);
    for (const m of fixed) root.add(m);
    const gA = pivotGroup(atria, centroidOf(atria.map((m) => m.geometry)), root);
    const gV = pivotGroup(ventr, centroidOf(byRole(/myocardium/i).map((m) => m.geometry)), root);
    const heartC = gV.position.clone();
    const paths = [
      ...byRole(/^(Ascending aorta|Arch of aorta)$/).map((m) => flowPath(m, '#ff3344', 0.55, { away: heartC, pulsatile: true })),
      ...byRole(/^(Pulmonary trunk|Left pulmonary artery|Right pulmonary artery)$/).map((m) => flowPath(m, '#4f7bff', 0.5, { away: heartC, pulsatile: true })),
      ...byRole(/^(Superior vena cava|Inferior vena cava)$/).map((m) => flowPath(m, '#4f7bff', 0.28, { towards: heartC })),
      ...byRole(/pulmonary vein/i).map((m) => flowPath(m, '#ff3344', 0.3, { towards: heartC, count: 18 })),
    ].filter(Boolean) as FlowPath[];
    if (paths.length) {
      vesselGlass(byRole(/^(Ascending aorta|Arch of aorta|Pulmonary trunk|Left pulmonary artery|Right pulmonary artery|Superior vena cava|Inferior vena cava)$|pulmonary vein/i));
      flow = new Flow(paths, 0.05);
      root.add(flow.points);
    }
    animate = (t, dt, live) => {
      const ph = (t % BPM_PERIOD) / BPM_PERIOD;
      const a = live ? Math.exp(-Math.pow((ph - 0.1) / 0.05, 2)) : 0; // atrial systole
      const v = live ? Math.exp(-Math.pow((ph - 0.34) / 0.1, 2)) : 0; // ventricular systole
      gA.scale.setScalar(1 - 0.06 * a + 0.025 * v);
      gV.scale.set(1 - 0.05 * v, 1 - 0.035 * v, 1 - 0.05 * v);
      if (flow) {
        flow.points.visible = live;
        if (live) flow.update(dt, v);
      }
    };
  } else if (id === 'lungs') {
    const dia = byRole('diaphragm');
    const trachea = byRole(/^Trachea$/);
    const rest = meshes.filter((m) => !dia.includes(m) && !trachea.includes(m));
    for (const m of [...trachea]) root.add(m);
    const left = rest.filter((m) => m.geometry.boundingBox!.getCenter(new THREE.Vector3()).x > 0);
    const right = rest.filter((m) => !left.includes(m));
    const gL = pivotGroup(left, centroidOf(left.map((m) => m.geometry)), root);
    const gR = pivotGroup(right, centroidOf(right.map((m) => m.geometry)), root);
    const gD = pivotGroup(dia, centroidOf(dia.map((m) => m.geometry)), root);
    animate = (t, _dt, live) => {
      const b = live ? 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / BREATH_PERIOD) : 0;
      for (const g of [gL, gR]) g.scale.set(1 + 0.045 * b, 1 + 0.06 * b, 1 + 0.05 * b);
      gD.position.y = centroidOf(dia.map((m) => m.geometry)).y - 0.12 * b;
      gD.scale.set(1 + 0.02 * b, 1 - 0.25 * b, 1 + 0.02 * b); // dome flattens as it contracts
    };
  } else if (id === 'brain') {
    // all gyri share one neural-pulse cortex material (and one for the cerebellum)
    const neuralCortex = mat('cortex', { neural: { color: '#7cf3ff' } });
    const neuralCb = mat('cerebellum', { neural: { color: '#7cf3ff' } });
    for (const m of meshes) {
      if (m.userData.role === 'cortex') m.material = neuralCortex;
      if (m.userData.role === 'cerebellum') m.material = neuralCb;
      root.add(m);
    }
  } else if (id === 'stomach') {
    for (const m of meshes) root.add(m);
    for (const m of byRole('stomach')) {
      const c = centroidOf([m.geometry]);
      const { axis, length } = principalAxis(m.geometry, c);
      // orient the wave from the cardia (top) towards the pylorus
      if (axis.y < 0) axis.negate();
      m.material = mat('stomach', { peristalsis: { axis: axis.negate(), center: c, length, amp: 0.035 } });
    }
  } else if (id === 'kidneys') {
    for (const m of meshes) root.add(m);
    const aorta = byRole(/^Abdominal aorta$/)[0];
    const aortaC = aorta ? centroidOf([aorta.geometry]) : center;
    const kidneysC = byRole('kidney').map((m) => centroidOf([m.geometry]));
    const nearestKidney = (m: THREE.Mesh) => {
      const c = centroidOf([m.geometry]);
      return kidneysC.reduce((a, b) => (b.distanceTo(c) < a.distanceTo(c) ? b : a), kidneysC[0] ?? center);
    };
    const paths = [
      ...byRole(/renal artery/i).map((m) => flowPath(m, '#ff3344', 0.35, { away: aortaC, pulsatile: true, count: 22 })),
      ...byRole(/^Abdominal aorta$/).map((m) => flowPath(m, '#ff3344', 0.45, { reverse: centroidOf([m.geometry]).y > 0, pulsatile: true })),
      ...byRole(/^Inferior vena cava$/).map((m) => flowPath(m, '#4f7bff', 0.3, {})),
      ...byRole('ureter').map((m) => flowPath(m, '#ffd84a', 0.18, { away: nearestKidney(m), count: 26 })),
    ].filter(Boolean) as FlowPath[];
    if (paths.length) {
      vesselGlass([...byRole(/renal artery|^Abdominal aorta$|^Inferior vena cava$/i), ...byRole('ureter')]);
      flow = new Flow(paths, 0.04);
      root.add(flow.points);
    }
    animate = (t, dt, live) => {
      const ph = (t % BPM_PERIOD) / BPM_PERIOD;
      const v = Math.exp(-Math.pow((ph - 0.34) / 0.1, 2));
      if (flow) {
        flow.points.visible = live;
        if (live) flow.update(dt, v);
      }
    };
  } else if (id === 'liver') {
    for (const m of meshes) root.add(m);
    animate = (t, _dt, live) => {
      const b = live ? 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / BREATH_PERIOD) : 0;
      root.position.y = -0.07 * b; // pushed down by the diaphragm on inspiration
      root.rotation.x = 0.03 * b;
    };
  } else if (id === 'eye') {
    const globeParts = meshes.filter((m) => m.userData.role !== 'muscle');
    const muscles = meshes.filter((m) => m.userData.role === 'muscle');
    for (const m of muscles) root.add(m);
    const sclera = byRole('sclera');
    const eyeC = centroidOf(sclera.map((m) => m.geometry));
    const corneaC = centroidOf(byRole('cornea').map((m) => m.geometry));
    const axis = corneaC.clone().sub(eyeC).normalize();
    const iris = byRole('iris')[0];
    if (iris) {
      const ic = centroidOf([iris.geometry]);
      let outer = 0;
      const v = new THREE.Vector3();
      const p = iris.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const rel = v.fromBufferAttribute(p, i).sub(ic);
        outer = Math.max(outer, rel.sub(axis.clone().multiplyScalar(rel.dot(axis))).length());
      }
      iris.material = mat('iris', { pupil: { axis, center: ic, outer }, iris: { axis, center: ic, colorA: '#3B6E8F', colorB: '#8A6A3A' } });
      // black pupil behind the iris aperture
      const disc = new THREE.Mesh(new THREE.CircleGeometry(outer * 0.75, 48), new THREE.MeshBasicMaterial({ color: '#020202' }));
      disc.position.copy(ic).addScaledVector(axis, -outer * 0.12);
      disc.lookAt(ic.clone().add(axis));
      disc.name = 'Pupil';
      globeParts.push(disc);
    }
    const globe = pivotGroup(globeParts, eyeC, root);
    const look = { from: new THREE.Euler(), to: new THREE.Euler(), t0: 0 };
    const irisMat = iris?.material as THREE.MeshPhysicalMaterial | undefined;
    animate = (t, _dt, live) => {
      if (irisMat) irisMat.userData.uniforms.uPupil.value = live ? 0.7 * Math.sin((t * 2 * Math.PI) / 7) + 0.15 * Math.sin(t * 2.3) : 0;
      if (!live) {
        globe.rotation.x = THREE.MathUtils.damp(globe.rotation.x, 0, 4, 0.016);
        globe.rotation.y = THREE.MathUtils.damp(globe.rotation.y, 0, 4, 0.016);
        return;
      }
      if (t - look.t0 > 1.8 + Math.random() * 0.02) {
        look.t0 = t;
        look.from.copy(globe.rotation);
        look.to.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.55, 0);
      }
      const k = Math.min(1, (t - look.t0) / 0.18); // quick saccade, then hold
      const e = k * k * (3 - 2 * k);
      globe.rotation.x = look.from.x + (look.to.x - look.from.x) * e;
      globe.rotation.y = look.from.y + (look.to.y - look.from.y) * e;
    };
  } else {
    for (const m of meshes) root.add(m);
  }
  // any mesh not placed by the organ rig
  for (const m of meshes) if (!m.parent) root.add(m);
  onProgress(1);

  return {
    group: root,
    hotspots: meta.hotspots,
    animate,
    dispose: () => {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.disposeBoundsTree?.();
        m.geometry?.dispose();
      });
      matCache.forEach((m) => m.dispose());
      flow?.points.geometry.dispose();
    },
  };
}
