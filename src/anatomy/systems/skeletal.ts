/**
 * Skeletal system: skull, vertebral column (+ discs), thoracic cage, girdles and limbs
 * including every carpal, metacarpal, tarsal, metatarsal and phalanx (~260 structures).
 */
import * as THREE from 'three';
import type { StructureDef, RegionId, LayerIndex } from '../../types';
import { makeDef, SIDES } from '../def';
import { LM, SPINE } from '../landmarks';
import {
  blob,
  box,
  cylinder,
  longBone,
  merge,
  polyPlate,
  shell,
  sx,
  tube,
  lerp3,
  type V3,
} from '../geometry';

const PI = Math.PI;
const L4: LayerIndex = 4;

type BoneInfo = { overview?: string; articulations?: string; features?: string; clinicalNote?: string; taId?: string };

/** Curated notes for the major bones. */
const INFO: Record<string, BoneInfo> = {
  femur: {
    taId: 'A02.5.04.001',
    overview: 'The longest and strongest bone in the body, transmitting body weight from the hip to the tibia.',
    articulations: 'Acetabulum of the hip bone (hip joint); tibia and patella (knee joint).',
    features: 'Head, neck, greater and lesser trochanters, linea aspera, medial and lateral condyles.',
    clinicalNote: 'Neck-of-femur fractures in older adults may disrupt the retinacular arteries and cause avascular necrosis of the femoral head.',
  },
  humerus: {
    taId: 'A02.4.04.001',
    overview: 'Long bone of the arm between the shoulder and the elbow.',
    articulations: 'Glenoid cavity of the scapula (shoulder); radius and ulna (elbow).',
    features: 'Head, anatomical & surgical necks, greater/lesser tubercles, radial groove, epicondyles.',
    clinicalNote: 'Mid-shaft fractures can injure the radial nerve in the radial groove, causing wrist drop.',
  },
  clavicle: {
    taId: 'A02.4.02.001',
    overview: 'S-shaped strut connecting the upper limb to the axial skeleton.',
    articulations: 'Manubrium of sternum (sternoclavicular joint); acromion (acromioclavicular joint).',
    features: 'Medial convex and lateral concave curvatures, conoid tubercle, trapezoid line.',
    clinicalNote: 'The most commonly fractured bone; fractures typically occur at the junction of the middle and lateral thirds.',
  },
  scapula: {
    taId: 'A02.4.01.001',
    overview: 'Flat triangular bone of the posterior thoracic wall forming the shoulder blade.',
    articulations: 'Humerus (glenohumeral joint); clavicle (acromioclavicular joint).',
    features: 'Spine, acromion, coracoid process, glenoid cavity, supraspinous & infraspinous fossae.',
    clinicalNote: 'A “winged” scapula indicates paralysis of serratus anterior from long thoracic nerve injury.',
  },
  radius: {
    taId: 'A02.4.05.001',
    overview: 'Lateral bone of the forearm; rotates around the ulna in pronation and supination.',
    articulations: 'Humerus (elbow), ulna (proximal & distal radioulnar joints), scaphoid and lunate (wrist).',
    features: 'Head, neck, radial tuberosity, styloid process, ulnar notch.',
    clinicalNote: 'Colles fracture — distal radius fracture with dorsal displacement after a fall on an outstretched hand.',
  },
  ulna: {
    taId: 'A02.4.06.001',
    overview: 'Medial bone of the forearm forming the main hinge of the elbow.',
    articulations: 'Trochlea of humerus, radius (proximal & distal radioulnar joints).',
    features: 'Olecranon, coronoid process, trochlear notch, styloid process.',
    clinicalNote: 'Monteggia fracture: proximal ulnar fracture with dislocation of the radial head.',
  },
  tibia: {
    taId: 'A02.5.06.001',
    overview: 'Weight-bearing medial bone of the leg (shin bone).',
    articulations: 'Femur (knee), fibula (tibiofibular joints), talus (ankle).',
    features: 'Medial & lateral condyles, tibial tuberosity, anterior border, medial malleolus.',
    clinicalNote: 'Its subcutaneous anteromedial surface makes open fractures common; watch for compartment syndrome.',
  },
  fibula: {
    taId: 'A02.5.07.001',
    overview: 'Slender lateral bone of the leg, mainly for muscle attachment and ankle stability.',
    articulations: 'Tibia (superior & inferior tibiofibular joints); talus (ankle).',
    features: 'Head, neck, lateral malleolus.',
    clinicalNote: 'The common fibular nerve winds around the fibular neck and is vulnerable to fractures and tight casts (foot drop).',
  },
  patella: {
    taId: 'A02.5.05.001',
    overview: 'Largest sesamoid bone, embedded in the quadriceps tendon.',
    articulations: 'Patellar surface of the femur.',
    features: 'Base, apex, articular facets.',
    clinicalNote: 'Lateral patellar dislocation is resisted by the medial patellofemoral ligament and vastus medialis.',
  },
  sternum: {
    taId: 'A02.3.03.001',
    overview: 'Flat bone of the anterior thoracic wall (manubrium, body, xiphoid process).',
    articulations: 'Clavicles and costal cartilages of ribs 1–7.',
    features: 'Jugular notch, sternal angle (rib 2 level), xiphisternal joint.',
    clinicalNote: 'The sternal angle (T4/T5) marks the tracheal bifurcation and arch of the aorta; the lower sternum is the CPR compression site.',
  },
  sacrum: {
    taId: 'A02.2.05.001',
    overview: 'Five fused sacral vertebrae forming the posterior wall of the pelvis.',
    articulations: 'L5 (lumbosacral joint), ilia (sacroiliac joints), coccyx.',
    features: 'Promontory, sacral foramina, sacral canal & hiatus, auricular surfaces.',
    clinicalNote: 'The sacral hiatus is the access point for caudal epidural anaesthesia.',
  },
  mandible: {
    taId: 'A02.1.15.001',
    overview: 'The lower jaw — the only movable bone of the skull.',
    articulations: 'Temporal bones (temporomandibular joints).',
    features: 'Body, ramus, angle, condylar & coronoid processes, mental foramen.',
    clinicalNote: 'Jaw fractures are often bilateral (ring structure); TMJ dislocation is reduced by pressing down and back on the molars.',
  },
  hip: {
    taId: 'A02.5.01.001',
    overview: 'Formed by fusion of the ilium, ischium and pubis at the acetabulum.',
    articulations: 'Sacrum (sacroiliac joint), opposite hip bone (pubic symphysis), femur (hip joint).',
    features: 'Iliac crest, ASIS, acetabulum, obturator foramen, ischial tuberosity.',
    clinicalNote: 'The iliac crest is a common site for bone-marrow aspiration and bone-graft harvest.',
  },
};

