/**
 * Muscular system. Each muscle is described once (LEFT side coordinates) and mirrored.
 * Shapes: spindle bellies, fans of fascicles, curved tubes and rings — see `Part`.
 * Facts are standard textbook origin / insertion / action / innervation / blood supply.
 */
import * as THREE from 'three';
import type { Facts, LayerIndex, RegionId, StructureDef } from '../../types';
import { makeDef, SIDES } from '../def';
import { LM } from '../landmarks';
import { fan, merge, ribbon, ring, spindle, sx, tube, lerp3, type V3 } from '../geometry';
import { ribCurve } from './skeletal';

type Part =
  | ['s', V3, V3, number, number, V3?, number?] // spindle a→b, width, thickness, normal, belly
  | ['f', V3[], V3 | V3[], number, number, V3?] // fan of spindles
  | ['t', V3[], number] // tube through points
  | ['ft', V3[], V3[], V3, number] // fan of tubes: origins → via points → insertion
  | ['ring', V3, number, number, V3?, V3?]; // torus centre, radius, tube radius, rotation, scale

interface MuscleSpec {
  id: string;
  en: string;
  lat: string;
  layer: LayerIndex;
  region: RegionId;
  parts: Part[];
  facts: Facts;
  note?: string;
  overview?: string;
}

/* Left-hand frame helpers (wrist → fingertips) used by the intrinsic hand muscles. */
const Wr = new THREE.Vector3(...LM.wrist);
const HD = new THREE.Vector3(0.36, 0.68, 0.03).sub(Wr).normalize();
const HT = new THREE.Vector3(1, 0, 0).sub(HD.clone().multiplyScalar(HD.x)).normalize();
const HN = new THREE.Vector3().crossVectors(HT, HD).multiplyScalar(-1).normalize();
const H = (d: number, t: number, n = 0): V3 => {
  const p = Wr.clone().addScaledVector(HD, d).addScaledVector(HT, t).addScaledVector(HN, n);
  return [p.x, p.y, p.z];
};

const L1: LayerIndex = 1;
const L2: LayerIndex = 2;

