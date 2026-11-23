/**
 * Shared materials. Every mesh uses one of a small set of materials so 1,500+ meshes add
 * almost no shader/state overhead; selection & ghosting are done by swapping references.
 */
import * as THREE from 'three';
import type { StructureKind, SystemId } from '../types';
import { KIND_COLORS } from '../data/systems';
import { tissuePreset, type TissuePreset } from './tissue';

export const ACCENT = '#14B8A6';
export const AMBER = '#F59E0B';

const base = new Map<string, THREE.MeshPhysicalMaterial>();
const ghost = new Map<StructureKind, THREE.Material>();

/** Tissue preset for a structure: by kind, refined by name for organs (lung, liver, brain…). */
export function presetFor(def: { kind: StructureKind; id: string; nameEn: string }): TissuePreset {
  const n = `${def.id} ${def.nameEn}`.toLowerCase();
  if (def.kind === 'organ') {
    if (/lung|lobe of (right|left) lung/.test(n)) return 'lung';
    if (/liver|hepatovenous/.test(n)) return 'liver';
    if (/gyrus|lobule|occipital lobe|insula|cerebral|white matter|hippocamp/.test(n)) return 'cortex';
    if (/cerebellum/.test(n)) return 'cerebellum';
    if (/pons|midbrain|medulla|thalam|tuber|colliculus|brain/.test(n)) return 'brainstem';
    if (/myocardium|atrium|ventricle|heart/.test(n)) return 'myocardium';
    if (/leaflet|cusp|papillary|valve/.test(n)) return 'valve';
    if (/kidney/.test(n)) return 'kidney';
    if (/adrenal|suprarenal gland/.test(n)) return 'adrenal';
    if (/ureter|urethra/.test(n)) return 'ureter';
    if (/stomach/.test(n)) return 'stomach';
    if (/esophag|oesophag/.test(n)) return 'esophagus';
    if (/duoden|jejun|ileum|colon|cecum|caecum|rectum|appendix/.test(n)) return 'duodenum';
    if (/gallbladder|biliary|bile|cystic duct|hepatic duct/.test(n)) return 'bile';
    if (/cornea|anterior chamber/.test(n)) return 'cornea';
    if (/lens|suspensory/.test(n)) return 'lens';
    if (/iris/.test(n)) return 'iris';
    if (/sclera|eyeball/.test(n)) return 'sclera';
    if (/choroid/.test(n)) return 'choroid';
    if (/vitreous/.test(n)) return 'vitreous';
    if (/diaphragm/.test(n)) return 'diaphragm';
    return 'organ';
  }
  if (def.kind === 'cartilage' && /bronch|trachea/.test(n)) return 'airway';
  if (def.kind === 'artery' && /coronary|interventricular|marginal|conus/.test(n)) return 'coronary';
  if (def.kind === 'vein' && /cardiac vein|coronary sinus/.test(n)) return 'cardiacVein';
  return def.kind as TissuePreset;
}

/** Materials per (system, preset): shared inside a system so per-system opacity / fades are cheap. */
const bySystem = new Map<string, Set<THREE.MeshPhysicalMaterial>>();

/** Fade/opacity group: each system, with the skin surface as its own group ('__skin'). */
export function fadeKey(def: { kind: StructureKind; system?: SystemId }) {
  return def.kind === 'skin' ? '__skin' : (def.system ?? 'integumentary');
}

export function baseMaterialFor(def: { kind: StructureKind; id: string; nameEn: string; system?: SystemId }) {
  const p = presetFor(def);
  const sys = fadeKey(def);
  const key = `${sys}|${p}`;
  let m = base.get(key);
  if (!m) {
    const t = tissuePreset(p);
    t.userData.baseOpacity = t.opacity;
    t.userData.baseTransparent = t.transparent;
    t.userData.baseDepthWrite = t.depthWrite;
    base.set(key, (m = t));
    if (!bySystem.has(sys)) bySystem.set(sys, new Set());
    bySystem.get(sys)!.add(t);
  }
  return m;
}

/**
 * Apply a system's opacity (user slider × fade-in/out). Opaque tissue switches to blended
 * rendering only while it is see-through.
 */
export function setSystemOpacity(sys: string, alpha: number) {
  for (const m of bySystem.get(sys) ?? []) {
    const baseOp = m.userData.baseOpacity as number;
    const op = baseOp * alpha;
    const transparent = (m.userData.baseTransparent as boolean) || alpha < 0.999;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.depthWrite = transparent ? alpha > 0.9 && (m.userData.baseDepthWrite as boolean) : true;
      m.needsUpdate = true;
    }
    m.opacity = op;
  }
}

/** Translucent "ghost" used for context when something is selected. */
export function ghostMaterial(kind: StructureKind) {
  let m = ghost.get(kind);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: KIND_COLORS[kind],
      roughness: 0.6,
      transparent: true,
      opacity: kind === 'skin' ? 0.03 : 0.075,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ghost.set(kind, m);
  }
  return m;
}

/** Quiz target highlight (amber). */
export const quizMaterial = new THREE.MeshPhysicalMaterial({
  transparent: true,
  color: AMBER,
  emissive: AMBER,
  emissiveIntensity: 0.55,
  roughness: 0.3,
  clearcoat: 1,
  side: THREE.DoubleSide,
});

/** Inverted-hull outline: back faces pushed out along the normal. */
export function makeOutlineMaterial(color: string, thickness: number) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThickness;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uThickness;');
  };
  return m;
}