function bone(
  id: string,
  nameEn: string,
  nameLatin: string,
  region: RegionId,
  side: 'left' | 'right' | 'midline',
  build: () => THREE.BufferGeometry,
  key?: string,
  kind: 'bone' | 'cartilage' = 'bone',
): StructureDef {
  const info = key ? INFO[key] : undefined;
  return makeDef({
    id,
    nameEn,
    nameLatin,
    system: 'skeletal',
    kind,
    region,
    layer: L4,
    side,
    taId: info?.taId ?? null,
    overview:
      info?.overview ??
      (kind === 'cartilage'
        ? `${nameEn} — hyaline/fibrocartilage element of the ${region === 'back' ? 'vertebral column' : 'skeleton'}.`
        : `${nameEn} — part of the ${region.replace('-', ' ')} skeleton.`),
    clinicalNote: info?.clinicalNote,
    facts: info ? { articulations: info.articulations, features: info.features } : {},
    build,
  });
}


// ---- rib geometry (shared with the intercostal muscles) ----
const W = [0.065, 0.09, 0.11, 0.123, 0.132, 0.138, 0.142, 0.143, 0.141, 0.137, 0.128, 0.118];
const DROP = [0.04, 0.07, 0.085, 0.095, 0.1, 0.105, 0.105, 0.11, 0.115, 0.12, 0.09, 0.07];
const END_X = [0.05, 0.07, 0.08, 0.09, 0.095, 0.1, 0.105, 0.11, 0.115, 0.12, 0.12, 0.1];
const END_Z = [0.07, 0.078, 0.084, 0.088, 0.09, 0.09, 0.088, 0.08, 0.065, 0.05, 0.0, -0.035];

/** Centre-line of rib i (0-based) on side s (+1 left, −1 right), vertebral end → anterior end. */
export function ribCurve(i: number, s: number): V3[] {
  const vb = SPINE[7 + i];
  const y = vb.y;
  const zv = vb.z;
  return ([
    [0.018, y, zv - 0.004],
    [0.045, y + 0.004, zv - 0.03],
    [W[i] * 0.85, y - DROP[i] * 0.3, zv * 0.4 - 0.03],
    [W[i], y - DROP[i] * 0.55, -0.005],
    [W[i] * 0.85, y - DROP[i] * 0.85, END_Z[i] * 0.75],
    [END_X[i], y - DROP[i], END_Z[i]],
  ] as V3[]).map((p) => sx(p, s));
}