const MUSCLES: MuscleSpec[] = [
  // ---------------- Head & neck ----------------
  {
    id: 'frontalis', en: 'Frontalis', lat: 'venter frontalis musculi occipitofrontalis', layer: L1, region: 'head-neck',
    parts: [['s', [0.026, 1.755, 0.07], [0.026, 1.675, 0.094], 0.022, 0.003, [0, 0.4, 1]]],
    facts: { origin: 'Epicranial aponeurosis', insertion: 'Skin and fascia of the eyebrows', action: 'Raises the eyebrows and wrinkles the forehead', innervation: 'Temporal branches of the facial nerve (CN VII)', bloodSupply: 'Supraorbital, supratrochlear and superficial temporal arteries' },
    note: 'Forehead sparing in facial weakness suggests an upper motor neurone (e.g. stroke) rather than Bell’s palsy, because the upper face has bilateral cortical input.',
  },
  {
    id: 'orbicularis-oculi', en: 'Orbicularis oculi', lat: 'musculus orbicularis oculi', layer: L1, region: 'head-neck',
    parts: [['ring', [0.033, 1.664, 0.083], 0.019, 0.004, [0.15, 0.25, 0], [1, 0.85, 1]]],
    facts: { origin: 'Medial orbital margin, medial palpebral ligament, lacrimal bone', insertion: 'Lateral palpebral raphe and skin around the orbit', action: 'Closes the eyelids (gently — palpebral part; tightly — orbital part)', innervation: 'Temporal and zygomatic branches of the facial nerve', bloodSupply: 'Facial, superficial temporal and ophthalmic artery branches' },
    note: 'Inability to close the eye in Bell’s palsy risks corneal exposure — protect the eye with lubricants and taping.',
  },
  {
    id: 'zygomaticus-major', en: 'Zygomaticus major', lat: 'musculus zygomaticus major', layer: L1, region: 'head-neck',
    parts: [['s', [0.056, 1.638, 0.064], [0.03, 1.585, 0.088], 0.006, 0.003, [0.5, 0, 1]]],
    facts: { origin: 'Zygomatic bone', insertion: 'Modiolus at the angle of the mouth', action: 'Draws the angle of the mouth upward and laterally (smiling)', innervation: 'Zygomatic and buccal branches of the facial nerve', bloodSupply: 'Superior labial branch of the facial artery' },
  },
  {
    id: 'buccinator', en: 'Buccinator', lat: 'musculus buccinator', layer: L2, region: 'head-neck',
    parts: [['s', [0.047, 1.598, 0.03], [0.028, 1.588, 0.078], 0.012, 0.003, [1, 0, 0.3]]],
    facts: { origin: 'Alveolar processes of maxilla and mandible, pterygomandibular raphe', insertion: 'Modiolus and orbicularis oris', action: 'Presses the cheek against the teeth (chewing, blowing)', innervation: 'Buccal branch of the facial nerve', bloodSupply: 'Buccal branch of the maxillary artery, facial artery' },
  },
  {
    id: 'temporalis', en: 'Temporalis', lat: 'musculus temporalis', layer: L1, region: 'head-neck',
    parts: [['f', [[0.072, 1.715, 0.03], [0.078, 1.71, 0.0], [0.075, 1.695, -0.03]], [0.052, 1.605, 0.018], 0.012, 0.005, [1, 0, 0]]],
    facts: { origin: 'Floor of the temporal fossa and temporal fascia', insertion: 'Coronoid process and anterior border of the ramus of the mandible', action: 'Elevates the mandible; posterior fibres retract it', innervation: 'Deep temporal nerves (mandibular division of CN V)', bloodSupply: 'Deep temporal arteries (maxillary artery), middle temporal artery' },
  },
  {
    id: 'masseter', en: 'Masseter', lat: 'musculus masseter', layer: L1, region: 'head-neck',
    parts: [['s', [0.064, 1.64, 0.03], [0.055, 1.568, 0.004], 0.016, 0.007, [1, 0, 0]]],
    facts: { origin: 'Lower border and medial surface of the zygomatic arch', insertion: 'Lateral surface of the ramus and angle of the mandible', action: 'Elevates and protracts the mandible (closes the jaw)', innervation: 'Masseteric nerve (mandibular division of CN V)', bloodSupply: 'Masseteric artery (maxillary artery), facial artery' },
    note: 'Palpate the masseter while the patient clenches the teeth to test the motor root of the trigeminal nerve.',
  },
  {
    id: 'sternocleidomastoid', en: 'Sternocleidomastoid', lat: 'musculus sternocleidomastoideus', layer: L1, region: 'head-neck',
    parts: [['s', [0.056, 1.622, -0.028], [0.026, 1.45, 0.07], 0.011, 0.006, [1, 0, 0.6]], ['s', [0.056, 1.618, -0.026], [0.055, 1.455, 0.062], 0.007, 0.004, [1, 0, 0.6]]],
    facts: { origin: 'Sternal head: manubrium; clavicular head: medial third of clavicle', insertion: 'Mastoid process and lateral superior nuchal line', action: 'Unilateral: tilts the head to the same side and turns the face to the opposite side; bilateral: flexes the neck', innervation: 'Spinal accessory nerve (CN XI); C2–C3 proprioception', bloodSupply: 'Occipital and superior thyroid arteries' },
    note: 'Divides the neck into anterior and posterior triangles; shortening in infants causes congenital torticollis.',
  },
  {
    id: 'scalenus-anterior', en: 'Scalenus anterior', lat: 'musculus scalenus anterior', layer: L2, region: 'head-neck',
    parts: [['s', [0.028, 1.535, -0.025], [0.048, 1.432, 0.038], 0.006, 0.004, [1, 0, 0.3]]],
    facts: { origin: 'Anterior tubercles of transverse processes C3–C6', insertion: 'Scalene tubercle of the first rib', action: 'Elevates the first rib; laterally flexes and rotates the neck', innervation: 'Anterior rami of C4–C6', bloodSupply: 'Ascending cervical artery' },
    note: 'The phrenic nerve lies on its anterior surface; the brachial plexus and subclavian artery pass behind it (thoracic outlet).',
  },
  {
    id: 'splenius-capitis', en: 'Splenius capitis', lat: 'musculus splenius capitis', layer: L2, region: 'head-neck',
    parts: [['s', [0.006, 1.46, -0.085], [0.05, 1.622, -0.042], 0.012, 0.005, [0.3, 0, -1]]],
    facts: { origin: 'Ligamentum nuchae, spinous processes C7–T3', insertion: 'Mastoid process and lateral superior nuchal line', action: 'Extends the head and neck; rotates the face to the same side', innervation: 'Posterior rami of middle cervical spinal nerves', bloodSupply: 'Occipital artery' },
  },
  // ---------------- Anterior trunk ----------------
  {
    id: 'pectoralis-major', en: 'Pectoralis major', lat: 'musculus pectoralis major', layer: L1, region: 'thorax',
    parts: [['f', [[0.035, 1.452, 0.078], [0.07, 1.458, 0.075], [0.02, 1.4, 0.1], [0.02, 1.35, 0.108], [0.025, 1.3, 0.114], [0.06, 1.27, 0.118]], [0.168, 1.385, 0.03], 0.018, 0.009, [0.2, 0, 1]]],
    facts: { origin: 'Clavicular head: medial half of clavicle; sternocostal head: sternum, costal cartilages 1–6, external oblique aponeurosis', insertion: 'Lateral lip of the intertubercular sulcus of the humerus', action: 'Adducts and medially rotates the humerus; clavicular head flexes the arm', innervation: 'Lateral and medial pectoral nerves (C5–T1)', bloodSupply: 'Pectoral branches of the thoracoacromial artery; internal thoracic perforators' },
    note: 'Congenital absence of the sternal head occurs in Poland syndrome.',
  },
  {
    id: 'pectoralis-minor', en: 'Pectoralis minor', lat: 'musculus pectoralis minor', layer: L2, region: 'thorax',
    parts: [['f', [[0.075, 1.37, 0.1], [0.085, 1.335, 0.1], [0.095, 1.3, 0.095]], [0.148, 1.433, 0.034], 0.01, 0.005, [0.2, 0, 1]]],
    facts: { origin: 'Outer surfaces of ribs 3–5 near their cartilages', insertion: 'Coracoid process of the scapula', action: 'Stabilises the scapula by drawing it anteroinferiorly against the thoracic wall', innervation: 'Medial pectoral nerve (C8–T1)', bloodSupply: 'Pectoral branches of the thoracoacromial artery' },
    note: 'Divides the axillary artery into three parts and is a landmark for axillary lymph-node levels in breast cancer surgery.',
  },
  {
    id: 'serratus-anterior', en: 'Serratus anterior', lat: 'musculus serratus anterior', layer: L1, region: 'thorax',
    parts: [['ft',
      [[0.13, 1.39, 0.055], [0.138, 1.35, 0.055], [0.145, 1.31, 0.05], [0.148, 1.27, 0.045], [0.146, 1.23, 0.04], [0.14, 1.19, 0.035]],
      [[0.152, 1.38, -0.04], [0.158, 1.34, -0.045], [0.16, 1.3, -0.05], [0.158, 1.27, -0.055], [0.152, 1.24, -0.06], [0.145, 1.22, -0.065]],
      [0.09, 1.34, -0.1], 0.0065]],
    facts: { origin: 'External surfaces of the lateral parts of ribs 1–8', insertion: 'Costal (anterior) surface of the medial border of the scapula', action: 'Protracts the scapula and rotates it upward; holds it against the thoracic wall', innervation: 'Long thoracic nerve (C5–C7)', bloodSupply: 'Lateral thoracic and thoracodorsal arteries' },
    note: 'Injury to the long thoracic nerve (e.g. during axillary surgery) causes a “winged” scapula when pushing against a wall.',
  },
  {
    id: 'rectus-abdominis', en: 'Rectus abdominis', lat: 'musculus rectus abdominis', layer: L1, region: 'abdomen',
    parts: [['s', [0.022, 0.912, 0.092], [0.062, 1.27, 0.116], 0.032, 0.01, [0, 0, 1], 0.6]],
    facts: { origin: 'Pubic symphysis and pubic crest', insertion: 'Xiphoid process and costal cartilages 5–7', action: 'Flexes the trunk (lumbar spine); compresses the abdominal viscera', innervation: 'Thoraco-abdominal nerves (T7–T11) and subcostal nerve (T12)', bloodSupply: 'Superior and inferior epigastric arteries' },
    note: 'Separation of the two recti (diastasis recti) is common after pregnancy.',
  },
  {
    id: 'external-oblique', en: 'External oblique', lat: 'musculus obliquus externus abdominis', layer: L1, region: 'abdomen',
    parts: [['f', [[0.14, 1.24, 0.045], [0.145, 1.19, 0.035], [0.143, 1.14, 0.025], [0.138, 1.09, 0.015]], [[0.065, 1.1, 0.118], [0.08, 1.04, 0.112], [0.1, 1.0, 0.095], [0.13, 0.995, 0.055]], 0.016, 0.006, [1, 0, 0.8]]],
    facts: { origin: 'External surfaces of ribs 5–12', insertion: 'Linea alba, pubic tubercle and anterior half of the iliac crest', action: 'Compresses the abdomen; flexes and rotates the trunk to the opposite side', innervation: 'Thoraco-abdominal nerves (T7–T11) and subcostal nerve', bloodSupply: 'Lower posterior intercostal, subcostal, inferior epigastric and deep circumflex iliac arteries' },
    note: 'Its aponeurosis forms the inguinal ligament and the superficial inguinal ring — the exit point of indirect inguinal hernias.',
  },
  {
    id: 'internal-oblique', en: 'Internal oblique', lat: 'musculus obliquus internus abdominis', layer: L2, region: 'abdomen',
    parts: [['f', [[0.13, 1.03, 0.045], [0.125, 1.0, 0.065], [0.11, 0.97, 0.08]], [[0.1, 1.17, 0.085], [0.07, 1.14, 0.108], [0.05, 1.06, 0.11]], 0.016, 0.005, [1, 0, 0.8]]],
    facts: { origin: 'Thoracolumbar fascia, anterior two-thirds of the iliac crest, lateral inguinal ligament', insertion: 'Inferior borders of ribs 10–12, linea alba, pubic crest via conjoint tendon', action: 'Compresses the abdomen; flexes and rotates the trunk to the same side', innervation: 'Thoraco-abdominal nerves (T7–T11), subcostal, iliohypogastric and ilioinguinal nerves', bloodSupply: 'Superior and inferior epigastric and deep circumflex iliac arteries' },
  },
  {
    id: 'transversus-abdominis', en: 'Transversus abdominis', lat: 'musculus transversus abdominis', layer: L2, region: 'abdomen',
    parts: [['ft', [[0.12, 1.16, -0.03], [0.125, 1.1, -0.03], [0.125, 1.04, -0.02]], [[0.135, 1.16, 0.03], [0.14, 1.1, 0.04], [0.135, 1.04, 0.05]], [0.04, 1.08, 0.105], 0.008]],
    facts: { origin: 'Internal surfaces of costal cartilages 7–12, thoracolumbar fascia, iliac crest, lateral inguinal ligament', insertion: 'Linea alba, pubic crest via the conjoint tendon', action: 'Compresses and supports the abdominal viscera', innervation: 'Thoraco-abdominal nerves (T7–T11), subcostal, iliohypogastric and ilioinguinal nerves', bloodSupply: 'Deep circumflex iliac, inferior epigastric and posterior intercostal arteries' },
    note: 'The transversus abdominis plane (TAP) block injects local anaesthetic between this muscle and the internal oblique.',
  },
  // ---------------- Back ----------------
  {
    id: 'trapezius', en: 'Trapezius', lat: 'musculus trapezius', layer: L1, region: 'back',
    parts: [['f', [[0.004, 1.635, -0.075], [0.004, 1.55, -0.07], [0.004, 1.49, -0.1], [0.004, 1.42, -0.125], [0.004, 1.34, -0.13], [0.004, 1.26, -0.125], [0.004, 1.19, -0.11]], [[0.1, 1.47, 0.0], [0.13, 1.468, -0.02], [0.16, 1.465, -0.045], [0.14, 1.445, -0.08], [0.115, 1.43, -0.1], [0.09, 1.415, -0.108], [0.08, 1.41, -0.11]], 0.022, 0.006, [0, 0.3, -1]]],
    facts: { origin: 'External occipital protuberance, superior nuchal line, ligamentum nuchae, spinous processes C7–T12', insertion: 'Lateral third of the clavicle, acromion and spine of the scapula', action: 'Elevates, retracts and upwardly rotates the scapula; lower fibres depress it', innervation: 'Spinal accessory nerve (CN XI); C3–C4 (proprioception)', bloodSupply: 'Transverse cervical artery, occipital artery, dorsal scapular artery' },
    note: 'Test CN XI by asking the patient to shrug the shoulders against resistance.',
  },
  {
    id: 'latissimus-dorsi', en: 'Latissimus dorsi', lat: 'musculus latissimus dorsi', layer: L1, region: 'back',
    parts: [['ft',
      [[0.005, 1.3, -0.125], [0.005, 1.24, -0.12], [0.005, 1.18, -0.105], [0.01, 1.11, -0.095], [0.04, 1.07, -0.09], [0.1, 1.07, -0.065], [0.135, 1.09, -0.04]],
      [[0.1, 1.33, -0.115], [0.12, 1.3, -0.105], [0.135, 1.27, -0.09], [0.145, 1.24, -0.075], [0.15, 1.21, -0.06], [0.155, 1.2, -0.045], [0.155, 1.2, -0.03]],
      [0.165, 1.385, -0.002], 0.0075]],
    facts: { origin: 'Spinous processes T7–T12, thoracolumbar fascia, iliac crest, inferior 3–4 ribs', insertion: 'Floor of the intertubercular sulcus of the humerus', action: 'Extends, adducts and medially rotates the humerus (climbing, swimming)', innervation: 'Thoracodorsal nerve (C6–C8)', bloodSupply: 'Thoracodorsal artery; posterior intercostal and lumbar perforators' },
    note: 'A popular pedicled flap for breast reconstruction, based on the thoracodorsal vessels.',
  },
  {
    id: 'rhomboid-major', en: 'Rhomboid major', lat: 'musculus rhomboideus major', layer: L2, region: 'back',
    parts: [['f', [[0.004, 1.445, -0.112], [0.004, 1.42, -0.118], [0.004, 1.395, -0.122], [0.004, 1.37, -0.124]], [[0.074, 1.405, -0.106], [0.08, 1.37, -0.108], [0.088, 1.33, -0.11], [0.098, 1.29, -0.112]], 0.012, 0.004, [0, 0, -1]]],
    facts: { origin: 'Spinous processes T2–T5', insertion: 'Medial border of the scapula below the spine', action: 'Retracts the scapula and rotates it to depress the glenoid cavity', innervation: 'Dorsal scapular nerve (C4–C5)', bloodSupply: 'Dorsal scapular artery, posterior intercostal arteries' },
  },
  {
    id: 'rhomboid-minor', en: 'Rhomboid minor', lat: 'musculus rhomboideus minor', layer: L2, region: 'back',
    parts: [['f', [[0.004, 1.49, -0.1], [0.004, 1.47, -0.106]], [[0.07, 1.428, -0.104], [0.072, 1.418, -0.105]], 0.008, 0.004, [0, 0, -1]]],
    facts: { origin: 'Ligamentum nuchae, spinous processes C7–T1', insertion: 'Medial border of the scapula at the root of the spine', action: 'Retracts and rotates the scapula', innervation: 'Dorsal scapular nerve (C4–C5)', bloodSupply: 'Dorsal scapular artery' },
  },
  {
    id: 'levator-scapulae', en: 'Levator scapulae', lat: 'musculus levator scapulae', layer: L2, region: 'head-neck',
    parts: [['s', [0.032, 1.585, -0.038], [0.07, 1.447, -0.098], 0.008, 0.005, [1, 0, -0.5]]],
    facts: { origin: 'Posterior tubercles of the transverse processes C1–C4', insertion: 'Medial border of the scapula above the spine (superior angle)', action: 'Elevates the scapula and tilts the glenoid inferiorly', innervation: 'Dorsal scapular nerve (C5) and cervical nerves C3–C4', bloodSupply: 'Dorsal scapular and transverse cervical arteries' },
  },
  {
    id: 'spinalis', en: 'Spinalis', lat: 'musculus spinalis', layer: L2, region: 'back',
    parts: [['t', [[0.012, 1.05, -0.085], [0.012, 1.15, -0.088], [0.012, 1.25, -0.115], [0.012, 1.35, -0.122], [0.012, 1.45, -0.1]], 0.006]],
    facts: { origin: 'Spinous processes of upper lumbar and lower thoracic vertebrae', insertion: 'Spinous processes of upper thoracic vertebrae', action: 'Extends the vertebral column', innervation: 'Posterior rami of spinal nerves', bloodSupply: 'Posterior intercostal and lumbar arteries' },
  },
  {
    id: 'longissimus', en: 'Longissimus', lat: 'musculus longissimus', layer: L2, region: 'back',
    parts: [['t', [[0.03, 0.98, -0.085], [0.03, 1.1, -0.08], [0.032, 1.22, -0.105], [0.032, 1.34, -0.115], [0.03, 1.46, -0.09], [0.035, 1.58, -0.05]], 0.009]],
    facts: { origin: 'Sacrum, iliac crest, lumbar and thoracic transverse processes', insertion: 'Transverse processes of thoracic and cervical vertebrae, ribs, mastoid process', action: 'Extends and laterally flexes the vertebral column and head', innervation: 'Posterior rami of spinal nerves', bloodSupply: 'Posterior intercostal, subcostal and lumbar arteries' },
    overview: 'Intermediate column of the erector spinae.',
  },
  {
    id: 'iliocostalis', en: 'Iliocostalis', lat: 'musculus iliocostalis', layer: L2, region: 'back',
    parts: [['t', [[0.05, 1.0, -0.075], [0.055, 1.1, -0.07], [0.06, 1.22, -0.095], [0.06, 1.34, -0.105], [0.05, 1.45, -0.08]], 0.008]],
    facts: { origin: 'Iliac crest, sacrum, angles of the lower ribs', insertion: 'Angles of the ribs and cervical transverse processes', action: 'Extends and laterally flexes the vertebral column', innervation: 'Posterior rami of spinal nerves', bloodSupply: 'Posterior intercostal, subcostal and lumbar arteries' },
    overview: 'Lateral column of the erector spinae.',
  },
  {
    id: 'quadratus-lumborum', en: 'Quadratus lumborum', lat: 'musculus quadratus lumborum', layer: L2, region: 'back',
    parts: [['s', [0.085, 1.045, -0.045], [0.06, 1.185, -0.055], 0.018, 0.008, [0, 0, -1]]],
    facts: { origin: 'Iliac crest and iliolumbar ligament', insertion: '12th rib and transverse processes L1–L4', action: 'Extends and laterally flexes the trunk; fixes the 12th rib during inspiration', innervation: 'Anterior rami of T12–L4', bloodSupply: 'Lumbar, iliolumbar and subcostal arteries' },
  },
  {
    id: 'psoas-major', en: 'Psoas major', lat: 'musculus psoas major', layer: L2, region: 'abdomen',
    parts: [['t', [[0.024, 1.175, -0.03], [0.035, 1.08, -0.012], [0.055, 0.99, 0.01], [0.085, 0.93, 0.045], [0.112, 0.885, 0.015]], 0.012]],
    facts: { origin: 'Bodies and transverse processes of T12–L5 and intervertebral discs', insertion: 'Lesser trochanter of the femur', action: 'Flexes the hip (with iliacus); flexes the trunk', innervation: 'Anterior rami of L1–L3', bloodSupply: 'Lumbar arteries, iliolumbar artery' },
    note: 'Pain on hip extension (positive psoas sign) suggests a retrocaecal appendicitis or psoas abscess.',
  },
  {
    id: 'iliacus', en: 'Iliacus', lat: 'musculus iliacus', layer: L2, region: 'pelvis',
    parts: [['f', [[0.085, 1.05, 0.0], [0.105, 1.04, 0.02], [0.115, 1.01, 0.04]], [0.11, 0.89, 0.018], 0.014, 0.006, [-0.6, 0, 1]]],
    facts: { origin: 'Iliac fossa, iliac crest, ala of sacrum', insertion: 'Lesser trochanter of the femur (with psoas tendon)', action: 'Flexes and stabilises the hip joint', innervation: 'Femoral nerve (L2–L3)', bloodSupply: 'Iliolumbar artery, deep circumflex iliac artery' },
  },
  // ---------------- Shoulder & scapular ----------------
  {
    id: 'deltoid', en: 'Deltoid', lat: 'musculus deltoideus', layer: L1, region: 'upper-limb',
    parts: [['f', [[0.13, 1.465, 0.045], [0.165, 1.475, 0.025], [0.196, 1.472, -0.005], [0.19, 1.468, -0.04], [0.165, 1.46, -0.07], [0.14, 1.45, -0.09]], [0.218, 1.32, -0.016], 0.015, 0.01, [1, 0.2, 0]]],
    facts: { origin: 'Lateral third of the clavicle, acromion and spine of the scapula', insertion: 'Deltoid tuberosity of the humerus', action: 'Abducts the arm (15–90°); anterior fibres flex and medially rotate, posterior fibres extend and laterally rotate', innervation: 'Axillary nerve (C5–C6)', bloodSupply: 'Posterior circumflex humeral artery; deltoid branch of the thoracoacromial artery' },
    note: 'Axillary nerve injury (shoulder dislocation, surgical-neck fracture) paralyses deltoid and causes numbness over the “regimental badge” area.',
  },
  {
    id: 'supraspinatus', en: 'Supraspinatus', lat: 'musculus supraspinatus', layer: L2, region: 'upper-limb',
    parts: [['s', [0.08, 1.44, -0.098], [0.182, 1.452, -0.012], 0.011, 0.007, [0, 1, -0.3]]],
    facts: { origin: 'Supraspinous fossa of the scapula', insertion: 'Superior facet of the greater tubercle of the humerus', action: 'Initiates abduction of the arm (first ~15°); rotator-cuff stabiliser', innervation: 'Suprascapular nerve (C5–C6)', bloodSupply: 'Suprascapular artery' },
    note: 'The most frequently torn rotator-cuff tendon; impingement gives a painful arc between 60° and 120° of abduction.',
  },
  {
    id: 'infraspinatus', en: 'Infraspinatus', lat: 'musculus infraspinatus', layer: L1, region: 'upper-limb',
    parts: [['f', [[0.085, 1.39, -0.115], [0.09, 1.34, -0.118], [0.1, 1.3, -0.118]], [0.185, 1.425, -0.035], 0.014, 0.006, [0, 0, -1]]],
    facts: { origin: 'Infraspinous fossa of the scapula', insertion: 'Middle facet of the greater tubercle of the humerus', action: 'Laterally rotates the arm; rotator-cuff stabiliser', innervation: 'Suprascapular nerve (C5–C6)', bloodSupply: 'Suprascapular and circumflex scapular arteries' },
  },
  {
    id: 'teres-minor', en: 'Teres minor', lat: 'musculus teres minor', layer: L2, region: 'upper-limb',
    parts: [['s', [0.145, 1.36, -0.095], [0.182, 1.41, -0.04], 0.007, 0.006, [0, 0, -1]]],
    facts: { origin: 'Upper two-thirds of the lateral border of the scapula', insertion: 'Inferior facet of the greater tubercle of the humerus', action: 'Laterally rotates the arm; rotator-cuff stabiliser', innervation: 'Axillary nerve (C5–C6)', bloodSupply: 'Circumflex scapular and posterior circumflex humeral arteries' },
  },
  {
    id: 'teres-major', en: 'Teres major', lat: 'musculus teres major', layer: L1, region: 'upper-limb',
    parts: [['s', [0.108, 1.29, -0.112], [0.165, 1.375, -0.008], 0.011, 0.008, [0, 0, -1]]],
    facts: { origin: 'Dorsal surface of the inferior angle of the scapula', insertion: 'Medial lip of the intertubercular sulcus of the humerus', action: 'Adducts and medially rotates the arm', innervation: 'Lower subscapular nerve (C5–C7)', bloodSupply: 'Circumflex scapular and thoracodorsal arteries' },
  },
  {
    id: 'subscapularis', en: 'Subscapularis', lat: 'musculus subscapularis', layer: L2, region: 'upper-limb',
    parts: [['f', [[0.085, 1.4, -0.088], [0.095, 1.35, -0.09], [0.105, 1.3, -0.095]], [0.168, 1.412, 0.004], 0.013, 0.006, [-0.3, 0, 1]]],
    facts: { origin: 'Subscapular fossa (costal surface of the scapula)', insertion: 'Lesser tubercle of the humerus', action: 'Medially rotates and adducts the arm; rotator-cuff stabiliser', innervation: 'Upper and lower subscapular nerves (C5–C7)', bloodSupply: 'Subscapular artery' },
  },
  // ---------------- Arm ----------------
  {
    id: 'biceps-brachii', en: 'Biceps brachii', lat: 'musculus biceps brachii', layer: L1, region: 'upper-limb',
    parts: [['s', [0.182, 1.39, 0.012], [0.256, 1.1, -0.002], 0.017, 0.016, [0, 0, 1], 0.55], ['t', [[0.175, 1.43, 0.0], [0.18, 1.41, 0.012]], 0.003]],
    facts: { origin: 'Long head: supraglenoid tubercle; short head: coracoid process', insertion: 'Radial tuberosity and bicipital aponeurosis', action: 'Supinates the forearm and flexes the elbow; weakly flexes the shoulder', innervation: 'Musculocutaneous nerve (C5–C6)', bloodSupply: 'Muscular branches of the brachial artery' },
    note: 'The biceps reflex tests C5–C6; rupture of the long-head tendon produces a “Popeye” bulge.',
  },
  {
    id: 'brachialis', en: 'Brachialis', lat: 'musculus brachialis', layer: L2, region: 'upper-limb',
    parts: [['s', [0.215, 1.27, -0.004], [0.242, 1.1, -0.02], 0.016, 0.01, [0, 0, 1]]],
    facts: { origin: 'Distal half of the anterior surface of the humerus', insertion: 'Coronoid process and tuberosity of the ulna', action: 'Flexes the elbow in all positions (main elbow flexor)', innervation: 'Musculocutaneous nerve (C5–C6); small lateral part by radial nerve', bloodSupply: 'Brachial artery, radial recurrent artery' },
  },
  {
    id: 'coracobrachialis', en: 'Coracobrachialis', lat: 'musculus coracobrachialis', layer: L2, region: 'upper-limb',
    parts: [['s', [0.15, 1.432, 0.03], [0.205, 1.3, -0.006], 0.007, 0.006, [-0.4, 0, 1]]],
    facts: { origin: 'Tip of the coracoid process', insertion: 'Middle of the medial surface of the humerus', action: 'Flexes and adducts the arm', innervation: 'Musculocutaneous nerve (C5–C7)', bloodSupply: 'Brachial artery' },
  },
  {
    id: 'triceps-brachii', en: 'Triceps brachii', lat: 'musculus triceps brachii', layer: L1, region: 'upper-limb',
    parts: [['s', [0.17, 1.39, -0.058], [0.233, 1.14, -0.065], 0.02, 0.016, [0, 0, -1], 0.45], ['s', [0.2, 1.37, -0.04], [0.235, 1.15, -0.06], 0.012, 0.01, [1, 0, -1]]],
    facts: { origin: 'Long head: infraglenoid tubercle; lateral & medial heads: posterior humerus above/below the radial groove', insertion: 'Olecranon of the ulna', action: 'Extends the elbow; long head extends and adducts the arm', innervation: 'Radial nerve (C6–C8)', bloodSupply: 'Profunda brachii artery, superior ulnar collateral artery' },
    note: 'The triceps reflex tests C7.',
  },
  // ---------------- Forearm ----------------
  {
    id: 'brachioradialis', en: 'Brachioradialis', lat: 'musculus brachioradialis', layer: L1, region: 'upper-limb',
    parts: [['s', [0.258, 1.2, -0.02], [0.33, 0.89, 0.012], 0.012, 0.01, [1, 0, 0.3], 0.35]],
    facts: { origin: 'Lateral supracondylar ridge of the humerus', insertion: 'Lateral surface of the distal radius (styloid process)', action: 'Flexes the elbow, especially with the forearm mid-pronated', innervation: 'Radial nerve (C5–C6)', bloodSupply: 'Radial recurrent artery' },
    note: 'The brachioradialis (supinator) reflex tests C6.',
  },
  {
    id: 'pronator-teres', en: 'Pronator teres', lat: 'musculus pronator teres', layer: L1, region: 'upper-limb',
    parts: [['s', [0.226, 1.12, -0.02], [0.292, 1.02, 0.01], 0.009, 0.007, [0, 0, 1]]],
    facts: { origin: 'Medial epicondyle of the humerus and coronoid process of the ulna', insertion: 'Middle of the lateral surface of the radius', action: 'Pronates the forearm; assists elbow flexion', innervation: 'Median nerve (C6–C7)', bloodSupply: 'Ulnar and radial arteries' },
    note: 'The median nerve passes between its two heads and can be compressed here (pronator syndrome).',
  },
  {
    id: 'flexor-carpi-radialis', en: 'Flexor carpi radialis', lat: 'musculus flexor carpi radialis', layer: L1, region: 'upper-limb',
    parts: [['s', [0.229, 1.112, -0.012], [0.318, 0.872, 0.016], 0.008, 0.007, [0, 0, 1], 0.3]],
    facts: { origin: 'Medial epicondyle of the humerus (common flexor origin)', insertion: 'Bases of the 2nd and 3rd metacarpals', action: 'Flexes and abducts the wrist', innervation: 'Median nerve (C6–C7)', bloodSupply: 'Ulnar and radial arteries' },
  },
  {
    id: 'flexor-carpi-ulnaris', en: 'Flexor carpi ulnaris', lat: 'musculus flexor carpi ulnaris', layer: L1, region: 'upper-limb',
    parts: [['s', [0.224, 1.118, -0.036], [0.292, 0.878, -0.002], 0.008, 0.007, [-0.6, 0, 1], 0.3]],
    facts: { origin: 'Medial epicondyle of the humerus; olecranon and posterior border of the ulna', insertion: 'Pisiform, hook of hamate and base of the 5th metacarpal', action: 'Flexes and adducts the wrist', innervation: 'Ulnar nerve (C7–T1)', bloodSupply: 'Ulnar artery' },
  },
  {
    id: 'flexor-digitorum-superficialis', en: 'Flexor digitorum superficialis', lat: 'musculus flexor digitorum superficialis', layer: L2, region: 'upper-limb',
    parts: [['s', [0.232, 1.108, -0.012], [0.31, 0.882, 0.008], 0.012, 0.008, [0, 0, 1], 0.4]],
    facts: { origin: 'Medial epicondyle, coronoid process of the ulna, anterior oblique line of the radius', insertion: 'Bodies of the middle phalanges of digits 2–5', action: 'Flexes the proximal interphalangeal and metacarpophalangeal joints and the wrist', innervation: 'Median nerve (C7–T1)', bloodSupply: 'Ulnar and radial arteries' },
  },
  {
    id: 'flexor-digitorum-profundus', en: 'Flexor digitorum profundus', lat: 'musculus flexor digitorum profundus', layer: L2, region: 'upper-limb',
    parts: [['s', [0.24, 1.08, -0.036], [0.305, 0.88, 0.0], 0.012, 0.008, [0, 0, 1], 0.4]],
    facts: { origin: 'Proximal three-quarters of the medial and anterior ulna, interosseous membrane', insertion: 'Bases of the distal phalanges of digits 2–5', action: 'Flexes the distal interphalangeal joints (and assists wrist flexion)', innervation: 'Medial part: ulnar nerve; lateral part: anterior interosseous nerve (median) — C8–T1', bloodSupply: 'Anterior interosseous and ulnar arteries' },
  },
  {
    id: 'extensor-carpi-radialis-longus', en: 'Extensor carpi radialis longus', lat: 'musculus extensor carpi radialis longus', layer: L1, region: 'upper-limb',
    parts: [['s', [0.268, 1.18, -0.032], [0.326, 0.878, -0.01], 0.009, 0.008, [1, 0, -0.4], 0.3]],
    facts: { origin: 'Lateral supracondylar ridge of the humerus', insertion: 'Dorsal base of the 2nd metacarpal', action: 'Extends and abducts the wrist', innervation: 'Radial nerve (C6–C7)', bloodSupply: 'Radial artery, radial recurrent artery' },
  },
  {
    id: 'extensor-digitorum', en: 'Extensor digitorum', lat: 'musculus extensor digitorum', layer: L1, region: 'upper-limb',
    parts: [['s', [0.276, 1.118, -0.042], [0.31, 0.878, -0.018], 0.01, 0.008, [0.5, 0, -1], 0.35]],
    facts: { origin: 'Lateral epicondyle of the humerus (common extensor origin)', insertion: 'Extensor expansions of digits 2–5', action: 'Extends digits 2–5 at the MCP and IP joints; extends the wrist', innervation: 'Posterior interosseous nerve (radial, C7–C8)', bloodSupply: 'Posterior interosseous artery' },
    note: 'Overuse of the common extensor origin causes lateral epicondylitis (“tennis elbow”).',
  },
  {
    id: 'extensor-carpi-ulnaris', en: 'Extensor carpi ulnaris', lat: 'musculus extensor carpi ulnaris', layer: L1, region: 'upper-limb',
    parts: [['s', [0.268, 1.11, -0.052], [0.291, 0.88, -0.016], 0.008, 0.007, [0, 0, -1], 0.35]],
    facts: { origin: 'Lateral epicondyle of the humerus and posterior border of the ulna', insertion: 'Base of the 5th metacarpal', action: 'Extends and adducts the wrist', innervation: 'Posterior interosseous nerve (C7–C8)', bloodSupply: 'Ulnar artery' },
  },
  {
    id: 'abductor-pollicis-brevis', en: 'Abductor pollicis brevis', lat: 'musculus abductor pollicis brevis', layer: L1, region: 'upper-limb',
    parts: [['s', H(0.02, 0.016, 0.009), H(0.058, 0.04, 0.012), 0.007, 0.005, [0, 0, 1]]],
    facts: { origin: 'Flexor retinaculum, tubercles of the scaphoid and trapezium', insertion: 'Lateral base of the proximal phalanx of the thumb', action: 'Abducts the thumb', innervation: 'Recurrent (thenar) branch of the median nerve (C8–T1)', bloodSupply: 'Superficial palmar branch of the radial artery' },
    note: 'Thenar wasting and weak thumb abduction are late signs of carpal tunnel syndrome.',
  },
  {
    id: 'abductor-digiti-minimi-hand', en: 'Abductor digiti minimi (hand)', lat: 'musculus abductor digiti minimi manus', layer: L1, region: 'upper-limb',
    parts: [['s', H(0.014, -0.018, 0.007), H(0.07, -0.024, 0.004), 0.006, 0.005, [0, 0, 1]]],
    facts: { origin: 'Pisiform bone', insertion: 'Medial base of the proximal phalanx of the little finger', action: 'Abducts the little finger', innervation: 'Deep branch of the ulnar nerve (C8–T1)', bloodSupply: 'Ulnar artery' },
  },
  // ---------------- Hip & gluteal ----------------
  {
    id: 'gluteus-maximus', en: 'Gluteus maximus', lat: 'musculus gluteus maximus', layer: L1, region: 'lower-limb',
    parts: [['f', [[0.045, 1.04, -0.1], [0.03, 1.0, -0.105], [0.02, 0.96, -0.1], [0.015, 0.92, -0.085], [0.015, 0.895, -0.065]], [[0.148, 0.9, -0.02], [0.148, 0.885, -0.025], [0.145, 0.87, -0.03], [0.14, 0.85, -0.03], [0.135, 0.83, -0.03]], 0.024, 0.024, [0, 0, -1]]],
    facts: { origin: 'Posterior ilium behind the posterior gluteal line, dorsal sacrum and coccyx, sacrotuberous ligament', insertion: 'Iliotibial tract and gluteal tuberosity of the femur', action: 'Extends and laterally rotates the hip (rising from sitting, climbing stairs)', innervation: 'Inferior gluteal nerve (L5–S2)', bloodSupply: 'Superior and inferior gluteal arteries' },
    note: 'Give intramuscular injections in the upper-outer quadrant of the buttock to avoid the sciatic nerve.',
  },
  {
    id: 'gluteus-medius', en: 'Gluteus medius', lat: 'musculus gluteus medius', layer: L2, region: 'lower-limb',
    parts: [['f', [[0.095, 1.06, -0.055], [0.125, 1.065, -0.02], [0.135, 1.05, 0.02], [0.125, 1.02, 0.05]], [0.146, 0.935, -0.002], 0.016, 0.01, [1, 0, -0.4]]],
    facts: { origin: 'External surface of the ilium between the anterior and posterior gluteal lines', insertion: 'Lateral surface of the greater trochanter', action: 'Abducts and medially rotates the hip; keeps the pelvis level when the opposite foot is lifted', innervation: 'Superior gluteal nerve (L4–S1)', bloodSupply: 'Superior gluteal artery' },
    note: 'Weakness produces a positive Trendelenburg sign — the pelvis drops on the unsupported side.',
  },
  {
    id: 'gluteus-minimus', en: 'Gluteus minimus', lat: 'musculus gluteus minimus', layer: L2, region: 'lower-limb',
    parts: [['f', [[0.115, 1.02, -0.01], [0.125, 1.01, 0.03]], [0.143, 0.935, 0.01], 0.012, 0.007, [1, 0, 0]]],
    facts: { origin: 'External surface of the ilium between the anterior and inferior gluteal lines', insertion: 'Anterior surface of the greater trochanter', action: 'Abducts and medially rotates the hip; stabilises the pelvis', innervation: 'Superior gluteal nerve (L4–S1)', bloodSupply: 'Superior gluteal artery' },
  },
  {
    id: 'piriformis', en: 'Piriformis', lat: 'musculus piriformis', layer: L2, region: 'lower-limb',
    parts: [['s', [0.025, 0.96, -0.072], [0.136, 0.932, -0.012], 0.01, 0.007, [0, 0, -1]]],
    facts: { origin: 'Anterior surface of the sacrum (S2–S4)', insertion: 'Superior border of the greater trochanter', action: 'Laterally rotates the extended hip; abducts the flexed hip', innervation: 'Nerve to piriformis (S1–S2)', bloodSupply: 'Superior and inferior gluteal arteries' },
    note: 'Key landmark of the gluteal region; compression of the sciatic nerve by piriformis causes “piriformis syndrome”.',
  },
  {
    id: 'tensor-fasciae-latae', en: 'Tensor fasciae latae', lat: 'musculus tensor fasciae latae', layer: L1, region: 'lower-limb',
    parts: [['s', [0.125, 0.99, 0.062], [0.148, 0.83, 0.025], 0.012, 0.008, [1, 0, 0.6]], ['t', [[0.148, 0.83, 0.025], [0.15, 0.68, 0.01], [0.135, 0.5, 0.0]], 0.003]],
    facts: { origin: 'Anterior superior iliac spine and anterior iliac crest', insertion: 'Iliotibial tract (to the lateral condyle of the tibia)', action: 'Abducts, medially rotates and flexes the hip; stabilises the extended knee', innervation: 'Superior gluteal nerve (L4–S1)', bloodSupply: 'Superior gluteal and lateral circumflex femoral arteries' },
  },
  // ---------------- Thigh ----------------
  {
    id: 'sartorius', en: 'Sartorius', lat: 'musculus sartorius', layer: L1, region: 'lower-limb',
    parts: [['t', [[0.12, 0.995, 0.07], [0.1, 0.85, 0.075], [0.07, 0.7, 0.06], [0.06, 0.57, 0.03], [0.075, 0.465, 0.025]], 0.0075]],
    facts: { origin: 'Anterior superior iliac spine', insertion: 'Superior medial surface of the tibia (pes anserinus)', action: 'Flexes, abducts and laterally rotates the hip; flexes the knee', innervation: 'Femoral nerve (L2–L3)', bloodSupply: 'Femoral artery muscular branches' },
    note: 'The longest muscle in the body; forms the lateral border of the femoral triangle and the roof of the adductor canal.',
  },
  {
    id: 'rectus-femoris', en: 'Rectus femoris', lat: 'musculus rectus femoris', layer: L1, region: 'lower-limb',
    parts: [['s', [0.105, 0.95, 0.062], [0.097, 0.535, 0.052], 0.022, 0.018, [0, 0, 1]]],
    facts: { origin: 'Anterior inferior iliac spine and ilium above the acetabulum', insertion: 'Base of the patella; via patellar ligament to the tibial tuberosity', action: 'Extends the knee and flexes the hip', innervation: 'Femoral nerve (L2–L4)', bloodSupply: 'Lateral circumflex femoral artery' },
    note: 'The patellar (knee-jerk) reflex tests L3–L4.',
  },
  {
    id: 'vastus-lateralis', en: 'Vastus lateralis', lat: 'musculus vastus lateralis', layer: L1, region: 'lower-limb',
    parts: [['s', [0.148, 0.88, 0.008], [0.116, 0.54, 0.038], 0.024, 0.018, [1, 0, 0.4]]],
    facts: { origin: 'Greater trochanter and lateral lip of the linea aspera', insertion: 'Lateral base of the patella (quadriceps tendon)', action: 'Extends the knee', innervation: 'Femoral nerve (L2–L4)', bloodSupply: 'Lateral circumflex femoral artery' },
    note: 'Its mid-anterolateral thigh is a recommended site for intramuscular injection in infants.',
  },
  {
    id: 'vastus-medialis', en: 'Vastus medialis', lat: 'musculus vastus medialis', layer: L1, region: 'lower-limb',
    parts: [['s', [0.1, 0.78, 0.02], [0.076, 0.53, 0.042], 0.02, 0.018, [-1, 0, 0.5], 0.7]],
    facts: { origin: 'Intertrochanteric line and medial lip of the linea aspera', insertion: 'Medial base of the patella (quadriceps tendon)', action: 'Extends the knee; its oblique fibres stabilise the patella medially', innervation: 'Femoral nerve (L2–L4)', bloodSupply: 'Femoral and profunda femoris arteries' },
  },
  {
    id: 'vastus-intermedius', en: 'Vastus intermedius', lat: 'musculus vastus intermedius', layer: L2, region: 'lower-limb',
    parts: [['s', [0.126, 0.86, 0.028], [0.1, 0.56, 0.032], 0.018, 0.012, [0, 0, 1]]],
    facts: { origin: 'Anterior and lateral surfaces of the femoral shaft', insertion: 'Base of the patella (quadriceps tendon)', action: 'Extends the knee', innervation: 'Femoral nerve (L2–L4)', bloodSupply: 'Lateral circumflex femoral artery' },
  },
  {
    id: 'adductor-longus', en: 'Adductor longus', lat: 'musculus adductor longus', layer: L1, region: 'lower-limb',
    parts: [['s', [0.03, 0.9, 0.072], [0.1, 0.72, 0.005], 0.014, 0.008, [-0.6, 0, 1], 0.4]],
    facts: { origin: 'Body of the pubis below the pubic crest', insertion: 'Middle third of the linea aspera', action: 'Adducts and flexes the hip', innervation: 'Obturator nerve, anterior division (L2–L4)', bloodSupply: 'Profunda femoris and obturator arteries' },
    note: 'A common site of “groin strain” in athletes; forms the medial border of the femoral triangle.',
  },
  {
    id: 'adductor-magnus', en: 'Adductor magnus', lat: 'musculus adductor magnus', layer: L2, region: 'lower-limb',
    parts: [['f', [[0.035, 0.87, 0.02], [0.05, 0.855, -0.02]], [[0.1, 0.65, -0.005], [0.075, 0.55, -0.005]], 0.02, 0.012, [-1, 0, 0]]],
    facts: { origin: 'Inferior pubic ramus, ischial ramus and ischial tuberosity', insertion: 'Gluteal tuberosity, linea aspera and adductor tubercle of the femur', action: 'Adducts the hip; adductor part flexes, hamstring part extends', innervation: 'Obturator nerve (adductor part); tibial division of sciatic nerve (hamstring part)', bloodSupply: 'Profunda femoris, obturator and femoral arteries' },
  },
  {
    id: 'gracilis', en: 'Gracilis', lat: 'musculus gracilis', layer: L1, region: 'lower-limb',
    parts: [['t', [[0.02, 0.89, 0.06], [0.045, 0.75, 0.025], [0.06, 0.58, -0.005], [0.072, 0.47, 0.01]], 0.0065]],
    facts: { origin: 'Body and inferior ramus of the pubis', insertion: 'Superior medial surface of the tibia (pes anserinus)', action: 'Adducts the hip; flexes and medially rotates the knee', innervation: 'Obturator nerve (L2–L3)', bloodSupply: 'Profunda femoris and medial circumflex femoral arteries' },
    note: 'Frequently harvested as a free muscle flap or tendon graft (e.g. ACL reconstruction).',
  },
  {
    id: 'pectineus', en: 'Pectineus', lat: 'musculus pectineus', layer: L2, region: 'lower-limb',
    parts: [['s', [0.045, 0.915, 0.072], [0.112, 0.86, 0.02], 0.012, 0.006, [-0.3, 0, 1]]],
    facts: { origin: 'Pectineal line (superior ramus) of the pubis', insertion: 'Pectineal line of the femur below the lesser trochanter', action: 'Adducts and flexes the hip', innervation: 'Femoral nerve (L2–L3), occasionally obturator nerve', bloodSupply: 'Medial circumflex femoral and obturator arteries' },
  },
  {
    id: 'biceps-femoris', en: 'Biceps femoris', lat: 'musculus biceps femoris', layer: L1, region: 'lower-limb',
    parts: [['s', [0.06, 0.848, -0.046], [0.128, 0.47, -0.02], 0.02, 0.016, [0.3, 0, -1]]],
    facts: { origin: 'Long head: ischial tuberosity; short head: lateral lip of the linea aspera', insertion: 'Head of the fibula', action: 'Flexes the knee, extends the hip (long head), laterally rotates the flexed knee', innervation: 'Long head: tibial division; short head: common fibular division of the sciatic nerve (L5–S2)', bloodSupply: 'Perforating branches of the profunda femoris artery' },
    note: 'Hamstring strains commonly involve the long head of biceps femoris in sprinting.',
  },
  {
    id: 'semitendinosus', en: 'Semitendinosus', lat: 'musculus semitendinosus', layer: L1, region: 'lower-limb',
    parts: [['s', [0.055, 0.85, -0.044], [0.07, 0.6, -0.035], 0.016, 0.014, [0, 0, -1], 0.45], ['t', [[0.07, 0.6, -0.035], [0.065, 0.5, -0.02], [0.075, 0.465, 0.01]], 0.0035]],
    facts: { origin: 'Ischial tuberosity', insertion: 'Superior medial surface of the tibia (pes anserinus)', action: 'Flexes the knee, extends the hip, medially rotates the flexed knee', innervation: 'Tibial division of the sciatic nerve (L5–S2)', bloodSupply: 'Perforating branches of the profunda femoris artery' },
  },
  {
    id: 'semimembranosus', en: 'Semimembranosus', lat: 'musculus semimembranosus', layer: L2, region: 'lower-limb',
    parts: [['s', [0.06, 0.845, -0.034], [0.07, 0.49, -0.022], 0.018, 0.013, [0, 0, -1], 0.65]],
    facts: { origin: 'Ischial tuberosity', insertion: 'Posterior part of the medial condyle of the tibia', action: 'Flexes the knee, extends the hip, medially rotates the flexed knee', innervation: 'Tibial division of the sciatic nerve (L5–S2)', bloodSupply: 'Perforating branches of the profunda femoris artery' },
  },
  // ---------------- Leg & foot ----------------
  {
    id: 'gastrocnemius', en: 'Gastrocnemius', lat: 'musculus gastrocnemius', layer: L1, region: 'lower-limb',
    parts: [
      ['s', [0.074, 0.51, -0.03], [0.092, 0.25, -0.06], 0.017, 0.018, [-0.3, 0, -1], 0.35],
      ['s', [0.118, 0.51, -0.03], [0.102, 0.27, -0.058], 0.015, 0.016, [0.3, 0, -1], 0.35],
      ['t', [[0.097, 0.26, -0.058], [0.1, 0.15, -0.055], [0.102, 0.06, -0.075]], 0.005],
    ],
    facts: { origin: 'Medial head: medial femoral condyle; lateral head: lateral femoral condyle', insertion: 'Posterior surface of the calcaneus via the calcaneal (Achilles) tendon', action: 'Plantarflexes the ankle; flexes the knee', innervation: 'Tibial nerve (S1–S2)', bloodSupply: 'Sural arteries (popliteal artery)' },
    note: 'The ankle-jerk reflex tests S1; a positive Thompson (calf-squeeze) test indicates Achilles tendon rupture.',
  },
  {
    id: 'soleus', en: 'Soleus', lat: 'musculus soleus', layer: L2, region: 'lower-limb',
    parts: [['s', [0.104, 0.43, -0.032], [0.1, 0.12, -0.058], 0.026, 0.014, [0, 0, -1], 0.45]],
    facts: { origin: 'Posterior head of the fibula, soleal line of the tibia', insertion: 'Calcaneus via the calcaneal tendon', action: 'Plantarflexes the ankle; maintains standing posture', innervation: 'Tibial nerve (S1–S2)', bloodSupply: 'Posterior tibial, fibular and sural arteries' },
    note: 'Its venous sinuses form the “calf muscle pump”; immobility promotes deep-vein thrombosis here.',
  },
  {
    id: 'popliteus', en: 'Popliteus', lat: 'musculus popliteus', layer: L2, region: 'lower-limb',
    parts: [['s', [0.12, 0.5, -0.022], [0.078, 0.44, -0.024], 0.01, 0.005, [0, 0, -1]]],
    facts: { origin: 'Lateral femoral condyle and lateral meniscus', insertion: 'Posterior surface of the tibia above the soleal line', action: 'Unlocks the extended knee (laterally rotates the femur on the fixed tibia)', innervation: 'Tibial nerve (L4–S1)', bloodSupply: 'Inferior medial and lateral genicular arteries' },
  },
  {
    id: 'tibialis-anterior', en: 'Tibialis anterior', lat: 'musculus tibialis anterior', layer: L1, region: 'lower-limb',
    parts: [['s', [0.112, 0.46, 0.035], [0.098, 0.14, 0.03], 0.013, 0.011, [0.3, 0, 1], 0.35], ['t', [[0.098, 0.14, 0.03], [0.09, 0.08, 0.035], [0.08, 0.048, 0.055]], 0.0035]],
    facts: { origin: 'Lateral condyle and upper half of the lateral surface of the tibia, interosseous membrane', insertion: 'Medial cuneiform and base of the 1st metatarsal', action: 'Dorsiflexes and inverts the foot', innervation: 'Deep fibular nerve (L4–L5)', bloodSupply: 'Anterior tibial artery' },
    note: 'Paralysis (common fibular nerve injury) causes foot drop with a high-stepping gait.',
  },
  {
    id: 'extensor-digitorum-longus', en: 'Extensor digitorum longus', lat: 'musculus extensor digitorum longus', layer: L1, region: 'lower-limb',
    parts: [['s', [0.126, 0.46, 0.02], [0.114, 0.12, 0.03], 0.009, 0.008, [0.6, 0, 1], 0.4], ['t', [[0.114, 0.12, 0.03], [0.108, 0.07, 0.04], [0.11, 0.04, 0.085]], 0.003]],
    facts: { origin: 'Lateral condyle of the tibia, upper three-quarters of the anterior fibula, interosseous membrane', insertion: 'Middle and distal phalanges of toes 2–5', action: 'Extends toes 2–5 and dorsiflexes the ankle', innervation: 'Deep fibular nerve (L5–S1)', bloodSupply: 'Anterior tibial artery' },
  },
  {
    id: 'extensor-hallucis-longus', en: 'Extensor hallucis longus', lat: 'musculus extensor hallucis longus', layer: L2, region: 'lower-limb',
    parts: [['s', [0.118, 0.32, 0.025], [0.1, 0.11, 0.035], 0.007, 0.006, [0, 0, 1]], ['t', [[0.1, 0.11, 0.035], [0.088, 0.06, 0.05], [0.074, 0.025, 0.14]], 0.0028]],
    facts: { origin: 'Middle part of the anterior fibula and interosseous membrane', insertion: 'Base of the distal phalanx of the great toe', action: 'Extends the great toe and dorsiflexes the ankle', innervation: 'Deep fibular nerve (L5)', bloodSupply: 'Anterior tibial artery' },
    note: 'Weak great-toe extension is a sensitive sign of an L5 root lesion.',
  },
  {
    id: 'fibularis-longus', en: 'Fibularis longus', lat: 'musculus fibularis longus', layer: L1, region: 'lower-limb',
    parts: [['s', [0.132, 0.46, -0.01], [0.133, 0.2, -0.018], 0.011, 0.009, [1, 0, 0], 0.4], ['t', [[0.133, 0.2, -0.018], [0.135, 0.09, -0.03], [0.13, 0.045, 0.0]], 0.003]],
    facts: { origin: 'Head and upper two-thirds of the lateral surface of the fibula', insertion: 'Base of the 1st metatarsal and medial cuneiform', action: 'Everts and weakly plantarflexes the foot; supports the transverse arch', innervation: 'Superficial fibular nerve (L5–S2)', bloodSupply: 'Anterior tibial and fibular arteries' },
  },
  {
    id: 'fibularis-brevis', en: 'Fibularis brevis', lat: 'musculus fibularis brevis', layer: L2, region: 'lower-limb',
    parts: [['s', [0.13, 0.3, -0.012], [0.132, 0.1, -0.026], 0.009, 0.007, [1, 0, 0], 0.4]],
    facts: { origin: 'Lower two-thirds of the lateral surface of the fibula', insertion: 'Tuberosity of the base of the 5th metatarsal', action: 'Everts the foot', innervation: 'Superficial fibular nerve (L5–S2)', bloodSupply: 'Fibular artery' },
  },
  {
    id: 'tibialis-posterior', en: 'Tibialis posterior', lat: 'musculus tibialis posterior', layer: L2, region: 'lower-limb',
    parts: [['s', [0.102, 0.42, -0.025], [0.09, 0.14, -0.03], 0.011, 0.008, [0, 0, -1]], ['t', [[0.09, 0.14, -0.03], [0.074, 0.075, -0.022], [0.084, 0.055, 0.025]], 0.003]],
    facts: { origin: 'Interosseous membrane and posterior surfaces of the tibia and fibula', insertion: 'Tuberosity of the navicular, cuneiforms, cuboid and bases of metatarsals 2–4', action: 'Plantarflexes and inverts the foot; supports the medial longitudinal arch', innervation: 'Tibial nerve (L4–L5)', bloodSupply: 'Posterior tibial artery' },
    note: 'Tibialis posterior tendon dysfunction is the most common cause of adult-acquired flatfoot.',
  },
  {
    id: 'abductor-hallucis', en: 'Abductor hallucis', lat: 'musculus abductor hallucis', layer: L1, region: 'lower-limb',
    parts: [['s', [0.083, 0.022, -0.045], [0.07, 0.016, 0.112], 0.009, 0.007, [-1, -0.3, 0]]],
    facts: { origin: 'Medial process of the calcaneal tuberosity, flexor retinaculum, plantar aponeurosis', insertion: 'Medial base of the proximal phalanx of the great toe', action: 'Abducts and flexes the great toe', innervation: 'Medial plantar nerve (S2–S3)', bloodSupply: 'Medial plantar artery' },
  },
  {
    id: 'flexor-digitorum-brevis', en: 'Flexor digitorum brevis', lat: 'musculus flexor digitorum brevis', layer: L2, region: 'lower-limb',
    parts: [['s', [0.102, 0.012, -0.045], [0.107, 0.01, 0.108], 0.012, 0.005, [0, -1, 0]]],
    facts: { origin: 'Medial process of the calcaneal tuberosity, plantar aponeurosis', insertion: 'Middle phalanges of toes 2–5', action: 'Flexes toes 2–5', innervation: 'Medial plantar nerve (S2–S3)', bloodSupply: 'Medial and lateral plantar arteries' },
  },
];

