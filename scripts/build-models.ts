/**
 * Build AnatoVerse's real-anatomy models from BodyParts3D.
 *
 *   npm run build:models
 *
 * Source: BodyParts3D 4.0 "part-of" meshes, © The Database Center for Life Science,
 * licensed CC BY-SA 2.1 Japan (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/).
 * The generated GLB files are derivative works under the same licence.
 *
 * Output (public/models/):
 *   manifest.json                 which systems / organs have real models
 *   male/catalog.json             structure records for every mesh (names, system, facts…)
 *   male/<system>.glb             one Draco-compressed GLB per body system
 *   organs/<organ>.glb + .json    high-detail organ models + re-anchored hotspots
 *
 * What BodyParts3D lacks (most muscles, peripheral/cranial nerves, lymph nodes, spinal cord,
 * some gut and genital organs) is filled with AnatoVerse's procedural structures, warped onto
 * the real skeleton with a 3-D thin-plate spline fitted to ~90 landmarks measured on the real
 * bones. Lung lobes and the ventricular myocardium, absent from the dataset, are reconstructed as
 * smooth envelopes around the real airway trees / cardiac chambers and coronary vessels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO, type Mesh as GMesh } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, simplify, weld, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { getCatalog } from '../src/anatomy/catalog';
import { LM, SPINE } from '../src/anatomy/landmarks';
import { ribCurve } from '../src/anatomy/systems/skeletal';
import type { LayerIndex, RegionId, StructureDef, StructureKind, StructureRecord, SystemId } from '../src/types';

const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.cache', 'bodyparts3d');
const OUT = path.join(ROOT, 'public', 'models');
const BASE_URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const ZIP = 'partof_BP3D_4.0_obj_99.zip';
const ELEMENTS = 'partof_element_parts.txt';
const CREDIT = 'BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 JP';
const LOD_MIN_TRIS = 20000; // meshes above this get a coarse LOD
const LOD_RATIO = 0.08;

type V3 = [number, number, number];
const log = (...a: unknown[]) => console.log('[models]', ...a);

/* ============================== download & parse ============================== */
async function fetchToCache(name: string) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(CACHE, { recursive: true });
  log(`downloading ${name} …`);
  const res = await fetch(BASE_URL + name);
  if (!res.ok) throw new Error(`download failed ${res.status} ${name}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

interface Part {
  file: string;
  name: string;
  fma: string;
  geom: THREE.BufferGeometry; // AnatoVerse world space (metres, Y up, +Z anterior, +X patient's left)
}

/** BodyParts3D: millimetres, Z up, −Y anterior, +X patient's left → AnatoVerse frame. */
const toWorld = (x: number, y: number, z: number): V3 => [x / 1000, (z + 78.11) / 1000, -(y + 101) / 1000];

function parseObj(text: string): Omit<Part, 'file'> {
  const name = /# English name : (.+)/.exec(text)?.[1].trim() ?? 'unknown';
  const fma = /# Concept ID : (\S+)/.exec(text)?.[1] ?? '';
  const v: number[] = [];
  const pos: number[] = [];
  const idx: number[] = [];
  const map = new Map<string, number>();
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      v.push(...toWorld(x, y, z));
    } else if (line.startsWith('f ')) {
      const corners = line.trim().split(/\s+/).slice(1).map((tok) => {
        const vi = parseInt(tok, 10) - 1;
        let k = map.get(tok.split('/')[0]);
        if (k === undefined) {
          k = pos.length / 3;
          pos.push(v[vi * 3], v[vi * 3 + 1], v[vi * 3 + 2]);
          map.set(tok.split('/')[0], k);
        }
        return k;
      });
      for (let i = 1; i < corners.length - 1; i++) idx.push(corners[0], corners[i], corners[i + 1]);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return { name, fma, geom };
}

/* ============================== naming & classification ============================== */
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12 };
const sideOf = (n: string): 'left' | 'right' | 'midline' => (/\bleft\b/i.test(n) ? 'left' : /\bright\b/i.test(n) ? 'right' : 'midline');
const stripSide = (n: string) => n.replace(/\b(left|right)\s+/gi, '').replace(/\s+of\s+(left|right)\s+(foot|hand)$/i, '').trim();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Normalised name used to match BodyParts3D names to AnatoVerse catalog names. */
function canonical(n: string) {
  let s = stripSide(n).toLowerCase();
  s = s
    .replace(/\boesophagus\b/, 'esophagus')
    .replace(/\bcaecum\b/, 'cecum')
    .replace(/\bvermiform appendix\b/, 'appendix')
    .replace(/\bgreat toe\b/, 'big toe')
    .replace(/\btriquetrum\b/, 'triquetral')
    .replace(/\b(bone of foot|bone)\b$/, '')
    .replace(/\bcuneiform\b.*/, (m) => m.replace(' bone', ''))
    .replace(/\bmetacarpal bone\b/, 'metacarpal')
    .replace(/\bmetatarsal bone\b/, 'metatarsal')
    .replace(/\bnavicular bone\b.*/, 'navicular')
    .replace(/\bcuboid bone\b/, 'cuboid')
    .replace(/\b(\d+)(st|nd|rd|th) rib\b/, (_, d) => `rib ${d}`)
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib\b/, (_, w) => `rib ${ORD[w]}`)
    .replace(/\s+/g, ' ')
    .trim();
  // vertebrae: "fifth thoracic vertebra" ↔ "T5 vertebra"
  const vm = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) (cervical|thoracic|lumbar) vertebra$/.exec(s);
  if (vm) s = `${vm[2][0]}${ORD[vm[1]]} vertebra`;
  if (s === 'atlas') s = 'c1 vertebra';
  if (s === 'axis') s = 'c2 vertebra';
  const cm = /^(c\d+|t\d+|l\d+) vertebra$/i.exec(s);
  if (cm) s = `${cm[1].toLowerCase()} vertebra`;
  return s.replace(/\(.*?\)/g, '').trim();
}

/** Curated catalog structures that several BodyParts3D meshes belong to (facts are inherited). */
function aliasFor(name: string): string | null {
  const n = name.toLowerCase();
  const side = sideOf(name) === 'left' ? 'l' : 'r';
  if (/hepatovenous segment|caudate lobe of liver/.test(n)) return 'liver';
  if (/wall of (left|right) atrium|cavity of (left|right) (atrium|ventricle)|leaflet of (mitral|tricuspid)|cusp of (aortic|pulmonary) valve|papillary muscle/.test(n)) return 'heart';
  if (/gyrus|lobule|occipital lobe|insula|hippocamp|white matter of (left|right) cerebral/.test(n)) return `cerebral-hemisphere-${side}`;
  if (/(sclera|choroid|cornea|iris|lens|vitreous body|anterior chamber)/.test(n) && !/artery|vein/.test(n)) return `eyeball-${side}`;
  if (/part of (left|right) pectoralis major/.test(n)) return `pectoralis-major-${side}`;
  if (/(proximal|middle|distal) part of (jejunum|ileum)/.test(n)) return /jejunum/.test(n) ? 'jejunum' : 'ileum';
  if (/main bronchus/.test(n)) return `main-bronchus-${side}`;
  return null;
}

const BONE_WORDS = /\b(bone|femur|tibia|fibula|patella|humerus|radius|ulna|scapula|clavicle|phalanx|metacarpal|metatarsal|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|talus|calcaneus|cuboid|cuneiform|navicular|vertebra|atlas|axis|sacrum|coccyx|rib|sternum|manubrium|xiphoid|mandible|maxilla|hyoid)\b/i;
const MUSCLE_WORDS = /(brachialis|coracobrachialis|anconeus|oblique|rectus|levator|pectoralis|piriformis|psoas|rhomboid|serratus|subclavius|transversus|obturator|sphincter|iliotibial|retinaculum|diaphragm|muscle)/i;

function classify(p: Part, systemsOf: Map<string, string[]>): { system: SystemId; kind: StructureKind } | null {
  const n = p.name.toLowerCase();
  if (/pubic hair|^\s*$|unknown/.test(n)) return null;
  const tags = systemsOf.get(p.file) ?? [];
  const has = (s: string) => tags.includes(s);
  const vessel = /\b(artery|arteries|aorta|arterial|arch)\b|arteria|trunk of .*artery|coronary .*branch|branch of .*artery/.test(n)
    ? 'artery'
    : /\b(vein|vena|venous|tributary|sinus)\b|vena cava/.test(n) && !/biliary/.test(n)
      ? 'vein'
      : null;
  if (has('integumentary system') || /tarsal plate|lacrimal (gland|sac|lake|canaliculus)|nasolacrimal/.test(n)) return { system: 'integumentary', kind: 'skin' };
  if (/(sclera|choroid|cornea|\biris\b|\blens\b|vitreous|anterior chamber|suspensory ligament)/.test(n)) return { system: 'nervous', kind: 'organ' };
  if (vessel && !/ligament/.test(n)) return { system: 'cardiovascular', kind: vessel };
  if (/(rectus|oblique|levator palpebrae)/.test(n) && /(superior|inferior|medial|lateral|palpebrae)/.test(n) && !/abdomin|external|internal/.test(n)) return { system: 'muscular', kind: 'muscle' };
  if (has('nervous system')) return { system: 'nervous', kind: 'organ' };
  if (has('cardiovascular system') || /heart|atrium|ventricle|valve|papillary/.test(n)) return { system: 'cardiovascular', kind: 'organ' };
  if (/thymus/.test(n)) return { system: 'lymphatic', kind: 'organ' };
  if (has('respiratory system') || /bronch|trachea|nasal cartilage|alar cartilage/.test(n)) return { system: 'respiratory', kind: /bronch|trachea|cartilage/.test(n) ? 'cartilage' : 'organ' };
  if (has('urinary system') || /adrenal|suprarenal gland|urethra|ureter|kidney|bladder/.test(n)) return { system: 'urinary', kind: 'organ' };
  if (has('genital system') || /prostate/.test(n)) return { system: 'reproductive', kind: 'organ' };
  if (has('alimentary system') || has('endocrine system')) return { system: 'digestive', kind: 'organ' };
  if (MUSCLE_WORDS.test(n) && !BONE_WORDS.test(n)) return { system: 'muscular', kind: 'muscle' };
  if (has('skeletal system') || BONE_WORDS.test(n) || /disk|cartilage/.test(n)) return { system: 'skeletal', kind: /disk|cartilage|meniscus/.test(n) ? 'cartilage' : 'bone' };
  return { system: 'digestive', kind: 'organ' };
}

function regionOf(box: THREE.Box3, system: SystemId, kind: StructureKind): RegionId {
  const c = box.getCenter(new THREE.Vector3());
  const ax = Math.abs(c.x);
  if (c.y > 1.43) return 'head-neck';
  if (c.y < 0.82 && ax > 0.03) return 'lower-limb';
  if (ax > 0.17 && c.y > 0.72) return 'upper-limb';
  if (kind === 'muscle' && c.z < -0.06 && c.y > 0.9) return 'back';
  if (c.y > 1.17) return 'thorax';
  if (c.y > 0.95) return 'abdomen';
  return 'pelvis';
}

/* ============================== landmarks & thin-plate warp ============================== */
/** Fits a 3-D thin-plate spline f(p) = A·p + b + Σ wᵢ |p − cᵢ| through landmark pairs. */
class TPS {
  private c: V3[];
  private w: number[][] = [];
  constructor(src: V3[], dst: V3[], lambda = 1e-6) {
    this.c = src;
    const n = src.length;
    const N = n + 4;
    const M = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) M[i][j] = i === j ? lambda : dist(src[i], src[j]);
      M[i][n] = 1;
      M[n][i] = 1;
      for (let k = 0; k < 3; k++) {
        M[i][n + 1 + k] = src[i][k];
        M[n + 1 + k][i] = src[i][k];
      }
    }
    for (let k = 0; k < 3; k++) {
      const b = new Array(N).fill(0);
      for (let i = 0; i < n; i++) b[i] = dst[i][k];
      this.w.push(solve(M.map((r) => r.slice()), b));
    }
  }
  apply(p: V3): V3 {
    const n = this.c.length;
    const out: V3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const w = this.w[k];
      let s = w[n] + w[n + 1] * p[0] + w[n + 2] * p[1] + w[n + 3] * p[2];
      for (let i = 0; i < n; i++) s += w[i] * dist(p, this.c[i]);
      out[k] = s;
    }
    return out;
  }
}
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function solve(A: number[][], b: number[]) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

function verts(g: THREE.BufferGeometry): V3[] {
  const p = g.attributes.position;
  const out: V3[] = [];
  for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return out;
}
const centroid = (pts: V3[]): V3 => {
  const c: V3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
  return c;
};
const argmax = (pts: V3[], f: (p: V3) => number) => pts.reduce((a, b) => (f(b) > f(a) ? b : a));

type LmTag = 'mid' | 'head' | 'spine' | 'pubis' | 'shoulder' | 'clavicle' | 'elbow' | 'wrist' | 'hand' | 'rib' | 'pelvis' | 'ischium' | 'hip' | 'knee' | 'foot';

/** Landmark pairs: procedural reference body (src) → real BodyParts3D body (dst). */
function landmarkPairs(byName: (n: string) => V3[] | null) {
  const src: V3[] = [];
  const dst: V3[] = [];
  const tags: LmTag[] = [];
  const add = (s: V3, d: V3 | null | undefined, tag: LmTag = 'mid') => {
    if (!d || d.some((x) => !Number.isFinite(x))) return;
    src.push(s);
    dst.push(d);
    tags.push(tag);
  };
  const top = (pts: V3[], frac: number) => {
    const ys = pts.map((p) => p[1]);
    const max = Math.max(...ys);
    const min = Math.min(...ys);
    return pts.filter((p) => p[1] >= max - (max - min) * frac);
  };
  const bottom = (pts: V3[], frac: number) => {
    const ys = pts.map((p) => p[1]);
    const max = Math.max(...ys);
    const min = Math.min(...ys);
    return pts.filter((p) => p[1] <= min + (max - min) * frac);
  };
  // skull & trunk (midline)
  const skull = ['Frontal bone', 'Occipital bone', 'Left parietal bone', 'Right parietal bone'].flatMap((n) => byName(n) ?? []);
  if (skull.length) {
    add(LM.vertex, argmax(skull, (p) => p[1]), 'head');
    const bb = new THREE.Box3().setFromPoints(skull.map((p) => new THREE.Vector3(...p)));
    const c = bb.getCenter(new THREE.Vector3());
    add(LM.craniumC, [c.x, c.y - 0.01, c.z], 'head');
  }
  const mand = byName('Mandible');
  if (mand) add(LM.chin, argmax(mand, (p) => p[2] - p[1] * 0.3), 'head');
  const man = byName('Manubrium');
  if (man) add(LM.jugularNotch, argmax(man, (p) => p[1]), 'mid');
  const xi = byName('Xiphoid process');
  if (xi) add(LM.xiphoid, argmax(xi, (p) => -p[1]), 'mid');
  const hipsBoth = [...(byName('Left hip bone') ?? []), ...(byName('Right hip bone') ?? [])];
  if (hipsBoth.length) add(LM.pubicSymphysis, argmax(hipsBoth, (p) => p[2] - Math.abs(p[0]) * 3), 'pubis');
  // vertebral bodies: front 40 % of each vertebra
  const VN = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
  SPINE.forEach((s) => {
    const k = s.name[0];
    const i = +s.name.slice(1);
    const nm = s.name === 'C1' ? 'Atlas' : s.name === 'C2' ? 'Axis' : `${VN[i - 1][0].toUpperCase()}${VN[i - 1].slice(1)} ${k === 'C' ? 'cervical' : k === 'T' ? 'thoracic' : 'lumbar'} vertebra`;
    const pts = byName(nm);
    if (!pts) return;
    const zs = pts.map((p) => p[2]);
    const zmax = Math.max(...zs);
    const zmin = Math.min(...zs);
    const front = pts.filter((p) => p[2] > zmax - (zmax - zmin) * 0.35);
    add([0, s.y, s.z], centroid(front), 'spine');
  });
  // paired landmarks
  for (const [S, sign] of [['Left', 1], ['Right', -1]] as const) {
    const P = (p: V3): V3 => [p[0] * sign, p[1], p[2]];
    const hum = byName(`${S} humerus`);
    if (hum) {
      add(P(LM.shoulder), centroid(top(hum, 0.07)), 'shoulder');
      add(P(LM.elbow), centroid(bottom(hum, 0.05)), 'elbow');
    }
    const rad = byName(`${S} radius`);
    const uln = byName(`${S} ulna`);
    if (rad) add(P(LM.wristRadial), centroid(bottom(rad, 0.04)), 'wrist');
    if (uln) add(P(LM.wristUlnar), centroid(bottom(uln, 0.04)), 'wrist');
    if (rad && uln) add(P(LM.wrist), centroid([...bottom(rad, 0.04), ...bottom(uln, 0.04)]), 'wrist');
    const tip = byName(`Distal phalanx of ${S.toLowerCase()} middle finger`);
    if (tip) add(P([0.36, 0.68, 0.03]), argmax(tip, (p) => -p[1]), 'hand');
    const sca = byName(`${S} scapula`);
    if (sca) {
      add(P(LM.scapInferior), argmax(sca, (p) => -p[1]), 'shoulder');
      add(P(LM.acromion), argmax(sca, (p) => Math.abs(p[0]) + p[1] * 0.5), 'shoulder');
    }
    const cla = byName(`${S} clavicle`);
    if (cla) add(P(LM.sternoclavicular), argmax(cla, (p) => -Math.abs(p[0])), 'clavicle');
    const hip = byName(`${S} hip bone`);
    if (hip) {
      add(P(LM.iliacCrest), argmax(hip, (p) => p[1]), 'pelvis');
      add(P(LM.asis), argmax(hip, (p) => p[2] + p[1] * 0.5), 'pelvis');
      add(P(LM.ischialTuberosity), argmax(hip, (p) => -p[1]), 'ischium');
    }
    const fem = byName(`${S} femur`);
    if (fem) {
      // femoral head = medial half of the top 8 % of the femur
      const head = top(fem, 0.08).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
      add(P(LM.hip), centroid(head.slice(0, Math.max(5, head.length >> 1))), 'hip');
      add(P(LM.greaterTrochanter), argmax(top(fem, 0.15), (p) => Math.abs(p[0])), 'hip');
      add(P(LM.knee), centroid(bottom(fem, 0.05)), 'knee');
    }
    const tib = byName(`${S} tibia`);
    if (tib) add(P(LM.medMalleolus), argmax(tib, (p) => -p[1]), 'foot');
    const fib = byName(`${S} fibula`);
    if (fib) add(P(LM.latMalleolus), argmax(fib, (p) => -p[1]), 'foot');
    const tal = byName(`${S} talus`);
    if (tal) add(P(LM.ankle), centroid(tal), 'foot');
    const cal = byName(`${S} calcaneus`);
    if (cal) add(P(LM.heel), argmax(cal, (p) => -p[2] - p[1]), 'foot');
    const toe = byName(`Distal phalanx of ${S.toLowerCase()} big toe`);
    if (toe) add(P([0.075, 0.015, 0.165]), argmax(toe, (p) => p[2]), 'foot');
    // ribs 1, 4, 7, 10: vertebral end, lateral-most point, anterior end
    for (const i of [0, 3, 6, 9]) {
      const rib = byName(`${S} ${VN[i]} rib`);
      if (!rib) continue;
      const curve = ribCurve(i, sign);
      add(curve[0], argmax(rib, (p) => -Math.abs(p[0]) - p[2]), 'rib');
      add(curve[3], argmax(rib, (p) => Math.abs(p[0])), 'rib');
      add(curve[5], argmax(rib, (p) => p[2]), 'rib');
    }
  }
  return { src, dst, tags };
}

/* ============================== female morph ============================== */
/**
 * Female target for a landmark of the real (male) body. Typical adult sex differences:
 * ~6 % shorter, narrower shoulders and chest, wider pelvis (iliac crests, hip joints, much wider
 * ischial tuberosities → wider pelvic outlet and subpubic angle), knees kept close (larger Q
 * angle), slightly larger elbow carrying angle (forearms angle outward relative to the shoulders).
 */
function femaleize(d: V3, tag: LmTag): V3 {
  const H = 0.94; // height
  const D = 0.96; // antero-posterior depth
  const fx: Record<LmTag, number> = {
    mid: 1, head: 0.95, spine: 1, pubis: 1, clavicle: 0.94,
    shoulder: 0.87, elbow: 0.88, wrist: 0.92, hand: 0.93, rib: 0.92,
    pelvis: 1.1, hip: 1.1, ischium: 1.22, knee: 1.0, foot: 0.97,
  };
  const head = tag === 'head';
  return [d[0] * fx[tag], d[1] * H - (head ? 0.01 : 0), d[2] * (head ? 0.95 : D)];
}

/**
 * The BodyParts3D skin is male. For the female body the external male genitalia are smoothed
 * away: vertices in the genital region are pulled back onto the groin contour taken from the
 * neighbouring skin at the same height.
 */
function smoothMaleGenitalSkin(geom: THREE.BufferGeometry) {
  const g = geom.clone();
  const p = g.attributes.position as THREE.BufferAttribute;
  const bin = (y: number) => Math.round(y / 0.005);
  // groin contour: front-most skin just lateral to the genital region, per 5 mm height bin
  const front = new Map<number, number>();
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(p.getX(i)), y = p.getY(i), z = p.getZ(i);
    if (x > 0.075 && x < 0.1 && y > 0.66 && y < 0.95) front.set(bin(y), Math.max(front.get(bin(y)) ?? -1, z));
  }
  const limit = (y: number) => {
    for (let k = 0; k < 6; k++) {
      const v = front.get(bin(y) + k) ?? front.get(bin(y) - k);
      if (v !== undefined) return v;
    }
    return 0;
  };
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(p.getX(i)), y = p.getY(i), z = p.getZ(i);
    if (x > 0.085 || y < 0.66 || y > 0.93) continue;
    const w = (1 - smooth(0.06, 0.085, x)) * smooth(0.66, 0.7, y) * (1 - smooth(0.9, 0.93, y));
    // front: no further forward than the groin contour (mons pubis)
    const zl = limit(y) + 0.006;
    let nz = z > zl ? z + (zl - z) * w : z;
    // below the pubis: lift hanging tissue up to the perineum level between the thighs
    let ny = y;
    if (y < 0.8 && nz > -0.04) ny = y + (0.8 - y) * w * smooth(-0.04, 0.0, nz);
    if (ny > 0.8) nz = Math.min(nz, zl);
    p.setXYZ(i, p.getX(i), ny, nz);
  }
  g.computeVertexNormals();
  return g;
}

/** Breast contour: smooth forward bulge of the chest skin enclosing each mammary gland. */
function addBreastContour(geom: THREE.BufferGeometry, glands: { c: THREE.Vector3; zTop: number }[]) {
  const g = geom.clone();
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (const { c, zTop } of glands) {
    // skin height at the gland centre (front-most skin vertex near it)
    let zSkin = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - c.x, p.getY(i) - c.y) < 0.02 && n.getZ(i) > 0.2) zSkin = Math.max(zSkin, p.getZ(i));
    if (!Number.isFinite(zSkin)) continue;
    const amp = Math.max(0.03, zTop + 0.008 - zSkin);
    for (let i = 0; i < p.count; i++) {
      if (n.getZ(i) < 0.05) continue; // front-facing skin only
      const dx = p.getX(i) - c.x;
      const dy = p.getY(i) - (c.y - 0.01);
      const r2 = (dx * dx) / (0.055 * 0.055) + (dy * dy) / (0.05 * 0.05);
      if (r2 > 6) continue;
      const f = Math.exp(-r2 * 0.9) * smooth(0.05, 0.3, n.getZ(i));
      p.setXYZ(i, p.getX(i), p.getY(i) - 0.008 * f, p.getZ(i) + amp * f);
    }
  }
  g.computeVertexNormals();
  return g;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ============================== envelopes & smoothing ============================== */
/**
 * Smooth star-shaped envelope around a point cloud (lung lobes, ventricular myocardium):
 * for each direction from the centre, the farthest point inside a small cone sets the radius;
 * the radius field is then smoothed over the sphere and inflated slightly.
 */
function envelope(points: V3[], opts: { detail?: number; cone?: number; smooth?: number; inflate?: number; center?: V3 } = {}) {
  const c = opts.center ?? centroid(points);
  const ico = new THREE.IcosahedronGeometry(1, opts.detail ?? 24);
  const g = mergeVertices(ico.deleteAttribute('normal').deleteAttribute('uv'), 1e-5);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const dirs = verts(g).map((d) => {
    const l = Math.hypot(...d);
    return [d[0] / l, d[1] / l, d[2] / l] as V3;
  });
  const pd = points.map((p) => {
    const v: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const l = Math.hypot(...v) || 1e-6;
    return { d: [v[0] / l, v[1] / l, v[2] / l] as V3, l };
  });
  const cosCone = Math.cos(((opts.cone ?? 14) * Math.PI) / 180);
  let r = dirs.map((d) => {
    let m = 0;
    for (const q of pd) if (q.d[0] * d[0] + q.d[1] * d[1] + q.d[2] * d[2] > cosCone && q.l > m) m = q.l;
    return m;
  });
  // neighbour graph
  const idx = g.index!.array;
  const nb: Set<number>[] = dirs.map(() => new Set());
  for (let i = 0; i < idx.length; i += 3)
    for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
      nb[a].add(b);
      nb[b].add(a);
    }
  // fill empty directions, then smooth
  for (let it = 0; it < 40 && r.some((x) => x === 0); it++)
    r = r.map((x, i) => (x > 0 ? x : [...nb[i]].reduce((s, j) => Math.max(s, r[j]), 0) * 0.98));
  for (let it = 0; it < (opts.smooth ?? 12); it++) r = r.map((x, i) => 0.5 * x + (0.5 * [...nb[i]].reduce((s, j) => s + r[j], 0)) / nb[i].size);
  const infl = opts.inflate ?? 0.003;
  for (let i = 0; i < pos.count; i++) {
    const d = dirs[i];
    const R = r[i] + infl;
    pos.setXYZ(i, c[0] + d[0] * R, c[1] + d[1] * R, c[2] + d[2] * R);
  }
  g.computeVertexNormals();
  return g;
}

/** Midpoint subdivision + Taubin smoothing for low-poly scans (stomach, kidneys). */
function subdivideSmooth(geom: THREE.BufferGeometry, levels = 1, iterations = 8) {
  let g = mergeVertices(geom.clone().deleteAttribute('normal'), 1e-6);
  for (let l = 0; l < levels; l++) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!.array;
    const P = Array.from(p.array as Float32Array);
    const mids = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      let m = mids.get(k);
      if (m === undefined) {
        m = P.length / 3;
        P.push((P[a * 3] + P[b * 3]) / 2, (P[a * 3 + 1] + P[b * 3 + 1]) / 2, (P[a * 3 + 2] + P[b * 3 + 2]) / 2);
        mids.set(k, m);
      }
      return m;
    };
    const I: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
  }
  const p = g.attributes.position as THREE.BufferAttribute;
  const idx = g.index!.array;
  const nb: Set<number>[] = Array.from({ length: p.count }, () => new Set());
  for (let i = 0; i < idx.length; i += 3)
    for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
      nb[a].add(b);
      nb[b].add(a);
    }
  const arr = p.array as Float32Array;
  for (let it = 0; it < iterations; it++)
    for (const f of [0.5, -0.53]) {
      const copy = arr.slice();
      for (let i = 0; i < p.count; i++) {
        let sx = 0, sy = 0, sz = 0;
        for (const j of nb[i]) {
          sx += copy[j * 3];
          sy += copy[j * 3 + 1];
          sz += copy[j * 3 + 2];
        }
        const n = nb[i].size || 1;
        arr[i * 3] += f * (sx / n - copy[i * 3]);
        arr[i * 3 + 1] += f * (sy / n - copy[i * 3 + 1]);
        arr[i * 3 + 2] += f * (sz / n - copy[i * 3 + 2]);
      }
    }
  g.computeVertexNormals();
  return g;
}

/** Keep only triangles whose vertices all lie inside a box (trim long vessels for organ views). */
function clipToBox(geom: THREE.BufferGeometry, box: THREE.Box3) {
  const p = geom.attributes.position;
  const idx = geom.index!.array;
  const keep: number[] = [];
  const v = new THREE.Vector3();
  const inside = (i: number) => box.containsPoint(v.fromBufferAttribute(p, i));
  for (let i = 0; i < idx.length; i += 3) if (inside(idx[i]) && inside(idx[i + 1]) && inside(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  if (!keep.length) return null;
  // compact: keep only referenced vertices (otherwise trimmed-away vertices would still count
  // for bounding boxes and hotspot anchors)
  const remap = new Map<number, number>();
  const pos: number[] = [];
  const I = keep.map((i) => {
    let r = remap.get(i);
    if (r === undefined) {
      r = pos.length / 3;
      remap.set(i, r);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    return r;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/* ============================== GLB writing ============================== */
async function writeGlb(file: string, meshes: { name: string; geom: THREE.BufferGeometry; extras?: Record<string, unknown> }[], opts: { simplifyRatio?: number }) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  await MeshoptSimplifier.ready;
  // LOD: large meshes also get a coarse version (node "<name>__lod", extras.lodOf) that the
  // viewer swaps in when the structure is small on screen
  const lods: { name: string; geom: THREE.BufferGeometry; extras: Record<string, unknown> }[] = [];
  for (const m of meshes) {
    const tris = (m.geom.index ? m.geom.index.count : m.geom.attributes.position.count) / 3;
    if (tris < LOD_MIN_TRIS) continue;
    const w = mergeVertices(m.geom.clone().deleteAttribute('normal'), 1e-6);
    const [idx] = MeshoptSimplifier.simplify(new Uint32Array(w.index!.array), new Float32Array(w.attributes.position.array), 3, Math.floor(w.index!.count * LOD_RATIO / 3) * 3, 0.01);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', w.attributes.position.clone());
    lg.setIndex(Array.from(idx));
    lg.computeVertexNormals();
    lods.push({ name: `${m.name}__lod`, geom: lg, extras: { lodOf: m.name } });
  }
  for (const m of [...meshes, ...lods]) {
    const g = m.geom.index ? m.geom : mergeVertices(m.geom, 1e-6);
    if (!g.attributes.normal) g.computeVertexNormals();
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.position.array)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.index!.array)).setBuffer(buffer));
    const mesh: GMesh = doc.createMesh(m.name).addPrimitive(prim);
    scene.addChild(doc.createNode(m.name).setMesh(mesh).setExtras(m.extras ?? {}));
  }
  const transforms = [dedup(), weld()];
  if (opts.simplifyRatio && opts.simplifyRatio < 1) transforms.push(simplify({ simplifier: MeshoptSimplifier, ratio: opts.simplifyRatio, error: 0.0008 }));
  transforms.push(prune(), draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10 }));
  await doc.transform(...transforms);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await io.write(file, doc);
  return fs.statSync(file).size;
}

/* ============================== main ============================== */
async function main() {
  const zipFile = await fetchToCache(ZIP);
  const elemFile = await fetchToCache(ELEMENTS);
  log('reading meshes …');
  const zip = unzipSync(new Uint8Array(fs.readFileSync(zipFile)), { filter: (f) => f.name.endsWith('.obj') });
  const parts: Part[] = Object.entries(zip).map(([f, data]) => ({ file: path.basename(f, '.obj'), ...parseObj(strFromU8(data)) }));
  log(`${parts.length} BodyParts3D meshes`);

  // concept membership: element file → systems it belongs to; concept name → elements
  const systemsOf = new Map<string, string[]>();
  const conceptEls = new Map<string, Set<string>>();
  for (const line of fs.readFileSync(elemFile, 'utf8').split('\n').slice(1)) {
    const [, name, el] = line.trim().split('\t');
    if (!el) continue;
    const n = name.toLowerCase();
    if (!conceptEls.has(n)) conceptEls.set(n, new Set());
    conceptEls.get(n)!.add(el);
    if (n.endsWith(' system')) systemsOf.set(el, [...(systemsOf.get(el) ?? []), n]);
  }
  const partsByName = new Map<string, Part[]>();
  for (const p of parts) partsByName.set(p.name, [...(partsByName.get(p.name) ?? []), p]);
  const byName = (n: string) => {
    const ps = partsByName.get(n);
    return ps ? ps.flatMap((p) => verts(p.geom)) : null;
  };

  // ---------- warp: procedural reference body → real body ----------
  const { src, dst, tags } = landmarkPairs(byName);
  const tps = new TPS(src, dst);
  const err = Math.max(...src.map((s, i) => dist(tps.apply(s), dst[i])));
  log(`thin-plate warp fitted to ${src.length} landmarks (max residual ${(err * 1000).toFixed(2)} mm)`);
  const warp = (geom: THREE.BufferGeometry) => {
    const g = geom.clone();
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const w = tps.apply([p.getX(i), p.getY(i), p.getZ(i)]);
      p.setXYZ(i, w[0], w[1], w[2]);
    }
    g.computeVertexNormals();
    return g;
  };

  // ---------- catalog matching ----------
  const cat = getCatalog('male');
  const byCanon = new Map<string, StructureDef>();
  for (const d of cat.list) byCanon.set(`${canonical(d.nameEn)}|${d.side}`, d);
  const usedIds = new Set<string>();
  const coveredCatalogIds = new Set<string>();
  type Rec = StructureRecord & { kind: StructureKind; fmaId?: string; source: 'bodyparts3d' | 'procedural' | 'reconstructed' };
  const records: Rec[] = [];
  const bySystem = new Map<SystemId, { name: string; geom: THREE.BufferGeometry; extras: Record<string, unknown> }[]>();
  const push = (rec: Rec, geom: THREE.BufferGeometry) => {
    records.push(rec);
    if (!bySystem.has(rec.system)) bySystem.set(rec.system, []);
    bySystem.get(rec.system)!.push({ name: rec.id, geom, extras: { catalogId: rec.id } });
  };
  const uniqueId = (base: string) => {
    let id = base;
    for (let k = 2; usedIds.has(id); k++) id = `${base}-${k}`;
    usedIds.add(id);
    return id;
  };

  let matched = 0;
  for (const p of parts) {
    const cls = classify(p, systemsOf);
    if (!cls) continue;
    const side = sideOf(p.name);
    const direct = byCanon.get(`${canonical(p.name)}|${side}`);
    const aliasId = aliasFor(p.name);
    const alias = aliasId ? cat.byId.get(aliasId) : undefined;
    const base = direct ?? alias;
    if (base) {
      matched++;
      coveredCatalogIds.add(base.id);
    }
    const id = uniqueId(direct && !usedIds.has(direct.id) ? direct.id : `${slug(stripSide(p.name))}${side === 'left' ? '-l' : side === 'right' ? '-r' : ''}`);
    p.geom.computeBoundingBox();
    const isTitle = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const nameEn = direct ? direct.nameEn : isTitle(stripSide(p.name));
    const layer: LayerIndex = cls.kind === 'skin' ? 0 : cls.kind === 'bone' || cls.kind === 'cartilage' ? (cls.system === 'skeletal' ? 4 : 3) : cls.kind === 'muscle' ? (base?.layer ?? (/minor|subclavius|psoas|piriformis|obturator|transversus|brachialis|coracobrachialis|levator|rhomboid|rectus|oblique$/.test(p.name.toLowerCase()) ? 2 : 1)) : 3;
    push(
      {
        id,
        nameEn,
        nameLatin: base?.nameLatin ?? '',
        taId: direct?.taId ?? null,
        fmaId: p.fma,
        system: cls.system,
        kind: cls.kind,
        region: base?.region ?? (/vertebra|intervertebral|sacrum|coccyx/i.test(p.name) ? (p.geom.boundingBox!.max.y > 1.47 ? 'head-neck' : 'back') : regionOf(p.geom.boundingBox!, cls.system, cls.kind)),
        layer: layer as LayerIndex,
        side,
        sex: 'male',
        meshFile: `male/${cls.system}.glb`,
        overview: direct?.overview ?? (alias ? `${nameEn} — part of the ${alias.nameEn.toLowerCase()}. ${alias.overview}` : `${nameEn} (${p.fma}).`),
        clinicalNote: base?.clinicalNote ?? '',
        facts: base?.facts ?? {},
        source: 'bodyparts3d',
      },
      p.geom,
    );
  }
  log(`${matched} meshes matched curated AnatoVerse structures`);

  // ---------- reconstructed lung lobes ----------
  const lobeOf = (name: string, lung: 'right' | 'left') => {
    const n = name.toLowerCase();
    if (/basal|superior segmental/.test(n)) return 'lower';
    if (lung === 'right') return /lateral segmental|medial segmental/.test(n) ? 'middle' : /apical|posterior segmental|anterior segmental/.test(n) ? 'upper' : null;
    return /apical|posterior segmental|anterior segmental|lingular/.test(n) ? 'upper' : null;
  };
  const lobes: { id: string; nameEn: string; pts: V3[] }[] = [];
  for (const lung of ['right', 'left'] as const) {
    const els = conceptEls.get(`${lung} lung`) ?? new Set();
    const groups: Record<string, V3[]> = {};
    for (const p of parts) if (els.has(p.file)) {
      const lobe = lobeOf(p.name, lung);
      if (lobe) (groups[lobe] ??= []).push(...verts(p.geom));
    }
    for (const [lobe, pts] of Object.entries(groups)) lobes.push({ id: `lung-${lung}-${lobe}-lobe`, nameEn: `${lung === 'right' ? 'Right' : 'Left'} lung — ${lobe} lobe`, pts });
  }
  const lobeGeoms = new Map<string, THREE.BufferGeometry>();
  for (const l of lobes) {
    const g = envelope(l.pts, { detail: 22, cone: 22, smooth: 28, inflate: 0.012 }); // lung tissue extends ~1–2 cm beyond the visible airways
    lobeGeoms.set(l.id, g);
    const base = cat.byId.get(l.id);
    push({ id: uniqueId(l.id), nameEn: `${l.nameEn} (reconstructed)`, nameLatin: base?.nameLatin ?? '', taId: null, system: 'respiratory', kind: 'organ', region: 'thorax', layer: 3, side: l.id.includes('right') ? 'right' : 'left', sex: 'male', meshFile: 'male/respiratory.glb', overview: `${l.nameEn}. Surface reconstructed as an envelope around the real BodyParts3D bronchial tree and pulmonary vessels of this lobe (the dataset has no lung parenchyma surface). ${base?.overview ?? ''}`, clinicalNote: base?.clinicalNote ?? '', facts: base?.facts ?? {}, source: 'reconstructed' }, g);
    if (base) coveredCatalogIds.add(base.id);
  }

  // ---------- reconstructed ventricular myocardium ----------
  const heartEls = conceptEls.get('heart') ?? new Set();
  const heartParts = parts.filter((p) => heartEls.has(p.file));
  const ventPts = heartParts.filter((p) => /cavity of (left|right) ventricle|coronary|interventricular|marginal|cardiac vein|ventricular branch|papillary/i.test(p.name)).flatMap((p) => verts(p.geom));
  const myocardium = envelope(ventPts, { detail: 26, cone: 11, smooth: 9, inflate: 0.0015 });
  push({ id: uniqueId('ventricular-myocardium'), nameEn: 'Ventricular myocardium (reconstructed)', nameLatin: 'myocardium ventriculorum', taId: null, system: 'cardiovascular', kind: 'organ', region: 'thorax', layer: 3, side: 'midline', sex: 'male', meshFile: 'male/cardiovascular.glb', overview: 'Muscular walls of the right and left ventricles. Reconstructed as the surface enclosing the real ventricular cavities and the coronary vessels that run on the epicardium (BodyParts3D has no ventricular wall mesh).', clinicalNote: cat.byId.get('heart')?.clinicalNote ?? '', facts: cat.byId.get('heart')?.facts ?? {}, source: 'reconstructed' }, myocardium);

  // ---------- procedural structures the dataset lacks, warped onto the real body ----------
  const KEEP: Partial<Record<SystemId, (d: StructureDef) => boolean>> = {
    muscular: (d) => !coveredCatalogIds.has(d.id) && d.id !== 'diaphragm',
    nervous: (d) => !/^(cerebral-hemisphere|cerebellum|midbrain|pons|medulla|corpus-callosum|eyeball)/.test(d.id),
    lymphatic: (d) => d.id !== 'thymus',
    reproductive: (d) => d.id !== 'prostate' && d.sex !== 'female',
    respiratory: (d) => ['nasal-cavity', 'larynx'].includes(d.id),
    digestive: (d) => /^(parotid|pharynx|caecum|sigmoid-colon)/.test(d.id),
    urinary: () => false,
  };
  let warped = 0;
  for (const [sys, keep] of Object.entries(KEEP) as [SystemId, (d: StructureDef) => boolean][]) {
    for (const d of cat.bySystem.get(sys) ?? []) {
      if (!keep(d) || (d.sex !== 'both' && d.sex !== 'male')) continue;
      const { build, ...rec } = d;
      push({ ...rec, id: uniqueId(d.id), meshFile: `male/${sys}.glb`, source: 'procedural' }, warp(build()));
      warped++;
    }
  }
  log(`${warped} procedural structures warped onto the real skeleton`);

  // ---------- write body GLBs ----------
  const manifest: { male: Record<string, string>; female?: Record<string, string>; organs: Record<string, string>; credit: string } = { male: {}, organs: {}, credit: CREDIT };
  for (const [sys, list] of bySystem) {
    const file = path.join(OUT, 'male', `${sys}.glb`);
    const ratio = sys === 'integumentary' ? 0.35 : sys === 'nervous' || sys === 'cardiovascular' || sys === 'skeletal' ? 0.5 : 0.65;
    const bytes = await writeGlb(file, list, { simplifyRatio: ratio });
    manifest.male[sys] = `male/${sys}.glb`;
    log(`male/${sys}.glb  ${list.length} meshes  ${(bytes / 1e6).toFixed(2)} MB`);
  }
  fs.writeFileSync(path.join(OUT, 'male', 'catalog.json'), JSON.stringify(records));

  // ---------- female body: the real male anatomy morphed to adult female proportions ----------
  // One smooth thin-plate warp (male landmarks → female-proportioned landmarks) is applied to
  // every layer, so skeleton, muscles, nerves, vessels, organs and skin stay aligned.
  const fDst = dst.map((d, i) => femaleize(d, tags[i]));
  const tpsF = new TPS(dst, fDst);
  const warpF = (geom: THREE.BufferGeometry) => {
    const g = geom.clone();
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const w = tpsF.apply([p.getX(i), p.getY(i), p.getZ(i)]);
      p.setXYZ(i, w[0], w[1], w[2]);
    }
    g.computeVertexNormals();
    return g;
  };
  const MALE_ONLY = /^(prostate|penis|testis|vas-deferens|seminal-vesicle|urethra-male|urethra)(-[lr])?(-\d+)?$/;
  const fRecords: Rec[] = [];
  const fBySystem = new Map<SystemId, { name: string; geom: THREE.BufferGeometry; extras: Record<string, unknown> }[]>();
  const pushF = (rec: Rec, geom: THREE.BufferGeometry) => {
    fRecords.push(rec);
    if (!fBySystem.has(rec.system)) fBySystem.set(rec.system, []);
    fBySystem.get(rec.system)!.push({ name: rec.id, geom, extras: { catalogId: rec.id } });
  };
  const recById = new Map(records.map((r) => [r.id, r]));
  for (const [, list] of bySystem)
    for (const m of list) {
      if (MALE_ONLY.test(m.name)) continue;
      const rec = recById.get(m.name)!;
      let g = m.geom;
      if (rec.system === 'integumentary' && rec.id === 'skin') g = smoothMaleGenitalSkin(g);
      pushF({ ...rec, sex: 'female', meshFile: `female/${rec.system}.glb` }, warpF(g));
    }
  // female organs (AnatoVerse schematic models, fitted with both warps: reference → real male → female)
  const fCat = getCatalog('female');
  const femaleOrgans = [...(fCat.bySystem.get('reproductive') ?? []), ...(fCat.bySystem.get('urinary') ?? [])].filter((d) => d.sex === 'female');
  const glandTops: { c: THREE.Vector3; zTop: number }[] = [];
  for (const d of femaleOrgans) {
    const { build, ...rec } = d;
    const g = warpF(warp(build()));
    if (/^mammary-gland/.test(d.id)) {
      g.computeBoundingBox();
      glandTops.push({ c: g.boundingBox!.getCenter(new THREE.Vector3()), zTop: g.boundingBox!.max.z });
    }
    pushF({ ...rec, id: uniqueId(d.id), sex: 'female', meshFile: `female/${d.system}.glb`, source: 'procedural' }, g);
  }
  // breast contour on the skin, enclosing the mammary glands
  const fSkin = fBySystem.get('integumentary')?.find((m) => m.name === 'skin');
  if (fSkin) fSkin.geom = addBreastContour(fSkin.geom, glandTops);
  manifest.female = {};
  for (const [sys, list] of fBySystem) {
    const file = path.join(OUT, 'female', `${sys}.glb`);
    const ratio = sys === 'integumentary' ? 0.35 : sys === 'nervous' || sys === 'cardiovascular' || sys === 'skeletal' ? 0.5 : 0.65;
    const bytes = await writeGlb(file, list, { simplifyRatio: ratio });
    manifest.female[sys] = `female/${sys}.glb`;
    log(`female/${sys}.glb  ${list.length} meshes  ${(bytes / 1e6).toFixed(2)} MB`);
  }
  fs.writeFileSync(path.join(OUT, 'female', 'catalog.json'), JSON.stringify(fRecords));

  // ---------- organs ----------
  await buildOrgans(parts, conceptEls, lobeGeoms, myocardium, manifest);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'LICENSE.txt'),
    `The 3-D models in this folder are derived from BodyParts3D, (c) The Database Center for Life Science,\nlicensed under Creative Commons Attribution-Share Alike 2.1 Japan\n(https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en).\nThey are distributed under the same licence. Generated by scripts/build-models.ts.\nStructures marked "(reconstructed)" and the procedural structures warped onto the body were created by AnatoVerse.\n`,
  );
  log('done');
}

/* ============================== organ models ============================== */
type OrganPart = { name: string; geom: THREE.BufferGeometry; role: string };
interface HotspotRule {
  label: string;
  /** part-name pattern, or a custom anchor function */
  part?: RegExp;
  anchor?: (parts: OrganPart[], center: THREE.Vector3) => THREE.Vector3 | null;
  internal?: boolean;
}

/** Outermost point of a part in the direction from the organ centre to the part's centroid. */
function surfaceAnchor(geoms: THREE.BufferGeometry[], center: THREE.Vector3) {
  const pts = geoms.flatMap(verts);
  if (!pts.length) return null;
  const c = new THREE.Vector3(...centroid(pts));
  const dir = c.clone().sub(center).normalize();
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
  return new THREE.Vector3(...argmax(pts, (p) => (p[0] - center.x) * dir.x + (p[1] - center.y) * dir.y + (p[2] - center.z) * dir.z - 0.6 * Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z)));
}

async function buildOrgans(parts: Part[], conceptEls: Map<string, Set<string>>, lobeGeoms: Map<string, THREE.BufferGeometry>, myocardium: THREE.BufferGeometry, manifest: { organs: Record<string, string> }) {
  const organsJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'organs.json'), 'utf8')) as { id: string; hotspots: { number: number; label: string; description: string; important?: boolean }[] }[];
  const named = (re: RegExp) => parts.filter((p) => re.test(p.name));
  const inConcept = (c: string) => {
    const s = conceptEls.get(c) ?? new Set();
    return parts.filter((p) => s.has(p.file));
  };
  const boxOf = (ps: { geom: THREE.BufferGeometry }[]) => {
    const b = new THREE.Box3();
    for (const p of ps) b.union(new THREE.Box3().setFromBufferAttribute(p.geom.attributes.position as THREE.BufferAttribute));
    return b;
  };
  const roleOf = (n: string) => {
    const l = n.toLowerCase();
    if (/artery|aorta|arterial|trunk|branch/.test(l) && !/bronch/.test(l)) return 'artery';
    if (/vein|vena|sinus|tributary/.test(l) && !/biliary/.test(l)) return 'vein';
    if (/bronch|trachea/.test(l)) return 'airway';
    if (/biliary|duct|gallbladder/.test(l)) return 'bile';
    if (/cavity/.test(l)) return 'cavity';
    if (/leaflet|cusp|papillary/.test(l)) return 'valve';
    if (/cornea|anterior chamber/.test(l)) return 'cornea';
    if (/lens|suspensory/.test(l)) return 'lens';
    if (/\biris\b/.test(l)) return 'iris';
    if (/sclera/.test(l)) return 'sclera';
    if (/choroid/.test(l)) return 'choroid';
    if (/vitreous/.test(l)) return 'vitreous';
    if (/rectus|oblique|levator/.test(l)) return 'muscle';
    if (/diaphragm/.test(l)) return 'diaphragm';
    if (/lobe|lung/.test(l)) return 'lung';
    if (/gyrus|lobule|occipital lobe|insula|cerebral hemisphere|white matter/.test(l)) return 'cortex';
    if (/cerebellum/.test(l)) return 'cerebellum';
    if (/pons|midbrain|medulla|hypothal|thalam|tuber|colliculus|hippocamp|brain/.test(l)) return 'brainstem';
    if (/kidney/.test(l)) return 'kidney';
    if (/adrenal|suprarenal gland/.test(l)) return 'adrenal';
    if (/ureter/.test(l)) return 'ureter';
    if (/liver|hepatovenous|caudate lobe of liver/.test(l)) return 'liver';
    if (/stomach/.test(l)) return 'stomach';
    if (/esophag/.test(l)) return 'esophagus';
    if (/duoden/.test(l)) return 'duodenum';
    if (/myocardium|atrium/.test(l)) return 'myocardium';
    return 'tissue';
  };

  type OrganSpec = { id: string; parts: OrganPart[]; clip?: THREE.Box3 | null; rules: HotspotRule[] };
  const P = (ps: Part[], tweak?: (g: THREE.BufferGeometry, p: Part) => THREE.BufferGeometry): OrganPart[] => ps.map((p) => ({ name: p.name, geom: tweak ? tweak(p.geom, p) : p.geom, role: roleOf(p.name) }));
  const extra = (name: string, geom: THREE.BufferGeometry, role: string): OrganPart => ({ name, geom, role });

  // heart: walls, valves, chambers, coronaries + reconstructed myocardium + great vessels near the base
  const heartParts = inConcept('heart');
  const heartBox = boxOf(heartParts).expandByVector(new THREE.Vector3(0.015, 0.05, 0.02));
  const greatVessels = named(/^(Ascending aorta|Arch of aorta|Pulmonary trunk|Left pulmonary artery|Right pulmonary artery|Superior vena cava|Inferior vena cava|Left (superior|inferior) pulmonary vein|Right (superior|inferior) pulmonary vein|Brachiocephalic trunk|Left common carotid artery|Left subclavian artery)$/);
  const lungParts = [...inConcept('right lung'), ...inConcept('left lung')].filter((p) => /bronchial tree/i.test(p.name));
  const brainParts = inConcept('brain');
  const eyeParts = [...inConcept('left eyeball'), ...named(/^Left (superior|inferior|medial|lateral) rectus$|^Left (superior|inferior) oblique$/)];
  const liverParts = [...inConcept('liver'), ...named(/^(Gallbladder|Cystic duct|Common hepatic duct|Hepatic portal vein|Proper hepatic artery|Common hepatic artery|Inferior vena cava)$/)];
  const kidneyParts = named(/^(Left|Right) kidney$|^(Left|Right) adrenal gland$|^(Left|Right) renal artery$|^Trunk of (left|right) renal artery$|^(Left|Right) ureter$|^Abdominal aorta$|^Inferior vena cava$/);
  const stomachParts = named(/^(Stomach|Esophagus|Duodenum)$/);

  const H = (label: string, part?: RegExp, internal = false): HotspotRule => ({ label, part, internal });
  const specs: OrganSpec[] = [
    {
      id: 'heart',
      parts: [...P(heartParts), ...P(greatVessels), extra('Ventricular myocardium (reconstructed)', myocardium, 'myocardium')],
      clip: heartBox,
      rules: [
        H('Aorta', /^Arch of aorta$/),
        { label: 'Superior vena cava', anchor: (ps) => nearestTo(ps, /^Superior vena cava$/, /^Wall of right atrium$/, 0.6) },
        H('Pulmonary trunk', /^Pulmonary trunk$/),
        H('Right atrium', /^Wall of right atrium$/),
        H('Left atrium', /^Wall of left atrium$/),
        { label: 'Right ventricle', anchor: (ps, c) => towards(ps, /myocardium/i, ps.find((p) => /cavity of right ventricle/i.test(p.name)), c) },
        { label: 'Left ventricle', anchor: (ps, c) => towards(ps, /myocardium/i, ps.find((p) => /cavity of left ventricle/i.test(p.name)), c) },
        H('Coronary arteries', /^Trunk of anterior interventricular branch of left coronary artery$/),
        { label: 'Inferior vena cava', anchor: (ps) => nearestTo(ps, /^Inferior vena cava$/, /^Wall of right atrium$/, 0.6) },
        { label: 'Apex', anchor: (ps) => { const m = ps.find((p) => /myocardium/i.test(p.name)); return m ? new THREE.Vector3(...argmax(verts(m.geom), (p) => -p[1] + p[0] * 0.6 + p[2] * 0.3)) : null; } },
      ],
    },
    {
      id: 'lungs',
      parts: [...P(lungParts), ...P(named(/^(Trachea|Left main bronchus|Right main bronchus proper|Diaphragm)$/)), ...[...lobeGeoms].map(([id, g]) => extra(id.replace(/^lung-(\w+)-(\w+)-lobe$/, (_, s, l) => `${s[0].toUpperCase()}${s.slice(1)} lung — ${l} lobe`), g, 'lung'))],
      rules: [
        H('Trachea', /^Trachea$/),
        H('Right main bronchus', /^Right main bronchus proper$/),
        H('Left main bronchus', /^Left main bronchus$/),
        H('Right upper lobe', /^Right lung — upper lobe$/),
        H('Right middle lobe', /^Right lung — middle lobe$/),
        H('Right lower lobe', /^Right lung — lower lobe$/),
        H('Left upper lobe', /^Left lung — upper lobe$/),
        H('Left lower lobe', /^Left lung — lower lobe$/),
        { label: 'Cardiac notch', anchor: (ps) => { const m = ps.find((p) => /Left lung — upper lobe/.test(p.name)); return m ? new THREE.Vector3(...argmax(verts(m.geom), (p) => -p[0] * 1.2 + p[2] - Math.abs(p[1] - 1.27) * 2)) : null; } },
        { label: 'Diaphragmatic surface', anchor: (ps) => { const m = ps.find((p) => /Right lung — lower lobe/.test(p.name)); return m ? new THREE.Vector3(...argmax(verts(m.geom), (p) => -p[1] + p[2] * 0.3)) : null; } },
      ],
    },
    {
      id: 'brain',
      parts: P(brainParts),
      rules: [
        H('Frontal lobe', /^Left superior frontal gyrus$/),
        H('Central sulcus', /^Left precentral gyrus$/),
        H('Parietal lobe', /^Left superior parietal lobule$/),
        H('Occipital lobe', /^Left occipital lobe$/),
        H('Temporal lobe', /^Left middle temporal gyrus$/),
        { label: 'Longitudinal fissure', anchor: (ps) => { const cx = ps.filter((p) => p.role === 'cortex').flatMap((p) => verts(p.geom)); return cx.length ? new THREE.Vector3(...argmax(cx, (p) => p[1] - Math.abs(p[0]) * 8 + p[2] * 0.2)) : null; } },
        H('Cerebellum', /^Cerebellum$/),
        H('Brainstem', /^Pons$/),
        H('Hippocampus', /^Left hippocampus$/, true),
      ],
    },
    {
      id: 'kidneys',
      parts: P(kidneyParts, (g, p) => (/kidney/i.test(p.name) ? subdivideSmooth(g, 1, 6) : g)),
      clip: boxOf(named(/^(Left|Right) kidney$|^(Left|Right) adrenal gland$/)).expandByVector(new THREE.Vector3(0.03, 0.06, 0.04)).translate(new THREE.Vector3(0, -0.03, 0)),
      rules: [
        H('Renal cortex', /^Left kidney$/),
        H('Renal artery', /^Trunk of left renal artery$|^Left renal artery$/),
        H('Ureter', /^Left ureter$/),
        H('Adrenal gland', /^Left adrenal gland$/),
        H('Abdominal aorta', /^Abdominal aorta$/),
        H('Inferior vena cava', /^Inferior vena cava$/),
      ],
    },
    {
      id: 'liver',
      parts: P(liverParts),
      clip: boxOf(inConcept('liver')).expandByScalar(0.035),
      rules: [
        H('Right lobe', /^Hepatovenous segment VII$/),
        H('Left lobe', /^Hepatovenous segment II$/),
        H('Caudate lobe', /^Caudate lobe of liver$/),
        H('Gallbladder', /^Gallbladder$/),
        H('Common bile duct', /^Common hepatic duct$|^Cystic duct$/),
        H('Hepatic portal vein', /^Hepatic portal vein$/),
        H('Hepatic artery proper', /^Proper hepatic artery$|^Common hepatic artery$/),
        H('Inferior vena cava', /^Inferior vena cava$/),
      ],
    },
    {
      id: 'stomach',
      parts: P(stomachParts, (g, p) => (/stomach/i.test(p.name) ? subdivideSmooth(g, 2, 8) : g)),
      clip: boxOf(named(/^Stomach$/)).expandByVector(new THREE.Vector3(0.05, 0.05, 0.03)),
      rules: [
        H('Oesophagus', /^Esophagus$/),
        { label: 'Fundus', anchor: (ps) => stomachPt(ps, (p) => p[1]) },
        { label: 'Body', anchor: (ps) => stomachPt(ps, (p) => p[0] - Math.abs(p[1] - 1.1) * 2) },
        { label: 'Greater curvature', anchor: (ps) => stomachPt(ps, (p) => p[0] * 0.6 - p[1]) },
        { label: 'Lesser curvature', anchor: (ps) => stomachPt(ps, (p) => -p[0] * 0.4 + p[1] * 0.2 + p[2]) },
        { label: 'Pyloric antrum', anchor: (ps) => stomachPt(ps, (p) => -p[0] - p[1] * 0.6) },
        H('Duodenum', /^Duodenum$/),
        { label: 'Gastric rugae', anchor: (ps) => { const s = ps.find((p) => /^Stomach$/.test(p.name)); return s ? new THREE.Vector3(...centroid(verts(s.geom))) : null; }, internal: true },
      ],
    },
    {
      id: 'eye',
      parts: P(eyeParts),
      rules: [
        H('Cornea', /^Left cornea$/),
        H('Iris', /^Left iris$/, true),
        H('Lens', /^Left lens$/, true),
        H('Sclera', /^Left sclera$/),
        H('Retina & choroid', /^Left choroid$/, true),
        H('Superior rectus', /^Left superior rectus$/),
        H('Lateral rectus', /^Left lateral rectus$/),
        H('Inferior rectus', /^Left inferior rectus$/),
        H('Medial rectus', /^Left medial rectus$/),
      ],
    },
  ];

  for (const spec of specs) {
    // trim long vessels to the organ's neighbourhood
    let ps = spec.parts.map((p) => {
      if (!spec.clip || p.role === 'myocardium' || p.role === 'lung') return p;
      const g = clipToBox(p.geom.index ? p.geom : mergeVertices(p.geom), spec.clip);
      return g ? { ...p, geom: g } : null;
    }).filter(Boolean) as OrganPart[];
    // organ space: centred, largest dimension 2.2 units
    const box = boxOf(ps);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const k = 2.2 / Math.max(size.x, size.y, size.z);
    const centerWorld = c.clone();
    // hotspots computed in world space then converted
    const hotspots = [] as { number: number; label: string; description: string; position: V3; important?: boolean; internal?: boolean; part?: string }[];
    const src = organsJson.find((o) => o.id === spec.id)!;
    let n = 1;
    for (const rule of spec.rules) {
      let pt: THREE.Vector3 | null = null;
      let partName: string | undefined;
      if (rule.anchor) pt = rule.anchor(ps, centerWorld);
      else if (rule.part) {
        const hit = ps.filter((p) => rule.part!.test(p.name));
        partName = hit[0]?.name;
        if (hit.length) pt = rule.internal ? new THREE.Vector3(...centroid(hit.flatMap((h) => verts(h.geom)))) : surfaceAnchor(hit.map((h) => h.geom), centerWorld);
      }
      if (!pt) {
        log(`  ! ${spec.id}: no geometry for hotspot "${rule.label}" — skipped`);
        continue;
      }
      const orig = src.hotspots.find((h) => h.label === rule.label);
      const local = pt.sub(c).multiplyScalar(k);
      hotspots.push({ number: n++, label: rule.label, description: orig?.description ?? descriptionFor(rule.label), position: [+local.x.toFixed(4), +local.y.toFixed(4), +local.z.toFixed(4)], important: orig?.important, internal: rule.internal, part: partName });
    }
    // normalise geometry
    ps = ps.map((p) => {
      const g = p.geom.clone();
      g.translate(-c.x, -c.y, -c.z).scale(k, k, k);
      return { ...p, geom: g };
    });
    const dedupNames = new Map<string, number>();
    const meshes = ps.map((p) => {
      const cnt = (dedupNames.get(p.name) ?? 0) + 1;
      dedupNames.set(p.name, cnt);
      return { name: cnt > 1 ? `${p.name} #${cnt}` : p.name, geom: p.geom, extras: { role: p.role, part: p.name } };
    });
    const bytes = await writeGlb(path.join(OUT, 'organs', `${spec.id}.glb`), meshes, { simplifyRatio: spec.id === 'brain' ? 0.75 : 1 });
    fs.writeFileSync(path.join(OUT, 'organs', `${spec.id}.json`), JSON.stringify({ id: spec.id, scale: k, hotspots }, null, 2));
    manifest.organs[spec.id] = `organs/${spec.id}.glb`;
    log(`organs/${spec.id}.glb  ${meshes.length} parts  ${(bytes / 1e6).toFixed(2)} MB  ${hotspots.length} hotspots`);
  }
}