export function buildSkeletal(): StructureDef[] {
  const out: StructureDef[] = [];
  const C = LM.craniumC;
  const R: V3 = [0.075, 0.093, 0.099];

  // ---------------- Skull ----------------
  out.push(bone('frontal-bone', 'Frontal bone', 'os frontale', 'head-neck', 'midline', () => shell(C, R, PI / 2 - 1.15, 2.3, 0.3, 1.0)));
  for (const { s, side, tag } of SIDES) {
    const phi = s > 0 ? PI / 2 + 0.55 : -1.05;
    out.push(
      bone(`parietal-${tag}`, 'Parietal bone', 'os parietale', 'head-neck', side, () => shell(C, [R[0] * 1.01, R[1] * 1.01, R[2] * 1.01], phi, PI / 2 + 0.5, 0, 1.3)),
    );
    const tphi = s > 0 ? PI - 0.75 : -0.75;
    out.push(bone(`temporal-${tag}`, 'Temporal bone', 'os temporale', 'head-neck', side, () => shell([0, C[1] - 0.01, C[2] - 0.01], [R[0] * 1.02, R[1] * 0.95, R[2] * 0.95], tphi, 1.5, 1.25, 0.75)));
    out.push(bone(`zygomatic-${tag}`, 'Zygomatic bone', 'os zygomaticum', 'head-neck', side, () => merge([
      blob(sx([0.05, 1.648, 0.062], s), [0.013, 0.014, 0.012]),
      tube([sx([0.055, 1.645, 0.06], s), sx([0.066, 1.64, 0.03], s), sx([0.066, 1.638, 0.0], s)], 0.0045),
    ])));
    out.push(bone(`maxilla-${tag}`, 'Maxilla', 'maxilla', 'head-neck', side, () => blob(sx([0.022, 1.612, 0.074], s), [0.022, 0.026, 0.02], { deform: (d) => (d.z < -0.3 ? 0.8 : 1) })));
    out.push(bone(`nasal-${tag}`, 'Nasal bone', 'os nasale', 'head-neck', side, () => box(sx([0.0055, 1.645, 0.093], s), [0.007, 0.022, 0.004], [-0.35, 0, s * -0.3])));
  }
  out.push(bone('occipital-bone', 'Occipital bone', 'os occipitale', 'head-neck', 'midline', () => shell(C, R, (3 * PI) / 2 - 0.7, 1.4, 0.85, 1.25)));
  out.push(bone('sphenoid-bone', 'Sphenoid bone', 'os sphenoidale', 'head-neck', 'midline', () => blob([0, 1.64, 0.02], [0.05, 0.012, 0.018])));
  out.push(bone('ethmoid-bone', 'Ethmoid bone', 'os ethmoidale', 'head-neck', 'midline', () => blob([0, 1.655, 0.06], [0.012, 0.018, 0.018])));
  out.push(
    bone('mandible', 'Mandible', 'mandibula', 'head-neck', 'midline', () =>
      merge([
        tube(
          [[-0.05, 1.615, -0.015], [-0.05, 1.57, -0.005], [-0.035, 1.552, 0.045], [0, 1.545, 0.078], [0.035, 1.552, 0.045], [0.05, 1.57, -0.005], [0.05, 1.615, -0.015]],
          (t) => 0.0065 + 0.003 * Math.sin(PI * t),
          { tubular: 48 },
        ),
        tube([[-0.046, 1.575, 0.0], [-0.044, 1.612, 0.012]], 0.004),
        tube([[0.046, 1.575, 0.0], [0.044, 1.612, 0.012]], 0.004),
      ]),
      'mandible',
    ),
  );
  out.push(bone('hyoid-bone', 'Hyoid bone', 'os hyoideum', 'head-neck', 'midline', () => tube([[-0.021, 1.506, 0.018], [0, 1.5, 0.045], [0.021, 1.506, 0.018]], 0.003)));

  // ---------------- Vertebral column ----------------
  SPINE.forEach((vb, i) => {
    const next = SPINE[i + 1];
    const prev = SPINE[i - 1];
    const gap = next ? vb.y - next.y : 0.031;
    const h = gap * 0.68;
    const region: RegionId = vb.name.startsWith('C') ? 'head-neck' : 'back';
    const kindName = vb.name.startsWith('C') ? 'cervical' : vb.name.startsWith('T') ? 'thoracic' : 'lumbar';
    const latin = `vertebra ${kindName === 'cervical' ? 'cervicalis' : kindName === 'thoracic' ? 'thoracica' : 'lumbalis'} ${vb.name}`;
    const special = vb.name === 'C1' ? 'Atlas (C1)' : vb.name === 'C2' ? 'Axis (C2)' : `${vb.name} vertebra`;
    out.push(
      makeDef({
        id: `vertebra-${vb.name.toLowerCase()}`,
        nameEn: special,
        nameLatin: vb.name === 'C1' ? 'atlas' : vb.name === 'C2' ? 'axis' : latin,
        system: 'skeletal',
        kind: 'bone',
        region,
        layer: L4,
        overview: `${kindName[0].toUpperCase() + kindName.slice(1)} vertebra ${vb.name}. ${
          kindName === 'cervical'
            ? 'Has transverse foramina transmitting the vertebral artery.'
            : kindName === 'thoracic'
              ? 'Bears costal facets for articulation with the ribs.'
              : 'Large kidney-shaped body adapted to weight bearing.'
        }`,
        facts: {
          articulations: `${prev ? prev.name : 'Occipital condyles'} above, ${next ? next.name : 'sacrum'} below${kindName === 'thoracic' ? '; heads and tubercles of the ribs' : ''}.`,
          features: 'Body, pedicles, laminae, spinous & transverse processes, superior and inferior articular facets.',
        },
        clinicalNote:
          kindName === 'lumbar'
            ? 'Lumbar puncture is performed at L3/L4 or L4/L5, below the end of the spinal cord (≈L1/L2).'
            : kindName === 'cervical'
              ? 'Cervical spine injury must be assumed in major trauma until cleared clinically or radiologically.'
              : undefined,
        build: () => {
          const zc = vb.z;
          const spLen = kindName === 'cervical' ? 0.018 : kindName === 'thoracic' ? 0.032 : 0.028;
          const spDrop = kindName === 'thoracic' ? 0.022 : 0.006;
          const tr = kindName === 'cervical' ? 0.022 : kindName === 'thoracic' ? 0.03 : 0.035;
          const parts = [
            cylinder([0, vb.y - h / 2, zc], [0, vb.y + h / 2, zc], vb.r, 14),
            new THREE.TorusGeometry(vb.r * 0.65, 0.0035, 6, 14).rotateX(PI / 2).translate(0, vb.y, zc - vb.r * 1.55),
            tube([[0, vb.y, zc - vb.r * 2.1], [0, vb.y - spDrop * 0.6, zc - vb.r * 2.1 - spLen * 0.7], [0, vb.y - spDrop, zc - vb.r * 2.1 - spLen]], 0.0035),
            tube([[-tr, vb.y + 0.002, zc - vb.r * 1.5], [0, vb.y, zc - vb.r * 1.4], [tr, vb.y + 0.002, zc - vb.r * 1.5]], 0.003),
          ];
          if (vb.name === 'C2') parts.push(cylinder([0, vb.y, zc], [0, vb.y + 0.02, zc], 0.004));
          return merge(parts);
        },
      }),
    );
    // intervertebral disc below this vertebra (none between C1 and C2)
    if (next && vb.name !== 'C1') {
      out.push(
        bone(
          `disc-${vb.name.toLowerCase()}-${next.name.toLowerCase()}`,
          `Intervertebral disc ${vb.name}–${next.name}`,
          `discus intervertebralis ${vb.name}–${next.name}`,
          region,
          'midline',
          () => cylinder([0, next.y + (gap * 0.68) / 2 + 0.0008, (vb.z + next.z) / 2], [0, vb.y - h / 2 - 0.0008, (vb.z + next.z) / 2], next.r * 0.98, 14),
          undefined,
          'cartilage',
        ),
      );
    }
  });
  const L5 = SPINE[SPINE.length - 1];
  out.push(bone('disc-l5-s1', 'Intervertebral disc L5–S1', 'discus intervertebralis L5–S1', 'back', 'midline', () => cylinder([0, L5.y - 0.024, L5.z - 0.012], [0, L5.y - 0.013, L5.z - 0.004], L5.r * 0.95, 14), undefined, 'cartilage'));
  out.push(
    bone('sacrum', 'Sacrum', 'os sacrum', 'pelvis', 'midline', () =>
      blob([0, 0.965, -0.072], [0.052, 0.062, 0.022], { rotate: [-0.55, 0, 0], deform: (d) => 0.55 + 0.45 * ((d.y + 1) / 2) + 0.1 * (1 - Math.abs(d.y)) }),
      'sacrum',
    ),
  );
  out.push(bone('coccyx', 'Coccyx', 'os coccygis', 'pelvis', 'midline', () => tube([[0, 0.912, -0.05], [0, 0.895, -0.045], [0, 0.882, -0.032]], (t) => 0.007 - t * 0.004)));

  // ---------------- Thoracic cage ----------------
  const STERNAL_Y = [1.43, 1.4, 1.37, 1.34, 1.31, 1.28, 1.255];
  const sternumZ = (y: number) => 0.062 + ((1.445 - y) / 0.2) * 0.045;
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
  for (let i = 0; i < 12; i++) {
    for (const { s, side, tag } of SIDES) {
      const pts = ribCurve(i, s);
      const trimmed = i >= 10 ? pts.slice(0, i === 10 ? 6 : 5) : pts;
      const typ = i < 7 ? 'true rib' : i < 10 ? 'false rib' : 'floating rib';
      out.push(
        makeDef({
          id: `rib-${i + 1}-${tag}`,
          nameEn: `${ORD[i]} rib`,
          nameLatin: `costa ${['prima', 'secunda', 'tertia', 'quarta', 'quinta', 'sexta', 'septima', 'octava', 'nona', 'decima', 'undecima', 'duodecima'][i]}`,
          system: 'skeletal',
          kind: 'bone',
          region: 'thorax',
          layer: L4,
          side,
          overview: `${ORD[i]} rib — a ${typ}. ${i < 7 ? 'Its costal cartilage joins the sternum directly.' : i < 10 ? 'Its cartilage joins the cartilage of the rib above, forming the costal margin.' : 'Its anterior end is free in the abdominal wall.'}`,
          facts: { articulations: `Head with T${i + 1}${i > 0 && i < 9 ? ` and T${i}` : ''}; tubercle with the transverse process of T${i + 1}${i < 10 ? '; costal cartilage anteriorly' : ''}.`, features: 'Head, neck, tubercle, angle, shaft with costal groove.' },
          clinicalNote: 'The intercostal neurovascular bundle (vein, artery, nerve) runs in the costal groove — chest drains are inserted just above a rib.',
          build: () => tube(trimmed, (t) => 0.0052 + 0.0012 * Math.sin(PI * t), { tubular: 40, radial: 7 }),
        }),
      );
      if (i < 10) {
        const end = pts[5];
        const target: V3 =
          i < 7 ? sx([0.016, STERNAL_Y[i], sternumZ(STERNAL_Y[i]) - 0.004], s) : sx([[0.07, 1.215, 0.1], [0.092, 1.185, 0.094], [0.108, 1.158, 0.084]][i - 7] as V3, s);
        out.push(
          bone(`costal-cartilage-${i + 1}-${tag}`, `Costal cartilage ${i + 1}`, `cartilago costalis ${i + 1}`, 'thorax', side, () => tube([end, lerp3(end, target, 0.5), target], 0.0048, { tubular: 10, radial: 7 }), undefined, 'cartilage'),
        );
      }
    }
  }
  out.push(bone('manubrium', 'Manubrium of sternum', 'manubrium sterni', 'thorax', 'midline', () => blob([0, 1.42, 0.068], [0.027, 0.025, 0.008], { rotate: [-0.25, 0, 0] }), 'sternum'));
  out.push(bone('sternum-body', 'Body of sternum', 'corpus sterni', 'thorax', 'midline', () => blob([0, 1.33, 0.088], [0.018, 0.068, 0.008], { rotate: [-0.25, 0, 0] }), 'sternum'));
  out.push(bone('xiphoid', 'Xiphoid process', 'processus xiphoideus', 'thorax', 'midline', () => blob([0, 1.252, 0.106], [0.008, 0.016, 0.004], { rotate: [-0.3, 0, 0] })));

  // ---------------- Upper limb ----------------
  const FINGERS = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
  const FINGER_LAT = ['pollicis', 'indicis', 'digiti medii', 'digiti annularis', 'digiti minimi'];
  for (const { s, side, tag } of SIDES) {
    const P = (p: V3) => sx(p, s);
    out.push(bone(`clavicle-${tag}`, 'Clavicle', 'clavicula', 'upper-limb', side, () => tube([P(LM.sternoclavicular), P([0.08, 1.457, 0.066]), P([0.14, 1.462, 0.034]), P([0.18, 1.468, -0.005])], 0.0065, { tubular: 28 }), 'clavicle'));
    out.push(
      bone(`scapula-${tag}`, 'Scapula', 'scapula', 'upper-limb', side, () =>
        merge([
          polyPlate([P([0.07, 1.445, -0.098]), P([0.1, 1.28, -0.11]), P([0.165, 1.415, -0.05]), P([0.13, 1.45, -0.07])], 0.004),
          tube([P([0.072, 1.415, -0.106]), P([0.14, 1.44, -0.085]), P([0.186, 1.466, -0.03])], 0.0055),
          blob(P([0.17, 1.425, -0.03]), [0.008, 0.016, 0.012]),
          tube([P([0.15, 1.442, -0.04]), P([0.152, 1.445, 0.0]), P([0.148, 1.435, 0.03])], 0.0045),
        ]),
      'scapula',
      ),
    );
    out.push(bone(`humerus-${tag}`, 'Humerus', 'humerus', 'upper-limb', side, () => merge([longBone(P([0.18, 1.42, -0.018]), P(LM.elbow), 0.0115, { epi: 1.9, epiB: 2.4, normal: [0, 0, 1] }), blob(P([0.176, 1.428, -0.014]), [0.022, 0.023, 0.022])]), 'humerus'));
    // Hand: D = finger direction, T = toward thumb (lateral), N = palmar (anterior)
    const Wr = new THREE.Vector3(...P(LM.wrist));
    const D = new THREE.Vector3(...P([0.36, 0.68, 0.03])).sub(Wr).normalize();
    const T = new THREE.Vector3(s, 0, 0).sub(D.clone().multiplyScalar(D.x * s)).normalize();
    const N = new THREE.Vector3().crossVectors(T, D).multiplyScalar(-s).normalize();
    const H = (d: number, t: number, n = 0): V3 => {
      const p = Wr.clone().addScaledVector(D, d).addScaledVector(T, t).addScaledVector(N, n);
      return [p.x, p.y, p.z];
    };
    out.push(bone(`radius-${tag}`, 'Radius', 'radius', 'upper-limb', side, () => longBone(P([0.268, 1.11, -0.022]), H(0.003, 0.013, 0.001), 0.0075, { epi: 1.6, epiB: 2.3 }), 'radius'));
    out.push(bone(`ulna-${tag}`, 'Ulna', 'ulna', 'upper-limb', side, () => longBone(P([0.232, 1.14, -0.048]), H(0.003, -0.011, -0.001), 0.0078, { epi: 2.1, epiB: 1.6 }), 'ulna'));

    const carpals: [string, string, number, number, number][] = [
      ['Scaphoid', 'os scaphoideum', 0.01, 0.014, 0],
      ['Lunate', 'os lunatum', 0.01, 0.002, 0],
      ['Triquetrum', 'os triquetrum', 0.01, -0.01, 0],
      ['Pisiform', 'os pisiforme', 0.011, -0.012, 0.0065],
      ['Trapezium', 'os trapezium', 0.026, 0.019, 0],
      ['Trapezoid', 'os trapezoideum', 0.026, 0.008, 0],
      ['Capitate', 'os capitatum', 0.026, -0.003, 0],
      ['Hamate', 'os hamatum', 0.026, -0.014, 0],
    ];
    for (const [n, lat, d, t, nn] of carpals) {
      out.push(
        makeDef({
          id: `${n.toLowerCase()}-${tag}`,
          nameEn: n,
          nameLatin: lat,
          system: 'skeletal',
          kind: 'bone',
          region: 'upper-limb',
          layer: L4,
          side,
          overview: `${n} — one of the eight carpal bones of the wrist.`,
          clinicalNote:
            n === 'Scaphoid'
              ? 'Scaphoid fractures (tenderness in the anatomical snuffbox) risk avascular necrosis of the proximal pole because blood enters distally.'
              : n === 'Lunate'
                ? 'The most commonly dislocated carpal bone; may compress the median nerve in the carpal tunnel.'
                : undefined,
          build: () => blob(H(d, t, nn), [0.0085, 0.0095, 0.0075], { w: 12, h: 10 }),
        }),
      );
    }
    const MC_LEN = [0.04, 0.066, 0.063, 0.057, 0.052];
    const MC_T = [0.024, 0.012, 0.002, -0.008, -0.017];
    const PH = [
      [0.031, 0, 0.023],
      [0.042, 0.025, 0.018],
      [0.046, 0.029, 0.019],
      [0.043, 0.027, 0.018],
      [0.034, 0.02, 0.016],
    ];
    const PH_NAME = ['Proximal', 'Middle', 'Distal'];
    for (let f = 0; f < 5; f++) {
      const spread = f === 0 ? 0.75 : (2 - f) * -0.06 + 0.06;
      const dir = D.clone().addScaledVector(T, spread).addScaledVector(N, f === 0 ? 0.35 : 0).normalize();
      let base = new THREE.Vector3(...H(f === 0 ? 0.03 : 0.034, f === 0 ? 0.022 : MC_T[f], f === 0 ? 0.004 : 0));
      const seg = (a: THREE.Vector3, len: number) => [a.clone(), a.clone().addScaledVector(dir, len)] as const;
      const [m0, m1] = seg(base, MC_LEN[f]);
      out.push(
        makeDef({
          id: `metacarpal-${f + 1}-${tag}`,
          nameEn: `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][f]} metacarpal`,
          nameLatin: `os metacarpi ${['I', 'II', 'III', 'IV', 'V'][f]}`,
          system: 'skeletal',
          kind: 'bone',
          region: 'upper-limb',
          layer: L4,
          side,
          overview: `Metacarpal of the ${FINGERS[f]}.`,
          clinicalNote: f === 4 ? '“Boxer’s fracture” — fracture of the neck of the fifth metacarpal from punching.' : f === 0 ? 'Bennett fracture: intra-articular fracture of the base of the first metacarpal.' : undefined,
          build: () => longBone([m0.x, m0.y, m0.z], [m1.x, m1.y, m1.z], 0.0042, { epi: 1.5, epiB: 1.6 }),
        }),
      );
      base = m1.clone();
      PH[f].forEach((len, k) => {
        if (!len) return;
        const [a, b] = seg(base, len);
        base = b.clone();
        out.push(
          makeDef({
            id: `phalanx-${PH_NAME[k].toLowerCase()}-${f + 1}-${tag}`,
            nameEn: `${PH_NAME[k]} phalanx of ${FINGERS[f]}`,
            nameLatin: `phalanx ${['proximalis', 'media', 'distalis'][k]} ${FINGER_LAT[f]}`,
            system: 'skeletal',
            kind: 'bone',
            region: 'upper-limb',
            layer: L4,
            side,
            overview: `${PH_NAME[k]} phalanx of the ${FINGERS[f]}.`,
            build: () => longBone([a.x, a.y, a.z], [b.x, b.y, b.z], 0.0036 - k * 0.0004, { epi: 1.45 }),
          }),
        );
      });
    }

    // ---------------- Pelvis & lower limb ----------------
    out.push(
      bone(`hip-bone-${tag}`, 'Hip bone', 'os coxae', 'pelvis', side, () =>
        merge([
          blob(P([0.092, 1.03, -0.012]), [0.011, 0.055, 0.074], { rotate: [0, 0.6 * s, -0.18 * s], deform: (d) => (d.y < -0.6 ? 0.7 : 1) }),
          blob(P([0.078, 0.925, 0.02]), [0.026, 0.026, 0.026]),
          tube([P([0.075, 0.93, 0.04]), P([0.035, 0.915, 0.075]), P([0.007, 0.905, 0.085])], 0.009),
          tube([P([0.07, 0.91, 0.0]), P([0.06, 0.857, -0.028]), P([0.032, 0.87, 0.04]), P([0.009, 0.89, 0.079])], 0.009, { tubular: 24 }),
        ]),
        'hip',
      ),
    );
    out.push(
      bone(`femur-${tag}`, 'Femur', 'femur', 'lower-limb', side, () =>
        merge([
          blob(P(LM.hip), [0.022, 0.022, 0.022]),
          cylinder(P(LM.hip), P([0.128, 0.9, 0.006]), 0.011),
          blob(P([0.14, 0.922, -0.004]), [0.014, 0.018, 0.015]),
          longBone(P([0.13, 0.905, 0.004]), P([0.095, 0.515, 0.0]), 0.0128, { epi: 1.4, epiB: 2.6 }),
        ]),
        'femur',
      ),
    );
    out.push(bone(`patella-${tag}`, 'Patella', 'patella', 'lower-limb', side, () => blob(P([0.097, 0.51, 0.052]), [0.021, 0.025, 0.009], { deform: (d) => (d.y < 0 ? 1 - 0.3 * -d.y : 1) }), 'patella'));
    out.push(bone(`tibia-${tag}`, 'Tibia', 'tibia', 'lower-limb', side, () => longBone(P([0.09, 0.488, 0.008]), P([0.096, 0.079, -0.005]), 0.0115, { epi: 2.6, epiB: 1.7 }), 'tibia'));
    out.push(bone(`fibula-${tag}`, 'Fibula', 'fibula', 'lower-limb', side, () => longBone(P([0.126, 0.47, -0.014]), P([0.116, 0.066, -0.008]), 0.0058, { epi: 1.7, epiB: 1.9 }), 'fibula'));

    const tarsals: [string, string, V3, V3][] = [
      ['Talus', 'talus', [0.099, 0.067, -0.004], [0.018, 0.016, 0.024]],
      ['Calcaneus', 'calcaneus', [0.102, 0.038, -0.032], [0.018, 0.022, 0.044]],
      ['Navicular', 'os naviculare', [0.094, 0.06, 0.03], [0.018, 0.011, 0.012]],
      ['Cuboid', 'os cuboideum', [0.113, 0.037, 0.026], [0.014, 0.012, 0.021]],
      ['Medial cuneiform', 'os cuneiforme mediale', [0.08, 0.047, 0.05], [0.009, 0.013, 0.013]],
      ['Intermediate cuneiform', 'os cuneiforme intermedium', [0.093, 0.05, 0.05], [0.0075, 0.011, 0.013]],
      ['Lateral cuneiform', 'os cuneiforme laterale', [0.105, 0.047, 0.05], [0.0075, 0.011, 0.013]],
    ];
    for (const [n, lat, c, r] of tarsals) {
      out.push(
        makeDef({
          id: `${n.toLowerCase().replace(/ /g, '-')}-${tag}`,
          nameEn: n,
          nameLatin: lat,
          system: 'skeletal',
          kind: 'bone',
          region: 'lower-limb',
          layer: L4,
          side,
          overview: `${n} — one of the seven tarsal bones of the foot.`,
          clinicalNote: n === 'Calcaneus' ? 'Calcaneal fractures follow falls from height; check the lumbar spine for associated compression fractures.' : n === 'Talus' ? 'Talar neck fractures risk avascular necrosis of the body of the talus.' : undefined,
          build: () => blob(P(c), r, { w: 12, h: 10 }),
        }),
      );
    }
    const TOES = ['great toe', 'second toe', 'third toe', 'fourth toe', 'little toe'];
    const TOE_LAT = ['hallucis', 'digiti secundi', 'digiti tertii', 'digiti quarti', 'digiti minimi'];
    const MT_BASE: V3[] = [[0.079, 0.046, 0.059], [0.093, 0.048, 0.058], [0.105, 0.045, 0.058], [0.116, 0.039, 0.045], [0.125, 0.035, 0.042]];
    const MT_HEAD: V3[] = [[0.072, 0.018, 0.128], [0.09, 0.018, 0.13], [0.104, 0.017, 0.124], [0.117, 0.016, 0.116], [0.13, 0.015, 0.107]];
    const TOE_PH = [[0.028, 0, 0.022], [0.022, 0.012, 0.01], [0.019, 0.011, 0.009], [0.017, 0.01, 0.009], [0.014, 0.008, 0.008]];
    for (let t = 0; t < 5; t++) {
      out.push(
        makeDef({
          id: `metatarsal-${t + 1}-${tag}`,
          nameEn: `${['First', 'Second', 'Third', 'Fourth', 'Fifth'][t]} metatarsal`,
          nameLatin: `os metatarsi ${['I', 'II', 'III', 'IV', 'V'][t]}`,
          system: 'skeletal',
          kind: 'bone',
          region: 'lower-limb',
          layer: L4,
          side,
          overview: `Metatarsal of the ${TOES[t]}.`,
          clinicalNote: t === 4 ? 'Avulsion of the base of the fifth metatarsal (peroneus brevis) follows inversion injuries; Jones fracture is at the metaphyseal–diaphyseal junction.' : t === 1 ? 'The second metatarsal is the classic site of a “march” (stress) fracture.' : undefined,
          build: () => longBone(P(MT_BASE[t]), P(MT_HEAD[t]), t === 0 ? 0.0062 : 0.0042, { epi: 1.5 }),
        }),
      );
      const dir = new THREE.Vector3(...MT_HEAD[t]).sub(new THREE.Vector3(...MT_BASE[t])).setY(0).normalize();
      dir.x *= s;
      let base = new THREE.Vector3(...P(MT_HEAD[t]));
      TOE_PH[t].forEach((len, k) => {
        if (!len) return;
        const a = base.clone();
        const b = a.clone().addScaledVector(dir, len).setY(Math.max(0.008, a.y - len * 0.15));
        base = b.clone();
        out.push(
          makeDef({
            id: `toe-phalanx-${PH_NAME[k].toLowerCase()}-${t + 1}-${tag}`,
            nameEn: `${PH_NAME[k]} phalanx of ${TOES[t]}`,
            nameLatin: `phalanx ${['proximalis', 'media', 'distalis'][k]} ${TOE_LAT[t]}`,
            system: 'skeletal',
            kind: 'bone',
            region: 'lower-limb',
            layer: L4,
            side,
            overview: `${PH_NAME[k]} phalanx of the ${TOES[t]}.`,
            build: () => longBone([a.x, a.y, a.z], [b.x, b.y, b.z], (t === 0 ? 0.0055 : 0.0034) - k * 0.0003, { epi: 1.4 }),
          }),
        );
      });
    }
  }
  return out;
}