/** Midline muscles (not mirrored). */
const MIDLINE: MuscleSpec[] = [
  {
    id: 'orbicularis-oris', en: 'Orbicularis oris', lat: 'musculus orbicularis oris', layer: L1, region: 'head-neck',
    parts: [['ring', [0, 1.585, 0.083], 0.02, 0.0045, [0.15, 0, 0], [1, 0.55, 1]]],
    facts: { origin: 'Maxilla, mandible and modiolus; fibres of surrounding facial muscles', insertion: 'Skin and mucous membrane of the lips', action: 'Closes and protrudes the lips (whistling, kissing)', innervation: 'Buccal and marginal mandibular branches of the facial nerve', bloodSupply: 'Superior and inferior labial arteries (facial artery)' },
  },
];

function buildPart(p: Part, s: number): THREE.BufferGeometry {
  const P = (q: V3) => sx(q, s);
  switch (p[0]) {
    case 's':
      return spindle(P(p[1]), P(p[2]), p[3], p[4], P(p[5] ?? [0, 0, 1]), { belly: p[6] });
    case 'f': {
      const ins = Array.isArray((p[2] as V3[])[0]) ? (p[2] as V3[]).map(P) : P(p[2] as V3);
      return fan(p[1].map(P), ins, p[3], p[4], P(p[5] ?? [0, 0, 1]));
    }
    case 't':
      return tube(p[1].map(P), (t) => p[2] * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.05))));
    case 'ft':
      return merge(
        p[1].map((o, i) =>
          tube([P(o), P(p[2][i]), P(lerp3(p[2][i], p[3], 0.6)), P(p[3])], (t) => p[4] * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.85))), { radial: 6 }),
        ),
      );
    case 'ring':
      return ring(P(p[1]), p[2], p[3], [p[4]?.[0] ?? 0, (p[4]?.[1] ?? 0) * s, (p[4]?.[2] ?? 0) * s], p[5]);
  }
}

