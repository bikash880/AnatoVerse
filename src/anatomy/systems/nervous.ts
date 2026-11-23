/**
 * Nervous system: brain, 31 spinal-cord segments, 31 pairs of spinal nerves, intercostal
 * nerves, 12 pairs of cranial nerves, plexuses and the main peripheral nerves of the limbs.
 */
import * as THREE from 'three';
import type { Facts, LayerIndex, RegionId, StructureDef } from '../../types';
import { makeDef, SIDES } from '../def';
import { LM, SPINE } from '../landmarks';
import { blob, merge, sx, tube, type V3 } from '../geometry';
import { ribCurve } from './skeletal';

const L3: LayerIndex = 3;

/** Point on the centre of the vertebral canal at height y. */
function canal(y: number): V3 {
  const s = SPINE;
  if (y >= s[0].y) return [0, y, s[0].z - s[0].r * 1.55];
  for (let i = 1; i < s.length; i++) {
    if (y >= s[i].y) {
      const t = (y - s[i].y) / (s[i - 1].y - s[i].y);
      const z = s[i].z + (s[i - 1].z - s[i].z) * t;
      const r = s[i].r + (s[i - 1].r - s[i].r) * t;
      return [0, y, z - r * 1.55];
    }
  }
  const l = s[s.length - 1];
  return [0, y, l.z - l.r * 1.55 - (l.y - y) * 0.4];
}

function nerve(
  id: string,
  nameEn: string,
  nameLatin: string,
  region: RegionId,
  side: 'left' | 'right' | 'midline',
  build: () => THREE.BufferGeometry,
  extra: { facts?: Facts; overview?: string; note?: string; kind?: 'nerve' | 'organ' } = {},
): StructureDef {
  return makeDef({
    id,
    nameEn,
    nameLatin,
    system: 'nervous',
    kind: extra.kind ?? 'nerve',
    region,
    layer: L3,
    side,
    overview: extra.overview ?? `${nameEn}.`,
    clinicalNote: extra.note,
    facts: extra.facts ?? {},
    build,
  });
}

interface PeripheralSpec {
  id: string;
  en: string;
  lat: string;
  region: RegionId;
  pts: V3[];
  r: number;
  facts: Facts;
  overview: string;
  note?: string;
}

