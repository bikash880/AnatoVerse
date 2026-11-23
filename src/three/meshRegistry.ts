/**
 * Mesh registry: owns the THREE.Mesh for every structure, loads systems lazily, and applies
 * visibility / material state imperatively (no React re-render per mesh).
 *
 * Loading strategy per (sex, system):
 *   • If /models/manifest.json lists a GLB for it (BodyParts3D / Z-Anatomy conversion, see
 *     README), the GLB is streamed (Meshopt or Draco compressed) and each node named after a
 *     structure id becomes one mesh.
 *   • Otherwise the built-in procedural model is generated in small time-sliced batches.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { RegionId, Sex, StructureDef, StructureKind, SystemId } from '../types';
import { getCatalog, registerExternal } from '../anatomy/catalog';
import { femaleWarp } from '../anatomy/geometry';
import { makeDef } from '../anatomy/def';
import { getModelManifest, modelUrl } from '../modelsInit';
import { baseMaterialFor } from './materials';

export interface Entry {
  def: StructureDef;
  mesh: THREE.Mesh;
  /** Assembled (original) position — explode offsets are computed from this. */
  orig: THREE.Vector3;
  /** Local AABB size (for the parts-grid layout). */
  size: THREE.Vector3;
  radius: number;
  /** LOD: full and coarse geometry (both centred like the mesh); the scene swaps by screen size */
  lod?: { hi: THREE.BufferGeometry; lo: THREE.BufferGeometry };
}

export const HIDDEN_LAYER = 31;

/** Root group per sex, each holding one group per system. */
const roots = new Map<Sex, THREE.Group>();
const entries = new Map<Sex, Map<string, Entry>>();
const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function getRoot(sex: Sex) {
  let g = roots.get(sex);
  if (!g) {
    g = new THREE.Group();
    g.name = `body-${sex}`;
    roots.set(sex, g);
  }
  return g;
}

export function getEntries(sex: Sex) {
  let m = entries.get(sex);
  if (!m) entries.set(sex, (m = new Map()));
  return m;
}

export const getEntry = (sex: Sex, id: string | null | undefined) => (id ? getEntries(sex).get(id) : undefined);
export const isLoaded = (sex: Sex, sys: SystemId) => loaded.has(`${sex}:${sys}`);

function addMesh(sex: Sex, def: StructureDef, geom: THREE.BufferGeometry, parent: THREE.Group) {
  if (sex === 'female' && def.meshFile === 'procedural') femaleWarp(geom);
  geom.computeBoundingBox();
  const center = new THREE.Vector3();
  geom.boundingBox!.getCenter(center);
  geom.translate(-center.x, -center.y, -center.z);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  const size = new THREE.Vector3();
  geom.boundingBox!.getSize(size);
  const mesh = new THREE.Mesh(geom, baseMaterialFor(def));
  mesh.name = def.id;
  mesh.userData.id = def.id;
  mesh.position.copy(center);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = true;
  parent.add(mesh);
  getEntries(sex).set(def.id, { def, mesh, orig: center.clone(), size, radius: geom.boundingSphere!.radius });
}