function towards(ps: OrganPart[], surface: RegExp, target: OrganPart | undefined, center: THREE.Vector3) {
  const s = ps.find((p) => surface.test(p.name));
  if (!s || !target) return null;
  const t = new THREE.Vector3(...centroid(verts(target.geom)));
  const dir = t.clone().sub(center).normalize();
  // favour the anterior surface so the pin is visible from the front
  dir.z += 0.6;
  dir.normalize();
  return new THREE.Vector3(...argmax(verts(s.geom), (p) => (p[0] - center.x) * dir.x + (p[1] - center.y) * dir.y + (p[2] - center.z) * dir.z));
}
/**
 * Point on part A close to part B but `t` of the way out along A (e.g. a vena cava pin placed on the
 * vessel just outside the atrium, not at its far trimmed end).
 */
function nearestTo(ps: OrganPart[], a: RegExp, b: RegExp, t: number) {
  const A = ps.find((p) => a.test(p.name));
  const B = ps.find((p) => b.test(p.name));
  if (!A) return null;
  const va = verts(A.geom);
  if (!B) return new THREE.Vector3(...centroid(va));
  const bc = centroid(verts(B.geom));
  const d = (p: V3) => Math.hypot(p[0] - bc[0], p[1] - bc[1], p[2] - bc[2]);
  const sorted = [...va].sort((x, y) => d(x) - d(y));
  // the vessel's outer surface point at the chosen distance quantile, pushed outward from the organ centre
  const ring = sorted.slice(Math.floor(sorted.length * t * 0.5), Math.floor(sorted.length * t * 0.5) + Math.max(8, sorted.length >> 5));
  const rc = centroid(ring);
  return new THREE.Vector3(...argmax(ring, (p) => (p[0] - rc[0]) * (rc[0] - bc[0]) + (p[1] - rc[1]) * (rc[1] - bc[1]) + (p[2] - rc[2]) * (rc[2] - bc[2]) + p[2] * 0.02));
}
function stomachPt(ps: OrganPart[], f: (p: V3) => number) {
  const s = ps.find((p) => /^Stomach$/.test(p.name));
  return s ? new THREE.Vector3(...argmax(verts(s.geom), f)) : null;
}
function descriptionFor(label: string) {
  const d: Record<string, string> = {
    Hippocampus: 'Curved structure in the medial temporal lobe essential for forming new memories (use cross-section)',
    'Retina & choroid': 'Light-sensitive retina lies on the vascular choroid inside the sclera (use cross-section)',
    'Medial rectus': 'Adducts the eye (CN III)',
  };
  return d[label] ?? label;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