const PERIPHERAL: PeripheralSpec[] = [
  {
    id: 'brachial-plexus', en: 'Brachial plexus', lat: 'plexus brachialis', region: 'upper-limb', r: 0.004,
    pts: [[0.03, 1.5, -0.03], [0.06, 1.47, -0.01], [0.1, 1.44, 0.0], [0.145, 1.4, 0.0]],
    facts: { roots: 'Anterior rami of C5–T1', branches: 'Musculocutaneous, axillary, radial, median and ulnar nerves (terminal branches)', supplies: 'Motor and sensory innervation of the entire upper limb' },
    overview: 'Network of nerve fibres (roots, trunks, divisions, cords, branches) supplying the upper limb.',
    note: 'Erb palsy (C5–C6, “waiter’s tip”) and Klumpke palsy (C8–T1, claw hand) follow traction injuries of the upper and lower plexus.',
  },
  {
    id: 'musculocutaneous-nerve', en: 'Musculocutaneous nerve', lat: 'nervus musculocutaneus', region: 'upper-limb', r: 0.0022,
    pts: [[0.145, 1.4, 0.005], [0.18, 1.34, 0.015], [0.225, 1.2, 0.015], [0.255, 1.12, 0.012], [0.3, 0.96, 0.012]],
    facts: { roots: 'C5–C7 (lateral cord)', supplies: 'Motor: coracobrachialis, biceps brachii, brachialis. Sensory: lateral forearm (as the lateral cutaneous nerve of the forearm)' },
    overview: 'Terminal branch of the lateral cord; pierces coracobrachialis.',
  },
  {
    id: 'median-nerve', en: 'Median nerve', lat: 'nervus medianus', region: 'upper-limb', r: 0.0028,
    pts: [[0.15, 1.395, 0.0], [0.19, 1.3, -0.002], [0.215, 1.22, -0.006], [0.245, 1.12, -0.004], [0.28, 1.0, 0.004], [0.31, 0.88, 0.013], [0.322, 0.84, 0.016]],
    facts: { roots: 'C6–T1 (lateral and medial cords)', supplies: 'Motor: most forearm flexors, pronators, thenar muscles (LOAF). Sensory: lateral 3½ digits on the palmar side', course: 'Runs with the brachial artery, through the cubital fossa and the carpal tunnel' },
    overview: 'Major nerve of the anterior forearm and lateral hand.',
    note: 'Compression in the carpal tunnel causes night-time tingling of the lateral 3½ digits (positive Tinel and Phalen tests).',
  },
  {
    id: 'ulnar-nerve', en: 'Ulnar nerve', lat: 'nervus ulnaris', region: 'upper-limb', r: 0.0026,
    pts: [[0.15, 1.39, -0.01], [0.2, 1.26, -0.03], [0.222, 1.12, -0.056], [0.25, 1.05, -0.03], [0.275, 0.96, -0.012], [0.293, 0.875, 0.004], [0.305, 0.83, 0.006]],
    facts: { roots: 'C8–T1 (medial cord)', supplies: 'Motor: flexor carpi ulnaris, medial half of FDP, most intrinsic hand muscles. Sensory: medial 1½ digits', course: 'Passes behind the medial epicondyle (“funny bone”) and through Guyon’s canal' },
    overview: 'Nerve of the medial forearm and most intrinsic hand muscles.',
    note: 'Damage at the elbow or wrist produces an ulnar claw hand and positive Froment’s sign.',
  },
  {
    id: 'radial-nerve', en: 'Radial nerve', lat: 'nervus radialis', region: 'upper-limb', r: 0.0028,
    pts: [[0.15, 1.39, -0.02], [0.18, 1.33, -0.05], [0.215, 1.26, -0.05], [0.25, 1.18, -0.025], [0.262, 1.12, -0.012], [0.3, 1.0, 0.004], [0.326, 0.9, 0.006]],
    facts: { roots: 'C5–T1 (posterior cord)', supplies: 'Motor: triceps, brachioradialis and all forearm extensors. Sensory: posterior arm/forearm, dorsum of the lateral hand', course: 'Winds around the humerus in the radial (spiral) groove' },
    overview: 'Largest branch of the brachial plexus; supplies all extensor muscles of the upper limb.',
    note: 'Mid-shaft humeral fractures or “Saturday-night palsy” cause wrist drop.',
  },
  {
    id: 'axillary-nerve', en: 'Axillary nerve', lat: 'nervus axillaris', region: 'upper-limb', r: 0.0022,
    pts: [[0.15, 1.39, -0.02], [0.175, 1.38, -0.045], [0.2, 1.37, -0.03], [0.205, 1.36, 0.0]],
    facts: { roots: 'C5–C6 (posterior cord)', supplies: 'Motor: deltoid and teres minor. Sensory: skin over the lower deltoid (regimental badge area)', course: 'Passes through the quadrangular space around the surgical neck of the humerus' },
    overview: 'Short branch of the posterior cord.',
    note: 'At risk in anterior shoulder dislocation and surgical-neck fractures.',
  },
  {
    id: 'long-thoracic-nerve', en: 'Long thoracic nerve', lat: 'nervus thoracicus longus', region: 'thorax', r: 0.0015,
    pts: [[0.035, 1.49, -0.04], [0.09, 1.42, -0.02], [0.135, 1.34, -0.0], [0.145, 1.24, 0.0]],
    facts: { roots: 'C5–C7', supplies: 'Serratus anterior', course: 'Descends on the lateral thoracic wall on the surface of serratus anterior' },
    overview: 'Motor nerve of serratus anterior.',
    note: 'Injury causes winging of the scapula.',
  },
  {
    id: 'phrenic-nerve', en: 'Phrenic nerve', lat: 'nervus phrenicus', region: 'thorax', r: 0.0018,
    pts: [[0.03, 1.54, -0.005], [0.04, 1.47, 0.02], [0.045, 1.4, 0.035], [0.07, 1.32, 0.06], [0.08, 1.24, 0.045], [0.08, 1.2, 0.02]],
    facts: { roots: 'C3–C5', supplies: 'Motor: diaphragm. Sensory: mediastinal pleura, pericardium, central diaphragmatic pleura and peritoneum', course: 'Descends on scalenus anterior, then over the pericardium anterior to the lung root' },
    overview: '“C3, 4, 5 keeps the diaphragm alive.”',
    note: 'Irritation of the diaphragm (e.g. a subphrenic abscess) refers pain to the shoulder tip (C4 dermatome).',
  },
  {
    id: 'sympathetic-trunk', en: 'Sympathetic trunk', lat: 'truncus sympathicus', region: 'back', r: 0.0016,
    pts: [[0.025, 1.6, -0.02], [0.028, 1.5, -0.025], [0.03, 1.4, -0.06], [0.03, 1.3, -0.07], [0.028, 1.2, -0.04], [0.025, 1.1, -0.01], [0.015, 0.98, -0.05], [0.004, 0.9, -0.045]],
    facts: { roots: 'Preganglionic fibres from T1–L2 (thoracolumbar outflow)', supplies: 'Sympathetic fibres to blood vessels, sweat glands, viscera and the head', course: 'Chain of paravertebral ganglia from the skull base to the coccyx' },
    overview: 'Paired chain of sympathetic ganglia beside the vertebral column.',
    note: 'Interruption of the cervical sympathetic chain (e.g. Pancoast tumour) produces Horner syndrome — ptosis, miosis, anhidrosis.',
  },
  {
    id: 'femoral-nerve', en: 'Femoral nerve', lat: 'nervus femoralis', region: 'lower-limb', r: 0.003,
    pts: [[0.03, 1.1, -0.02], [0.06, 1.0, 0.005], [0.075, 0.95, 0.045], [0.09, 0.92, 0.07], [0.1, 0.86, 0.07]],
    facts: { roots: 'L2–L4 (posterior divisions of the lumbar plexus)', supplies: 'Motor: iliacus, pectineus, sartorius, quadriceps. Sensory: anterior thigh and (via saphenous nerve) medial leg', course: 'Passes under the inguinal ligament lateral to the femoral artery (NAVY: Nerve, Artery, Vein, Y-fronts)' },
    overview: 'Largest branch of the lumbar plexus.',
    note: 'Femoral nerve palsy weakens knee extension and abolishes the knee jerk.',
  },
  {
    id: 'saphenous-nerve', en: 'Saphenous nerve', lat: 'nervus saphenus', region: 'lower-limb', r: 0.0016,
    pts: [[0.09, 0.85, 0.06], [0.07, 0.68, 0.03], [0.06, 0.52, -0.01], [0.068, 0.3, -0.005], [0.075, 0.1, 0.012], [0.08, 0.04, 0.05]],
    facts: { roots: 'L3–L4 (femoral nerve)', supplies: 'Sensory: skin of the medial leg and medial foot', course: 'Through the adductor canal, then with the great saphenous vein' },
    overview: 'Longest cutaneous branch of the femoral nerve.',
    note: 'Can be injured during great saphenous vein harvesting.',
  },
  {
    id: 'obturator-nerve', en: 'Obturator nerve', lat: 'nervus obturatorius', region: 'lower-limb', r: 0.0022,
    pts: [[0.028, 1.06, -0.02], [0.045, 0.96, 0.01], [0.05, 0.9, 0.045], [0.07, 0.8, 0.035], [0.085, 0.7, 0.02]],
    facts: { roots: 'L2–L4 (anterior divisions)', supplies: 'Motor: adductor muscles of the thigh, gracilis, obturator externus. Sensory: medial thigh', course: 'Through the obturator canal into the medial thigh' },
    overview: 'Nerve of the medial (adductor) compartment of the thigh.',
  },
  {
    id: 'lateral-femoral-cutaneous-nerve', en: 'Lateral femoral cutaneous nerve', lat: 'nervus cutaneus femoris lateralis', region: 'lower-limb', r: 0.0013,
    pts: [[0.04, 1.11, -0.03], [0.09, 1.03, 0.02], [0.115, 0.985, 0.068], [0.14, 0.85, 0.055], [0.15, 0.7, 0.03]],
    facts: { roots: 'L2–L3', supplies: 'Sensory: skin of the anterolateral thigh', course: 'Passes under or through the inguinal ligament just medial to the ASIS' },
    overview: 'Purely sensory branch of the lumbar plexus.',
    note: 'Compression (tight belts, obesity, pregnancy) causes meralgia paraesthetica — burning pain in the lateral thigh.',
  },
  {
    id: 'ilioinguinal-nerve', en: 'Ilioinguinal nerve', lat: 'nervus ilioinguinalis', region: 'abdomen', r: 0.0012,
    pts: [[0.035, 1.15, -0.03], [0.1, 1.08, 0.0], [0.125, 1.02, 0.05], [0.07, 0.94, 0.08], [0.03, 0.91, 0.09]],
    facts: { roots: 'L1', supplies: 'Sensory: upper medial thigh, root of penis / mons pubis and anterior scrotum / labia; motor to lower internal oblique and transversus', course: 'Through the inguinal canal and superficial inguinal ring' },
    overview: 'Branch of L1 traversing the inguinal canal.',
    note: 'At risk during inguinal hernia repair.',
  },
  {
    id: 'sciatic-nerve', en: 'Sciatic nerve', lat: 'nervus ischiadicus', region: 'lower-limb', r: 0.0045,
    pts: [[0.03, 0.96, -0.06], [0.07, 0.92, -0.068], [0.09, 0.86, -0.062], [0.1, 0.75, -0.052], [0.1, 0.62, -0.045], [0.1, 0.56, -0.04]],
    facts: { roots: 'L4–S3 (sacral plexus)', branches: 'Tibial and common fibular nerves (usually at the apex of the popliteal fossa)', supplies: 'Motor: hamstrings and all muscles below the knee. Sensory: most of the leg and foot', course: 'Leaves the pelvis through the greater sciatic foramen below piriformis' },
    overview: 'The largest and longest nerve in the body.',
    note: 'Sciatica — radiating pain along its course — usually results from L4/L5 or L5/S1 disc herniation.',
  },
  {
    id: 'tibial-nerve', en: 'Tibial nerve', lat: 'nervus tibialis', region: 'lower-limb', r: 0.0032,
    pts: [[0.1, 0.56, -0.04], [0.097, 0.5, -0.042], [0.095, 0.4, -0.04], [0.09, 0.25, -0.042], [0.08, 0.12, -0.035], [0.075, 0.075, -0.03], [0.085, 0.03, -0.01]],
    facts: { roots: 'L4–S3', supplies: 'Motor: posterior leg muscles and (via plantar nerves) the sole. Sensory: sole of the foot', course: 'Through the popliteal fossa, deep to soleus, behind the medial malleolus (tarsal tunnel)' },
    overview: 'Larger terminal branch of the sciatic nerve.',
    note: 'Compression behind the medial malleolus causes tarsal tunnel syndrome.',
  },
  {
    id: 'medial-plantar-nerve', en: 'Medial plantar nerve', lat: 'nervus plantaris medialis', region: 'lower-limb', r: 0.0016,
    pts: [[0.085, 0.03, -0.01], [0.082, 0.015, 0.04], [0.08, 0.01, 0.11]],
    facts: { roots: 'L4–L5 (tibial nerve)', supplies: 'Motor: abductor hallucis, flexor digitorum brevis, flexor hallucis brevis, 1st lumbrical. Sensory: medial sole and 3½ toes' },
    overview: 'Larger terminal branch of the tibial nerve in the sole.',
  },
  {
    id: 'lateral-plantar-nerve', en: 'Lateral plantar nerve', lat: 'nervus plantaris lateralis', region: 'lower-limb', r: 0.0014,
    pts: [[0.088, 0.028, -0.012], [0.105, 0.014, 0.03], [0.118, 0.01, 0.09]],
    facts: { roots: 'S1–S2 (tibial nerve)', supplies: 'Motor: most intrinsic foot muscles. Sensory: lateral sole and 1½ toes' },
    overview: 'Smaller terminal branch of the tibial nerve in the sole.',
  },
  {
    id: 'common-fibular-nerve', en: 'Common fibular nerve', lat: 'nervus fibularis communis', region: 'lower-limb', r: 0.0026,
    pts: [[0.1, 0.56, -0.04], [0.118, 0.51, -0.038], [0.13, 0.47, -0.025], [0.134, 0.45, -0.005]],
    facts: { roots: 'L4–S2', branches: 'Superficial and deep fibular nerves', course: 'Follows biceps femoris, then winds around the neck of the fibula' },
    overview: 'Smaller terminal branch of the sciatic nerve.',
    note: 'Superficial position at the fibular neck makes it the most commonly injured nerve of the lower limb — foot drop.',
  },
  {
    id: 'superficial-fibular-nerve', en: 'Superficial fibular nerve', lat: 'nervus fibularis superficialis', region: 'lower-limb', r: 0.0017,
    pts: [[0.134, 0.45, -0.005], [0.136, 0.3, 0.0], [0.13, 0.15, 0.012], [0.115, 0.07, 0.04], [0.11, 0.04, 0.08]],
    facts: { roots: 'L4–S1', supplies: 'Motor: fibularis longus & brevis (lateral compartment). Sensory: most of the dorsum of the foot' },
    overview: 'Nerve of the lateral compartment of the leg.',
  },
  {
    id: 'deep-fibular-nerve', en: 'Deep fibular nerve', lat: 'nervus fibularis profundus', region: 'lower-limb', r: 0.0017,
    pts: [[0.134, 0.45, -0.005], [0.122, 0.42, 0.015], [0.112, 0.25, 0.02], [0.1, 0.1, 0.035], [0.09, 0.05, 0.07], [0.08, 0.028, 0.12]],
    facts: { roots: 'L4–L5', supplies: 'Motor: anterior compartment of the leg and extensor digitorum brevis. Sensory: first web space of the foot' },
    overview: 'Nerve of the anterior compartment of the leg.',
    note: 'Test sensation in the first web space to assess the deep fibular nerve.',
  },
  {
    id: 'sural-nerve', en: 'Sural nerve', lat: 'nervus suralis', region: 'lower-limb', r: 0.0013,
    pts: [[0.097, 0.46, -0.06], [0.1, 0.3, -0.07], [0.115, 0.15, -0.065], [0.132, 0.065, -0.04], [0.138, 0.03, 0.04]],
    facts: { roots: 'S1–S2 (tibial and common fibular contributions)', supplies: 'Sensory: posterolateral leg and lateral border of the foot' },
    overview: 'Cutaneous nerve of the calf.',
    note: 'Commonly harvested for nerve grafts and biopsied in peripheral neuropathy work-up.',
  },
  {
    id: 'pudendal-nerve', en: 'Pudendal nerve', lat: 'nervus pudendus', region: 'pelvis', r: 0.0018,
    pts: [[0.03, 0.94, -0.06], [0.055, 0.88, -0.05], [0.05, 0.86, -0.01], [0.02, 0.865, 0.04]],
    facts: { roots: 'S2–S4', supplies: 'Motor: external anal & urethral sphincters, perineal muscles. Sensory: perineum and external genitalia', course: 'Leaves via the greater sciatic foramen, re-enters via the lesser foramen, runs in the pudendal (Alcock) canal' },
    overview: 'Main nerve of the perineum.',
    note: 'A pudendal nerve block (at the ischial spine) provides perineal analgesia during childbirth.',
  },
  {
    id: 'superior-gluteal-nerve', en: 'Superior gluteal nerve', lat: 'nervus gluteus superior', region: 'lower-limb', r: 0.0015,
    pts: [[0.035, 0.97, -0.065], [0.075, 0.975, -0.07], [0.115, 0.99, -0.045]],
    facts: { roots: 'L4–S1', supplies: 'Gluteus medius, gluteus minimus, tensor fasciae latae', course: 'Exits the greater sciatic foramen above piriformis' },
    overview: 'Motor nerve of the hip abductors.',
    note: 'Damage produces a Trendelenburg gait.',
  },
];