function toDef(m: MuscleSpec, side: 'left' | 'right' | 'midline', s: number, tag: string): StructureDef {
  return makeDef({
    id: tag ? `${m.id}-${tag}` : m.id,
    nameEn: m.en,
    nameLatin: m.lat,
    system: 'muscular',
    kind: 'muscle',
    region: m.region,
    layer: m.layer,
    side,
    overview:
      m.overview ??
      `${m.layer === 1 ? 'Superficial' : 'Deep'} muscle of the ${m.region.replace('-', ' ')}. ${m.facts.action ? `Main action: ${m.facts.action.charAt(0).toLowerCase()}${m.facts.action.slice(1)}.` : ''}`,
    clinicalNote: m.note,
    facts: m.facts,
    build: () => (m.parts.length === 1 ? buildPart(m.parts[0], s) : merge(m.parts.map((p) => buildPart(p, s)))),
  });
}

export function buildMuscular(): StructureDef[] {
  const out: StructureDef[] = [];
  for (const { s, side, tag } of SIDES) for (const m of MUSCLES) out.push(toDef(m, side, s, tag));
  for (const m of MIDLINE) out.push(toDef(m, 'midline', 1, ''));

  // Intercostal muscles: a ribbon between each pair of adjacent ribs (11 spaces × 2 layers × 2 sides)
  for (const { s, side, tag } of SIDES) {
    for (let i = 0; i < 11; i++) {
      const upper = ribCurve(i, s);
      const lower = ribCurve(i + 1, s).slice(0, i >= 10 ? 5 : 6);
      const n = i + 1;
      for (const [kind, lat, inset, layer, facts] of [
        ['External', 'externus', 0.08, L2, { origin: `Lower border of rib ${n}`, insertion: `Upper border of rib ${n + 1}`, action: 'Elevate the ribs during forced inspiration', innervation: `Intercostal nerve T${n}`, bloodSupply: `Posterior and anterior intercostal arteries of space ${n}` }],
        ['Internal', 'internus', 0.2, L2, { origin: `Costal groove of rib ${n}`, insertion: `Upper border of rib ${n + 1}`, action: 'Depress the ribs during forced expiration (interosseous part)', innervation: `Intercostal nerve T${n}`, bloodSupply: `Posterior and anterior intercostal arteries of space ${n}` }],
      ] as const) {
        out.push(
          makeDef({
            id: `${kind.toLowerCase()}-intercostal-${n}-${tag}`,
            nameEn: `${kind} intercostal muscle (space ${n})`,
            nameLatin: `musculus intercostalis ${lat} ${n}`,
            system: 'muscular',
            kind: 'muscle',
            region: 'thorax',
            layer,
            side,
            overview: `${kind} intercostal muscle filling the ${n}${['st', 'nd', 'rd'][n - 1] ?? 'th'} intercostal space.`,
            clinicalNote: 'Intercostal nerve blocks are placed at the angle of the rib, just below the inferior border.',
            facts,
            build: () => {
              const shrink = kind === 'Internal' ? 0.985 : 1.0;
              const scaleIn = (pts: V3[]) => pts.map((p) => [p[0] * shrink, p[1], p[2] * shrink] as V3);
              return ribbon(scaleIn(upper), scaleIn(lower), 24, inset);
            },
          }),
        );
      }
    }
  }
  return out;
}