let gltfLoader: GLTFLoader | null = null;
/** Shared GLTF loader: Draco decoder served locally from /draco (no CDN at runtime), Meshopt built in. */
export function gltf() {
  if (!gltfLoader) {
    gltfLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    draco.setWorkerLimit(4);
    gltfLoader.setDRACOLoader(draco);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoader;
}

const KIND_FOR_SYSTEM: Record<SystemId, StructureKind> = {
  skeletal: 'bone',
  muscular: 'muscle',
  nervous: 'nerve',
  cardiovascular: 'artery',
  respiratory: 'organ',
  digestive: 'organ',
  urinary: 'organ',
  lymphatic: 'lymph',
  reproductive: 'organ',
  integumentary: 'skin',
};

async function loadGlbSystem(sex: Sex, sys: SystemId, url: string, parent: THREE.Group, onProgress: (p: number) => void) {
  const model = await gltf().loadAsync(modelUrl(url), (e) => {
    if (e.total) onProgress(0.9 * (e.loaded / e.total)); // last 10 % = decoding
  });
  const cat = getCatalog(sex);
  model.scene.updateMatrixWorld(true);
  const lodNodes: THREE.Mesh[] = [];
  model.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.userData?.lodOf || m.parent?.userData?.lodOf) {
      lodNodes.push(m);
      return;
    }
    // node extras carry the catalog id (node names may be sanitised by the loader)
    const id = String((m.userData?.catalogId as string) ?? (m.parent?.userData?.catalogId as string) ?? m.name).toLowerCase();
    let def = cat.byId.get(id);
    if (!def) {
      // Unknown structure: derive metadata from the node name / extras (FMA name in BodyParts3D).
      const extras = (m.userData ?? {}) as Record<string, unknown>;
      def = makeDef({
        id,
        nameEn: String(extras.nameEn ?? m.name.replace(/[_-]+/g, ' ')),
        nameLatin: String(extras.nameLatin ?? ''),
        system: sys,
        kind: (extras.kind as StructureKind) ?? KIND_FOR_SYSTEM[sys],
        region: (extras.region as RegionId) ?? 'thorax',
        layer: (Number(extras.layer ?? 3) as 0 | 1 | 2 | 3 | 4) ?? 3,
        build: () => new THREE.BufferGeometry(),
      });
      def.meshFile = url;
      registerExternal(sex, def);
    }
    const geom = m.geometry.clone().applyMatrix4(m.matrixWorld);
    addMesh(sex, { ...def, meshFile: url }, geom, parent);
  });
  // coarse LOD geometry for large meshes, centred exactly like the full mesh
  for (const m of lodNodes) {
    const of = String(m.userData?.lodOf ?? m.parent?.userData?.lodOf).toLowerCase();
    const e = getEntries(sex).get(of);
    if (!e) continue;
    const lo = m.geometry.clone().applyMatrix4(m.matrixWorld).translate(-e.orig.x, -e.orig.y, -e.orig.z);
    lo.computeBoundingSphere();
    e.lod = { hi: e.mesh.geometry, lo };
  }
}

/**
 * Ensure a body system is loaded for the given sex. Generation is time-sliced (~12 ms per
 * frame) so the UI keeps animating and the loading bar can report real progress.
 */
export function ensureSystem(sex: Sex, sys: SystemId, onProgress: (p: number) => void = () => {}): Promise<void> {
  const key = `${sex}:${sys}`;
  if (loaded.has(key)) return Promise.resolve();
  const existing = pending.get(key);
  if (existing) return existing;
  const p = (async () => {
    const root = getRoot(sex);
    const group = new THREE.Group();
    group.name = sys;
    root.add(group);
    const url = getModelManifest()?.[sex]?.[sys];
    if (url) {
      await loadGlbSystem(sex, sys, url, group, onProgress);
    } else {
      const defs = getCatalog(sex).bySystem.get(sys) ?? [];
      let i = 0;
      while (i < defs.length) {
        const t0 = performance.now();
        while (i < defs.length && performance.now() - t0 < 12) {
          addMesh(sex, defs[i], defs[i].build(), group);
          i++;
        }
        onProgress(i / defs.length);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    }
    loaded.add(key);
    pending.delete(key);
  })();
  pending.set(key, p);
  return p;
}

export interface VisibilityState {
  sex: Sex;
  visibleSystems: Record<SystemId, boolean>;
  layerDepth: number;
  hiddenIds: string[];
  isolateIds: string[] | null;
  activeRegion: RegionId | null;
}

/** Is a structure drawn under the current filters (ignores selection ghosting)? */
export function isVisible(def: StructureDef, s: VisibilityState) {
  if (s.isolateIds) return s.isolateIds.includes(def.id);
  if (!s.visibleSystems[def.system]) return false;
  if (def.layer < Math.floor(s.layerDepth + 1e-3)) return false;
  if (s.activeRegion && def.region !== s.activeRegion) return false;
  return !s.hiddenIds.includes(def.id);
}