/** Cranial nerves: name, latin, path (left side), facts. */
const CRANIAL: { n: string; en: string; lat: string; paths: V3[][]; r: number; facts: Facts; note?: string }[] = [
  { n: 'I', en: 'Olfactory nerve', lat: 'nervus olfactorius', r: 0.002, paths: [[[0.008, 1.655, 0.035], [0.007, 1.658, 0.055], [0.005, 1.655, 0.072]]], facts: { function: 'Special sensory: smell', course: 'Olfactory bulb and tract on the cribriform plate' }, note: 'Anosmia may follow head injury that fractures the cribriform plate.' },
  { n: 'II', en: 'Optic nerve', lat: 'nervus opticus', r: 0.0022, paths: [[[0.0, 1.66, 0.025], [0.015, 1.663, 0.04], [0.03, 1.665, 0.056]]], facts: { function: 'Special sensory: vision', course: 'Optic canal → optic chiasm → optic tract' }, note: 'A pituitary tumour compressing the chiasm gives bitemporal hemianopia.' },
  { n: 'III', en: 'Oculomotor nerve', lat: 'nervus oculomotorius', r: 0.0014, paths: [[[0.006, 1.655, 0.0], [0.015, 1.66, 0.03], [0.028, 1.664, 0.055]]], facts: { function: 'Motor: most extra-ocular muscles, levator palpebrae; parasympathetic: pupil constriction & accommodation', course: 'Lateral wall of cavernous sinus → superior orbital fissure' }, note: 'Compression by an aneurysm or uncal herniation causes a “down and out” eye with a fixed dilated pupil.' },
  { n: 'IV', en: 'Trochlear nerve', lat: 'nervus trochlearis', r: 0.001, paths: [[[0.008, 1.652, -0.012], [0.02, 1.66, 0.02], [0.03, 1.67, 0.055]]], facts: { function: 'Motor: superior oblique (depresses the adducted eye)', course: 'Only cranial nerve to exit the dorsal brainstem' }, note: 'Palsy causes vertical diplopia worse on walking downstairs.' },
  { n: 'V', en: 'Trigeminal nerve', lat: 'nervus trigeminus', r: 0.002, paths: [[[0.016, 1.638, -0.005], [0.03, 1.64, 0.015]], [[0.03, 1.64, 0.015], [0.03, 1.66, 0.045], [0.03, 1.678, 0.075]], [[0.03, 1.64, 0.015], [0.04, 1.635, 0.04], [0.04, 1.63, 0.07]], [[0.03, 1.64, 0.015], [0.042, 1.6, 0.02], [0.04, 1.565, 0.06]]], facts: { function: 'Sensory: face, scalp, cornea, mouth; motor: muscles of mastication', branches: 'Ophthalmic (V1), maxillary (V2), mandibular (V3)' }, note: 'Trigeminal neuralgia causes brief, severe electric-shock pains in V2/V3.' },
  { n: 'VI', en: 'Abducens nerve', lat: 'nervus abducens', r: 0.001, paths: [[[0.004, 1.632, -0.002], [0.02, 1.65, 0.025], [0.04, 1.664, 0.055]]], facts: { function: 'Motor: lateral rectus (abducts the eye)', course: 'Long intracranial course through the cavernous sinus' }, note: 'Raised intracranial pressure can stretch it, causing a “false-localising” lateral rectus palsy.' },
  { n: 'VII', en: 'Facial nerve', lat: 'nervus facialis', r: 0.0016, paths: [[[0.016, 1.628, -0.008], [0.04, 1.625, -0.01], [0.048, 1.612, -0.012]], [[0.048, 1.612, -0.012], [0.06, 1.63, 0.02], [0.066, 1.665, 0.045]], [[0.048, 1.612, -0.012], [0.058, 1.6, 0.03], [0.045, 1.585, 0.065]], [[0.048, 1.612, -0.012], [0.055, 1.575, 0.01], [0.04, 1.555, 0.045]]], facts: { function: 'Motor: muscles of facial expression; taste anterior ⅔ tongue; lacrimal & salivary secretion', branches: 'Temporal, zygomatic, buccal, marginal mandibular, cervical' }, note: 'Bell’s palsy is an acute lower-motor-neurone facial palsy affecting the whole half of the face.' },
  { n: 'VIII', en: 'Vestibulocochlear nerve', lat: 'nervus vestibulocochlearis', r: 0.0016, paths: [[[0.016, 1.632, -0.01], [0.032, 1.636, -0.012], [0.048, 1.64, -0.012]]], facts: { function: 'Special sensory: hearing and balance', course: 'Internal acoustic meatus' }, note: 'Vestibular schwannoma (acoustic neuroma) causes unilateral sensorineural hearing loss.' },
  { n: 'IX', en: 'Glossopharyngeal nerve', lat: 'nervus glossopharyngeus', r: 0.0012, paths: [[[0.012, 1.62, -0.012], [0.032, 1.605, -0.012], [0.03, 1.575, 0.01], [0.02, 1.565, 0.035]]], facts: { function: 'Sensory: posterior ⅓ tongue (incl. taste), pharynx, carotid sinus; motor: stylopharyngeus; parasympathetic: parotid' }, note: 'Provides the afferent limb of the gag reflex.' },
  { n: 'X', en: 'Vagus nerve', lat: 'nervus vagus', r: 0.0022, paths: [[[0.01, 1.618, -0.015], [0.03, 1.6, -0.012], [0.032, 1.52, 0.012], [0.03, 1.44, 0.02], [0.025, 1.38, 0.0], [0.015, 1.3, -0.03], [0.018, 1.22, -0.01], [0.03, 1.16, 0.03]]], facts: { function: 'Parasympathetic to thoracic and most abdominal viscera; motor to pharynx & larynx; sensory from viscera', branches: 'Pharyngeal, superior & recurrent laryngeal, cardiac, pulmonary, oesophageal, gastric' }, note: 'The left recurrent laryngeal branch loops under the aortic arch — aortic aneurysms or thyroid surgery can cause hoarseness.' },
  { n: 'XI', en: 'Accessory nerve', lat: 'nervus accessorius', r: 0.0014, paths: [[[0.01, 1.61, -0.018], [0.034, 1.595, -0.02], [0.05, 1.55, -0.012], [0.065, 1.5, -0.04], [0.085, 1.47, -0.075]]], facts: { function: 'Motor: sternocleidomastoid and trapezius', course: 'Crosses the posterior triangle of the neck superficially' }, note: 'Easily injured in lymph-node biopsy of the posterior triangle — shoulder drooping and weak shrug.' },
  { n: 'XII', en: 'Hypoglossal nerve', lat: 'nervus hypoglossus', r: 0.0014, paths: [[[0.008, 1.614, -0.008], [0.03, 1.595, -0.005], [0.032, 1.565, 0.015], [0.018, 1.565, 0.045]]], facts: { function: 'Motor: intrinsic and most extrinsic muscles of the tongue' }, note: 'A lesion makes the protruded tongue deviate towards the side of the lesion.' },
];

export function buildNervous(): StructureDef[] {
  const out: StructureDef[] = [];

  // ---------------- Brain ----------------
  for (const { s, side, tag } of SIDES) {
    out.push(
      nerve(`cerebral-hemisphere-${tag}`, 'Cerebral hemisphere', 'hemispherium cerebri', 'head-neck', side, () =>
        blob(sx([0.033, 1.702, -0.004], s), [0.034, 0.062, 0.087], { w: 40, h: 28, noise: 0.045, seed: 11 + s, // flatten the medial surface (falx cerebri) and the temporal-lobe underside
          deform: (d) => Math.min(1, 0.45 / Math.max(1e-3, -d.x * s)) * (d.y < -0.6 && d.z > -0.2 ? 0.9 : 1) }),
        {
          kind: 'organ',
          overview: 'Half of the cerebrum: frontal, parietal, temporal, occipital and insular lobes covered by the cerebral cortex.',
          facts: { function: 'Higher functions: voluntary movement (precentral gyrus), sensation (postcentral gyrus), language, memory, vision, cognition', bloodSupply: 'Anterior, middle and posterior cerebral arteries (circle of Willis)' },
          note: 'A stroke in the middle cerebral artery territory causes contralateral face/arm weakness and, if dominant, aphasia.',
        },
      ),
    );
  }
  out.push(nerve('cerebellum', 'Cerebellum', 'cerebellum', 'head-neck', 'midline', () => blob([0, 1.636, -0.058], [0.05, 0.024, 0.033], { w: 32, h: 20, noise: 0.03, seed: 4 }), { kind: 'organ', overview: 'The “little brain” behind the brainstem coordinating movement and balance.', facts: { function: 'Coordination, posture, balance, motor learning', bloodSupply: 'Superior cerebellar, AICA and PICA arteries' }, note: 'Cerebellar lesions cause ipsilateral ataxia, intention tremor, dysdiadochokinesia and nystagmus (DANISH).' }));
  out.push(nerve('midbrain', 'Midbrain', 'mesencephalon', 'head-neck', 'midline', () => blob([0, 1.662, -0.012], [0.013, 0.012, 0.012]), { kind: 'organ', overview: 'Upper part of the brainstem containing the nuclei of CN III and IV.', facts: { function: 'Eye movements, pupillary reflexes, auditory & visual reflexes; contains substantia nigra' }, note: 'Degeneration of the substantia nigra underlies Parkinson disease.' }));
  out.push(nerve('pons', 'Pons', 'pons', 'head-neck', 'midline', () => blob([0, 1.64, -0.008], [0.016, 0.013, 0.014]), { kind: 'organ', overview: 'Middle part of the brainstem; bridge to the cerebellum.', facts: { function: 'Relays cortex–cerebellum signals; nuclei of CN V–VIII; respiratory centres' } }));
  out.push(nerve('medulla-oblongata', 'Medulla oblongata', 'medulla oblongata', 'head-neck', 'midline', () => tube([[0, 1.63, -0.012], [0, 1.615, -0.025], [0, 1.602, -0.045]], (t) => 0.009 - t * 0.003), { kind: 'organ', overview: 'Lowest part of the brainstem, continuous with the spinal cord.', facts: { function: 'Cardiovascular and respiratory centres; nuclei of CN IX–XII' }, note: 'Coning (tonsillar herniation) compresses the medulla and is rapidly fatal.' }));
  out.push(nerve('corpus-callosum', 'Corpus callosum', 'corpus callosum', 'head-neck', 'midline', () => tube([[0, 1.69, 0.04], [0, 1.715, 0.01], [0, 1.715, -0.025], [0, 1.695, -0.045]], 0.006), { kind: 'organ', overview: 'Largest commissure connecting the two cerebral hemispheres.', facts: { function: 'Inter-hemispheric communication' } }));
  for (const { s, side, tag } of SIDES)
    out.push(nerve(`eyeball-${tag}`, 'Eyeball', 'bulbus oculi', 'head-neck', side, () => blob(sx([0.032, 1.665, 0.062], s), [0.012, 0.012, 0.012], { w: 20, h: 16 }), { kind: 'organ', overview: 'Organ of vision: three coats (fibrous, vascular, retina) enclosing the lens and humours.', facts: { function: 'Focuses light on the retina and converts it to neural signals', bloodSupply: 'Ophthalmic artery (central retinal & ciliary arteries)', innervation: 'Optic nerve (vision); CN III, IV, VI (movement); V1 (sensation)' }, note: 'Sudden painless monocular vision loss may indicate central retinal artery occlusion — an emergency.' }));

  // ---------------- Spinal cord (31 segments) ----------------
  const segNames = [
    ...Array.from({ length: 8 }, (_, i) => `C${i + 1}`),
    ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `L${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `S${i + 1}`),
    'Co1',
  ];
  // Segment boundaries: the cord ends at ~L1, so lumbar/sacral segments are compressed.
  const bounds: number[] = [];
  const pushRange = (from: number, to: number, n: number) => {
    for (let i = 0; i < n; i++) bounds.push(from + ((to - from) * i) / n);
  };
  pushRange(1.602, 1.47, 8);
  pushRange(1.47, 1.245, 12);
  pushRange(1.245, 1.2, 5);
  pushRange(1.2, 1.172, 5);
  pushRange(1.172, 1.162, 1);
  bounds.push(1.155);
  segNames.forEach((name, i) => {
    const y0 = bounds[i];
    const y1 = bounds[i + 1];
    const enlarge = name.startsWith('C') && +name.slice(1) >= 4 ? 0.0055 : name.startsWith('L') || name === 'S1' ? 0.005 : 0.0043;
    out.push(
      nerve(`spinal-cord-${name.toLowerCase()}`, `Spinal cord segment ${name}`, `segmentum medullae spinalis ${name}`, name.startsWith('C') ? 'head-neck' : 'back', 'midline', () => tube([canal(y0), canal((y0 + y1) / 2), canal(y1 + 0.0004)], name === 'Co1' ? (t) => 0.003 * (1 - t * 0.8) : enlarge, { tubular: 6, radial: 10 }), {
        overview: `Segment ${name} of the spinal cord${name.startsWith('C') && +name.slice(1) >= 5 ? ' (cervical enlargement — brachial plexus)' : name.startsWith('L') ? ' (lumbar enlargement — lumbosacral plexus)' : ''}.`,
        facts: { function: 'Grey matter (motor & sensory neurones) surrounded by ascending and descending white-matter tracts', bloodSupply: 'Anterior spinal artery and paired posterior spinal arteries, reinforced by segmental (radicular) arteries' },
        note: 'Complete cord transection below this level abolishes motor and sensory function below the lesion.',
      }),
    );
  });
  out.push(
    nerve('cauda-equina', 'Cauda equina', 'cauda equina', 'back', 'midline', () =>
      merge(
        [-0.004, -0.0015, 0.0015, 0.004].map((dx) => tube([canal(1.16), add(canal(1.06), dx), add(canal(1.0), dx * 1.4)], 0.0012, { radial: 5 })),
      ),
      { overview: 'Bundle of lumbar, sacral and coccygeal nerve roots descending below the end of the spinal cord (L1/L2).', facts: { roots: 'L2–Co1 nerve roots' }, note: 'Cauda equina syndrome (saddle anaesthesia, urinary retention, bilateral leg weakness) is a surgical emergency.' },
    ),
  );

  // ---------------- Spinal nerves (31 pairs) ----------------
  const exitY = (name: string): number => {
    const k = name[0];
    const n = +name.slice(name[0] === 'C' && name[1] === 'o' ? 2 : 1);
    if (name === 'Co1') return 0.885;
    if (k === 'C') return n <= 7 ? SPINE[n - 1].y + 0.009 : (SPINE[6].y + SPINE[7].y) / 2;
    if (k === 'T') return SPINE[6 + n].y - 0.013;
    if (k === 'L') return SPINE[18 + n].y - 0.015;
    return 0.985 - (n - 1) * 0.02; // sacral foramina
  };
  segNames.forEach((name, i) => {
    const yc = (bounds[i] + bounds[i + 1]) / 2;
    const ye = exitY(name);
    for (const { s, side, tag } of SIDES) {
      const c = canal(yc);
      const e = canal(ye);
      const pts: V3[] = [
        [0.004 * s, yc, c[2]],
        [0.008 * s, (yc + ye) / 2, (c[2] + e[2]) / 2],
        [0.016 * s, ye, e[2] + 0.004],
        [0.04 * s, ye - 0.008, e[2] + (name.startsWith('S') ? -0.008 : 0.012)],
      ];
      out.push(
        nerve(`spinal-nerve-${name.toLowerCase()}-${tag}`, `Spinal nerve ${name}`, `nervus spinalis ${name}`, name.startsWith('C') ? 'head-neck' : name.startsWith('S') || name === 'Co1' ? 'pelvis' : 'back', side, () => tube(pts, 0.0017, { radial: 6 }), {
          overview: `Mixed spinal nerve ${name}, formed by the union of dorsal (sensory) and ventral (motor) roots${name.startsWith('L') || name.startsWith('S') || name === 'Co1' ? '; its roots descend within the cauda equina' : ''}.`,
          facts: { roots: `Dorsal and ventral roots of cord segment ${name}`, branches: 'Anterior ramus (limbs & anterior trunk), posterior ramus (back), meningeal & rami communicantes', supplies: `Dermatome and myotome ${name}` },
          note: 'Disc herniation usually compresses the nerve root exiting one level below (e.g. an L4/L5 disc affects L5).',
        }),
      );
    }
  });

  // ---------------- Intercostal nerves T1–T11 + subcostal T12 ----------------
  for (let i = 0; i < 12; i++) {
    for (const { s, side, tag } of SIDES) {
      const rib = ribCurve(i, s);
      const pts = rib.map((p, k) => [p[0] * 0.985, p[1] - 0.008 - k * 0.0015, p[2] * 0.985] as V3);
      out.push(
        nerve(`${i === 11 ? 'subcostal' : 'intercostal'}-nerve-${i + 1}-${tag}`, i === 11 ? 'Subcostal nerve (T12)' : `Intercostal nerve T${i + 1}`, i === 11 ? 'nervus subcostalis' : `nervus intercostalis T${i + 1}`, i >= 6 ? 'abdomen' : 'thorax', side, () => tube(pts, 0.0013, { radial: 5 }), {
          overview: `Anterior ramus of T${i + 1} running in the costal groove ${i === 11 ? 'below the 12th rib' : `of rib ${i + 1}`}.`,
          facts: { roots: `T${i + 1}`, supplies: `Intercostal muscles and skin of the T${i + 1} dermatome${i >= 6 ? '; anterior abdominal wall' : ''}` },
          note: i === 9 ? 'T10 dermatome = level of the umbilicus.' : i === 3 ? 'T4 dermatome = level of the nipple.' : 'Herpes zoster (shingles) often follows a single thoracic dermatome.',
        }),
      );
    }
  }

  // ---------------- Cranial nerves ----------------
  for (const cn of CRANIAL)
    for (const { s, side, tag } of SIDES)
      out.push(
        nerve(`cn-${cn.n.toLowerCase()}-${tag}`, `${cn.en} (CN ${cn.n})`, cn.lat, cn.n === 'X' ? 'thorax' : 'head-neck', side, () => merge(cn.paths.map((p) => tube(p.map((q) => sx(q, s)), cn.r, { radial: 6 }))), {
          overview: `Cranial nerve ${cn.n}.`,
          facts: cn.facts,
          note: cn.note,
        }),
      );

  // ---------------- Peripheral nerves & plexuses ----------------
  for (const p of PERIPHERAL)
    for (const { s, side, tag } of SIDES)
      out.push(nerve(`${p.id}-${tag}`, p.en, p.lat, p.region, side, () => tube(p.pts.map((q) => sx(q, s)), p.r, { radial: 7 }), { overview: p.overview, facts: p.facts, note: p.note }));

  // Palmar digital nerves (median → digits 1–3 and lateral 4; ulnar → medial 4 and 5)
  const Wr = new THREE.Vector3(...LM.wrist);
  const D = new THREE.Vector3(0.36, 0.68, 0.03).sub(Wr).normalize();
  const T = new THREE.Vector3(1, 0, 0).sub(D.clone().multiplyScalar(D.x)).normalize();
  const N = new THREE.Vector3().crossVectors(T, D).multiplyScalar(-1).normalize();
  const H = (d: number, t: number, n = 0): V3 => {
    const p = Wr.clone().addScaledVector(D, d).addScaledVector(T, t).addScaledVector(N, n);
    return [p.x, p.y, p.z];
  };
  const digits = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
  const tips: [number, number][] = [[0.09, 0.055], [0.15, 0.022], [0.16, 0.004], [0.15, -0.012], [0.125, -0.026]];
  digits.forEach((dname, f) => {
    const fromMedian = f <= 3;
    for (const { s, side, tag } of SIDES) {
      const P = (q: V3) => sx(q, s);
      const start = fromMedian ? H(0.03, 0.006, 0.012) : H(0.03, -0.016, 0.01);
      out.push(
        nerve(`palmar-digital-nerve-${f + 1}-${tag}`, `Palmar digital nerve of ${dname}`, `nervi digitales palmares ${['pollicis', 'indicis', 'digiti medii', 'digiti annularis', 'digiti minimi'][f]}`, 'upper-limb', side, () => tube([P(start), P(H(0.06, tips[f][1] * 0.8, 0.012)), P(H(tips[f][0], tips[f][1], 0.008))], 0.0009, { radial: 5 }), {
          overview: `Sensory nerves of the palmar surface of the ${dname}, from the ${fromMedian ? 'median' : 'ulnar'} nerve${f === 3 ? ' (lateral half; medial half from the ulnar nerve)' : ''}.`,
          facts: { roots: fromMedian ? 'Median nerve (C6–C8)' : 'Ulnar nerve (C8–T1)', supplies: `Skin of the palmar ${dname} and nail bed` },
          note: 'Digital nerve blocks are performed at the base of the finger; avoid adrenaline-containing anaesthetic in classic teaching.',
        }),
      );
    }
  });
  return out;
}

function add(p: V3, dx: number): V3 {
  return [p[0] + dx, p[1], p[2]];
}
