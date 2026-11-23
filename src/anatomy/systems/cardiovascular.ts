/**
 * Cardiovascular system: heart, great vessels, main arteries & veins of head, trunk and limbs,
 * palmar/digital arteries and the posterior intercostal arteries and veins.
 */
import * as THREE from 'three';
import type { Facts, RegionId, StructureDef, StructureKind } from '../../types';
import { makeDef, SIDES } from '../def';
import { LM, SPINE } from '../landmarks';
import { blob, merge, sx, tube, type V3 } from '../geometry';
import { ribCurve } from './skeletal';

interface VesselSpec {
  id: string;
  en: string;
  lat: string;
  kind: 'artery' | 'vein';
  region: RegionId;
  pts: V3[];
  r: number | [number, number];
  facts: Facts;
  overview?: string;
  note?: string;
  /** paired = mirrored to both sides (default true) */
  paired?: boolean;
  /** only one side (e.g. brachiocephalic trunk on the right) */
  only?: 'left' | 'right';
}

const A = 'artery' as const;
const Vn = 'vein' as const;

/** Paired / unpaired vessels, LEFT-side coordinates. */
const VESSELS: VesselSpec[] = [
  // ---- great vessels (midline) ----
  { id: 'ascending-aorta', en: 'Ascending aorta', lat: 'aorta ascendens', kind: A, region: 'thorax', paired: false, r: 0.0125, pts: [[0.008, 1.315, 0.045], [0.0, 1.36, 0.055], [-0.004, 1.395, 0.045]], facts: { origin: 'Aortic orifice of the left ventricle', branches: 'Right and left coronary arteries', supplies: 'The heart (via the coronary arteries)' }, note: 'Aortic dissection most often begins in the ascending aorta — tearing chest pain radiating to the back.' },
  { id: 'aortic-arch', en: 'Arch of aorta', lat: 'arcus aortae', kind: A, region: 'thorax', paired: false, r: 0.0118, pts: [[-0.004, 1.395, 0.045], [0.0, 1.418, 0.025], [0.012, 1.415, -0.005], [0.022, 1.39, -0.03]], facts: { origin: 'Continuation of the ascending aorta at the sternal angle', branches: 'Brachiocephalic trunk, left common carotid and left subclavian arteries', supplies: 'Head, neck and upper limbs' }, note: 'The aortic knuckle on a chest X-ray; coarctation usually occurs just distal to the left subclavian artery.' },
  { id: 'thoracic-aorta', en: 'Thoracic (descending) aorta', lat: 'aorta thoracica', kind: A, region: 'thorax', paired: false, r: 0.0105, pts: [[0.022, 1.39, -0.03], [0.024, 1.33, -0.045], [0.02, 1.26, -0.04], [0.012, 1.2, -0.02]], facts: { origin: 'Continuation of the aortic arch at T4', branches: 'Posterior intercostal, bronchial, oesophageal and superior phrenic arteries', supplies: 'Thoracic wall and viscera' } },
  { id: 'abdominal-aorta', en: 'Abdominal aorta', lat: 'aorta abdominalis', kind: A, region: 'abdomen', paired: false, r: [0.0095, 0.0075], pts: [[0.012, 1.2, -0.02], [0.008, 1.15, -0.004], [0.005, 1.1, 0.0], [0.002, 1.06, 0.0]], facts: { origin: 'Aortic hiatus of the diaphragm (T12)', branches: 'Coeliac trunk, SMA, IMA, renal, gonadal, lumbar arteries; bifurcates at L4', supplies: 'Abdominal viscera, abdominal wall' }, note: 'Abdominal aortic aneurysm (>3 cm) presents as a pulsatile, expansile mass; screening by ultrasound.' },
  { id: 'pulmonary-trunk', en: 'Pulmonary trunk', lat: 'truncus pulmonalis', kind: A, region: 'thorax', paired: false, r: 0.0115, pts: [[0.025, 1.31, 0.07], [0.022, 1.345, 0.06], [0.012, 1.37, 0.035]], facts: { origin: 'Right ventricle (pulmonary valve)', branches: 'Right and left pulmonary arteries', supplies: 'Lungs (deoxygenated blood for gas exchange)' }, note: 'A saddle pulmonary embolus lodges at its bifurcation.' },
  { id: 'pulmonary-artery', en: 'Pulmonary artery', lat: 'arteria pulmonalis', kind: A, region: 'thorax', r: 0.008, pts: [[0.012, 1.37, 0.035], [0.04, 1.37, 0.01], [0.07, 1.355, -0.005]], facts: { origin: 'Pulmonary trunk', branches: 'Lobar and segmental arteries following the bronchi', supplies: 'Deoxygenated blood to the lung' } },
  { id: 'pulmonary-veins', en: 'Pulmonary veins', lat: 'venae pulmonales', kind: Vn, region: 'thorax', r: 0.006, pts: [[0.07, 1.33, -0.01], [0.04, 1.315, -0.005], [0.015, 1.31, 0.005]], facts: { drainage: 'Oxygenated blood from the lung', course: 'Two veins per side enter the left atrium' }, note: 'Ablation around the pulmonary vein ostia is a treatment for atrial fibrillation.' },
  { id: 'superior-vena-cava', en: 'Superior vena cava', lat: 'vena cava superior', kind: Vn, region: 'thorax', paired: false, r: 0.0105, pts: [[-0.022, 1.435, 0.035], [-0.026, 1.39, 0.04], [-0.026, 1.335, 0.04]], facts: { drainage: 'Head, neck, upper limbs and (via azygos) thoracic wall', course: 'Formed by the union of the brachiocephalic veins behind the right 1st costal cartilage; enters the right atrium' }, note: 'SVC obstruction (often by lung cancer) causes facial swelling and distended neck veins.' },
  { id: 'inferior-vena-cava', en: 'Inferior vena cava', lat: 'vena cava inferior', kind: Vn, region: 'abdomen', paired: false, r: 0.011, pts: [[-0.02, 1.055, 0.0], [-0.024, 1.12, -0.004], [-0.026, 1.19, -0.002], [-0.024, 1.25, 0.01], [-0.022, 1.285, 0.03]], facts: { drainage: 'Lower limbs, pelvis and abdomen', course: 'Formed at L5 by the common iliac veins; ascends right of the aorta and pierces the diaphragm at T8' }, note: 'Compression by the gravid uterus in the supine position causes hypotension — tilt the patient to the left.' },
  { id: 'azygos-vein', en: 'Azygos vein', lat: 'vena azygos', kind: Vn, region: 'thorax', paired: false, r: 0.004, pts: [[-0.012, 1.17, -0.035], [-0.016, 1.26, -0.06], [-0.015, 1.34, -0.07], [-0.02, 1.39, -0.03], [-0.026, 1.39, 0.03]], facts: { drainage: 'Posterior thoracic and abdominal walls (right posterior intercostal veins)', course: 'Ascends right of the vertebral bodies and arches over the right lung root into the SVC' } },
  { id: 'hemiazygos-vein', en: 'Hemiazygos vein', lat: 'vena hemiazygos', kind: Vn, region: 'thorax', paired: false, r: 0.003, pts: [[0.014, 1.17, -0.035], [0.016, 1.23, -0.055], [0.012, 1.28, -0.065], [-0.012, 1.3, -0.068]], facts: { drainage: 'Lower left posterior intercostal veins', course: 'Crosses behind the aorta at T8–T9 to join the azygos vein' } },
  // ---- arch branches ----
  { id: 'brachiocephalic-trunk', en: 'Brachiocephalic trunk', lat: 'truncus brachiocephalicus', kind: A, region: 'thorax', only: 'right', r: 0.0075, pts: [[0.0, 1.415, 0.028], [-0.012, 1.44, 0.03], [-0.02, 1.455, 0.028]], facts: { origin: 'First branch of the aortic arch', branches: 'Right subclavian and right common carotid arteries', supplies: 'Right side of the head, neck and right upper limb' } },
  { id: 'common-carotid-artery', en: 'Common carotid artery', lat: 'arteria carotis communis', kind: A, region: 'head-neck', r: 0.0055, pts: [[0.008, 1.418, 0.02], [0.02, 1.47, 0.025], [0.026, 1.53, 0.022], [0.027, 1.565, 0.02]], facts: { origin: 'Left: aortic arch; right: brachiocephalic trunk', branches: 'Internal and external carotid arteries (at C4 / upper border of thyroid cartilage)', supplies: 'Head and neck' }, note: 'The carotid pulse is palpated anterior to sternocleidomastoid; carotid bifurcation is a site of atheroma (stroke risk).' },
  { id: 'internal-carotid-artery', en: 'Internal carotid artery', lat: 'arteria carotis interna', kind: A, region: 'head-neck', r: 0.0042, pts: [[0.027, 1.565, 0.02], [0.03, 1.6, 0.005], [0.026, 1.628, 0.0], [0.02, 1.652, 0.012], [0.012, 1.66, 0.02]], facts: { origin: 'Common carotid artery', branches: 'Ophthalmic, anterior & middle cerebral, posterior communicating arteries', supplies: 'Brain (anterior circulation) and eye' } },
  { id: 'external-carotid-artery', en: 'External carotid artery', lat: 'arteria carotis externa', kind: A, region: 'head-neck', r: 0.0036, pts: [[0.027, 1.565, 0.022], [0.038, 1.59, 0.02], [0.046, 1.615, 0.0], [0.05, 1.63, -0.005]], facts: { origin: 'Common carotid artery', branches: 'Superior thyroid, lingual, facial, occipital, posterior auricular, maxillary, superficial temporal', supplies: 'Face, scalp, neck, jaws' } },
  { id: 'facial-artery', en: 'Facial artery', lat: 'arteria facialis', kind: A, region: 'head-neck', r: 0.0018, pts: [[0.038, 1.585, 0.02], [0.045, 1.56, 0.04], [0.042, 1.57, 0.065], [0.03, 1.59, 0.08], [0.018, 1.635, 0.087]], facts: { origin: 'External carotid artery', branches: 'Labial arteries, angular artery', supplies: 'Face, lips, nose' }, note: 'Its pulse is felt where it crosses the lower border of the mandible in front of masseter.' },
  { id: 'superficial-temporal-artery', en: 'Superficial temporal artery', lat: 'arteria temporalis superficialis', kind: A, region: 'head-neck', r: 0.0017, pts: [[0.05, 1.63, -0.005], [0.066, 1.655, 0.0], [0.072, 1.7, 0.015], [0.065, 1.74, 0.03]], facts: { origin: 'Terminal branch of the external carotid artery', supplies: 'Scalp and temple' }, note: 'Tender, pulseless temporal artery in an older patient with headache suggests giant-cell arteritis — risk of blindness.' },
  { id: 'vertebral-artery', en: 'Vertebral artery', lat: 'arteria vertebralis', kind: A, region: 'head-neck', r: 0.0026, pts: [[0.04, 1.452, 0.01], [0.03, 1.49, -0.015], [0.026, 1.55, -0.025], [0.025, 1.595, -0.03], [0.012, 1.615, -0.03], [0.002, 1.632, -0.01]], facts: { origin: 'First part of the subclavian artery', branches: 'Posterior inferior cerebellar artery; unites with its partner to form the basilar artery', supplies: 'Brainstem, cerebellum, occipital lobes (posterior circulation)' }, note: 'Ascends through the transverse foramina of C6–C1; dissection can follow neck manipulation.' },
  { id: 'subclavian-artery', en: 'Subclavian artery', lat: 'arteria subclavia', kind: A, region: 'upper-limb', r: 0.0058, pts: [[0.014, 1.414, 0.0], [0.035, 1.45, 0.01], [0.07, 1.458, 0.02], [0.105, 1.445, 0.018], [0.13, 1.425, 0.01]], facts: { origin: 'Left: aortic arch; right: brachiocephalic trunk', branches: 'Vertebral, internal thoracic, thyrocervical and costocervical trunks', supplies: 'Upper limb, neck, brain (via vertebral), thoracic wall' } },
  { id: 'internal-thoracic-artery', en: 'Internal thoracic artery', lat: 'arteria thoracica interna', kind: A, region: 'thorax', r: 0.0022, pts: [[0.04, 1.45, 0.025], [0.03, 1.4, 0.075], [0.03, 1.32, 0.095], [0.035, 1.24, 0.1]], facts: { origin: 'Subclavian artery', branches: 'Anterior intercostal, musculophrenic and superior epigastric arteries', supplies: 'Anterior thoracic wall, breast' }, note: 'The left internal thoracic (mammary) artery is the graft of choice in coronary artery bypass surgery.' },
  // ---- upper limb ----
  { id: 'axillary-artery', en: 'Axillary artery', lat: 'arteria axillaris', kind: A, region: 'upper-limb', r: 0.0052, pts: [[0.13, 1.425, 0.01], [0.155, 1.405, 0.006], [0.178, 1.385, 0.0]], facts: { origin: 'Continuation of the subclavian artery at the lateral border of the 1st rib', branches: 'Superior thoracic, thoraco-acromial, lateral thoracic, subscapular, anterior & posterior circumflex humeral', supplies: 'Shoulder region, lateral chest wall' } },
  { id: 'brachial-artery', en: 'Brachial artery', lat: 'arteria brachialis', kind: A, region: 'upper-limb', r: 0.0042, pts: [[0.178, 1.385, 0.0], [0.2, 1.3, -0.004], [0.22, 1.21, -0.006], [0.248, 1.115, 0.0]], facts: { origin: 'Continuation of the axillary artery at the lower border of teres major', branches: 'Profunda brachii, ulnar collateral arteries; ends as radial and ulnar arteries', supplies: 'Arm' }, note: 'Auscultated in the cubital fossa when measuring blood pressure.' },
  { id: 'radial-artery', en: 'Radial artery', lat: 'arteria radialis', kind: A, region: 'upper-limb', r: 0.0028, pts: [[0.25, 1.11, 0.0], [0.28, 1.03, 0.008], [0.31, 0.94, 0.012], [0.33, 0.885, 0.014]], facts: { origin: 'Brachial artery in the cubital fossa', branches: 'Radial recurrent, superficial palmar branch; forms the deep palmar arch', supplies: 'Lateral forearm and hand' }, note: 'The radial pulse; perform an Allen test before arterial cannulation or blood-gas sampling.' },
  { id: 'ulnar-artery', en: 'Ulnar artery', lat: 'arteria ulnaris', kind: A, region: 'upper-limb', r: 0.003, pts: [[0.25, 1.11, 0.0], [0.262, 1.04, -0.012], [0.28, 0.95, -0.006], [0.294, 0.878, 0.006]], facts: { origin: 'Brachial artery in the cubital fossa', branches: 'Ulnar recurrent, common interosseous; forms the superficial palmar arch', supplies: 'Medial forearm and hand' } },
  { id: 'cephalic-vein', en: 'Cephalic vein', lat: 'vena cephalica', kind: Vn, region: 'upper-limb', r: 0.0026, pts: [[0.334, 0.885, 0.018], [0.31, 1.0, 0.022], [0.272, 1.115, 0.022], [0.235, 1.25, 0.022], [0.195, 1.37, 0.04], [0.16, 1.42, 0.04], [0.13, 1.43, 0.025]], facts: { drainage: 'Lateral (radial) side of the hand and forearm', course: 'Ascends laterally, through the deltopectoral groove, into the axillary vein' }, note: 'A reliable vein for cannulation at the wrist (“houseman’s vein”).' },
  { id: 'basilic-vein', en: 'Basilic vein', lat: 'vena basilica', kind: Vn, region: 'upper-limb', r: 0.0028, pts: [[0.29, 0.88, 0.006], [0.258, 1.01, -0.006], [0.228, 1.12, 0.004], [0.205, 1.24, -0.004], [0.185, 1.38, 0.01]], facts: { drainage: 'Medial (ulnar) side of the hand and forearm', course: 'Ascends medially, pierces the deep fascia mid-arm, joins the brachial veins to form the axillary vein' }, note: 'Commonly used for PICC line insertion.' },
  { id: 'median-cubital-vein', en: 'Median cubital vein', lat: 'vena mediana cubiti', kind: Vn, region: 'upper-limb', r: 0.0022, pts: [[0.268, 1.105, 0.022], [0.25, 1.11, 0.022], [0.23, 1.12, 0.012]], facts: { drainage: 'Connects the cephalic and basilic veins', course: 'Crosses the cubital fossa superficial to the bicipital aponeurosis' }, note: 'The usual site for venepuncture — the bicipital aponeurosis protects the brachial artery and median nerve.' },
  { id: 'axillary-vein', en: 'Axillary vein', lat: 'vena axillaris', kind: Vn, region: 'upper-limb', r: 0.0055, pts: [[0.185, 1.38, 0.01], [0.155, 1.408, 0.018], [0.13, 1.428, 0.022]], facts: { drainage: 'Upper limb, axilla, lateral thoracic wall', course: 'Continuation of the basilic vein; becomes the subclavian vein at the 1st rib' } },
  { id: 'subclavian-vein', en: 'Subclavian vein', lat: 'vena subclavia', kind: Vn, region: 'thorax', r: 0.0058, pts: [[0.13, 1.428, 0.022], [0.09, 1.447, 0.04], [0.045, 1.455, 0.038]], facts: { drainage: 'Upper limb (via axillary vein) and external jugular vein', course: 'Passes in front of scalenus anterior and joins the internal jugular to form the brachiocephalic vein' }, note: 'Central venous catheters are placed here; pneumothorax is a recognised complication.' },
  { id: 'brachiocephalic-vein', en: 'Brachiocephalic vein', lat: 'vena brachiocephalica', kind: Vn, region: 'thorax', r: 0.0075, pts: [[0.045, 1.455, 0.038], [0.02, 1.445, 0.045], [-0.005, 1.44, 0.042], [-0.022, 1.435, 0.035]], facts: { drainage: 'Head, neck and upper limb', course: 'The left vein is longer and crosses behind the manubrium to join the right and form the SVC' } },
  { id: 'internal-jugular-vein', en: 'Internal jugular vein', lat: 'vena jugularis interna', kind: Vn, region: 'head-neck', r: 0.0065, pts: [[0.032, 1.612, -0.012], [0.035, 1.57, 0.008], [0.04, 1.51, 0.025], [0.045, 1.455, 0.038]], facts: { drainage: 'Brain (via dural sinuses), face and neck', course: 'Descends in the carotid sheath lateral to the carotid artery' }, note: 'The jugular venous pressure (JVP) is assessed in the right IJV; also a common site for central lines.' },
  { id: 'external-jugular-vein', en: 'External jugular vein', lat: 'vena jugularis externa', kind: Vn, region: 'head-neck', r: 0.0028, pts: [[0.056, 1.6, -0.005], [0.054, 1.54, 0.008], [0.06, 1.48, 0.022], [0.07, 1.455, 0.035]], facts: { drainage: 'Scalp and face', course: 'Crosses sternocleidomastoid superficially to join the subclavian vein' }, note: 'Visible distension when the patient lies flat or performs a Valsalva manoeuvre.' },
  // ---- abdominal branches ----
  { id: 'coeliac-trunk', en: 'Coeliac trunk', lat: 'truncus coeliacus', kind: A, region: 'abdomen', paired: false, r: 0.0042, pts: [[0.01, 1.175, -0.012], [0.01, 1.172, 0.015], [0.008, 1.17, 0.03]], facts: { origin: 'Abdominal aorta at T12', branches: 'Left gastric, splenic and common hepatic arteries', supplies: 'Foregut: stomach, liver, spleen, pancreas, proximal duodenum' } },
  { id: 'splenic-artery', en: 'Splenic artery', lat: 'arteria splenica', kind: A, region: 'abdomen', paired: false, r: 0.0028, pts: [[0.008, 1.17, 0.03], [0.04, 1.165, 0.005], [0.07, 1.17, -0.01], [0.092, 1.17, -0.03]], facts: { origin: 'Coeliac trunk', branches: 'Pancreatic, short gastric, left gastro-omental arteries', supplies: 'Spleen, pancreas, stomach' } },
  { id: 'common-hepatic-artery', en: 'Common hepatic artery', lat: 'arteria hepatica communis', kind: A, region: 'abdomen', paired: false, r: 0.0028, pts: [[0.008, 1.17, 0.03], [-0.02, 1.168, 0.035], [-0.04, 1.175, 0.035]], facts: { origin: 'Coeliac trunk', branches: 'Proper hepatic, gastroduodenal, right gastric arteries', supplies: 'Liver, gallbladder, stomach, duodenum' } },
  { id: 'superior-mesenteric-artery', en: 'Superior mesenteric artery', lat: 'arteria mesenterica superior', kind: A, region: 'abdomen', paired: false, r: 0.0042, pts: [[0.008, 1.155, -0.006], [0.008, 1.14, 0.03], [0.0, 1.08, 0.055], [-0.03, 1.0, 0.055]], facts: { origin: 'Abdominal aorta at L1', branches: 'Inferior pancreaticoduodenal, jejunal, ileal, ileocolic, right & middle colic arteries', supplies: 'Midgut: distal duodenum to the proximal ⅔ of the transverse colon' }, note: 'Acute mesenteric ischaemia: severe pain out of proportion to examination findings.' },
  { id: 'inferior-mesenteric-artery', en: 'Inferior mesenteric artery', lat: 'arteria mesenterica inferior', kind: A, region: 'abdomen', paired: false, r: 0.0028, pts: [[0.004, 1.09, 0.004], [0.02, 1.06, 0.02], [0.04, 1.02, 0.03], [0.04, 0.97, 0.03]], facts: { origin: 'Abdominal aorta at L3', branches: 'Left colic, sigmoid and superior rectal arteries', supplies: 'Hindgut: distal ⅓ transverse colon to upper rectum' } },
  { id: 'renal-artery', en: 'Renal artery', lat: 'arteria renalis', kind: A, region: 'abdomen', r: 0.0038, pts: [[0.007, 1.135, -0.006], [0.03, 1.135, -0.015], [0.048, 1.135, -0.025]], facts: { origin: 'Abdominal aorta at L1/L2', branches: 'Segmental arteries; inferior suprarenal artery', supplies: 'Kidney, ureter, suprarenal gland' }, note: 'Renal artery stenosis causes secondary hypertension; ACE inhibitors may precipitate renal failure if bilateral.' },
  { id: 'renal-vein', en: 'Renal vein', lat: 'vena renalis', kind: Vn, region: 'abdomen', r: 0.0042, pts: [[0.048, 1.13, -0.022], [0.02, 1.13, 0.008], [-0.018, 1.13, 0.004]], facts: { drainage: 'Kidney (left also receives the left gonadal and suprarenal veins)', course: 'The left vein crosses anterior to the aorta below the SMA' }, note: 'The left renal vein can be compressed between the aorta and SMA (nutcracker syndrome).' },
  { id: 'hepatic-portal-vein', en: 'Hepatic portal vein', lat: 'vena portae hepatis', kind: Vn, region: 'abdomen', paired: false, r: 0.0065, pts: [[0.01, 1.115, 0.03], [-0.015, 1.14, 0.035], [-0.035, 1.17, 0.035], [-0.045, 1.19, 0.03]], facts: { drainage: 'Gastrointestinal tract, spleen, pancreas, gallbladder → liver', course: 'Formed behind the neck of the pancreas by the superior mesenteric and splenic veins' }, note: 'Portal hypertension (e.g. cirrhosis) opens porto-systemic anastomoses: oesophageal varices, caput medusae, haemorrhoids.' },
  { id: 'splenic-vein', en: 'Splenic vein', lat: 'vena splenica', kind: Vn, region: 'abdomen', paired: false, r: 0.0035, pts: [[0.09, 1.165, -0.03], [0.06, 1.14, -0.005], [0.03, 1.12, 0.015], [0.01, 1.115, 0.03]], facts: { drainage: 'Spleen, pancreas, part of the stomach (and IMV)', course: 'Runs behind the pancreas to join the SMV' } },
  { id: 'superior-mesenteric-vein', en: 'Superior mesenteric vein', lat: 'vena mesenterica superior', kind: Vn, region: 'abdomen', paired: false, r: 0.004, pts: [[-0.035, 1.0, 0.06], [-0.005, 1.07, 0.06], [0.008, 1.1, 0.04], [0.01, 1.115, 0.03]], facts: { drainage: 'Small intestine, caecum, ascending and transverse colon', course: 'Right of the SMA in the root of the mesentery' } },
  // ---- pelvis & lower limb ----
  { id: 'common-iliac-artery', en: 'Common iliac artery', lat: 'arteria iliaca communis', kind: A, region: 'pelvis', r: 0.0058, pts: [[0.002, 1.06, 0.0], [0.03, 1.02, 0.004], [0.05, 0.985, 0.006]], facts: { origin: 'Bifurcation of the aorta at L4', branches: 'Internal and external iliac arteries', supplies: 'Pelvis and lower limb' } },
  { id: 'internal-iliac-artery', en: 'Internal iliac artery', lat: 'arteria iliaca interna', kind: A, region: 'pelvis', r: 0.0042, pts: [[0.05, 0.985, 0.006], [0.052, 0.96, -0.02], [0.05, 0.93, -0.035]], facts: { origin: 'Common iliac artery at the sacroiliac joint', branches: 'Gluteal, obturator, uterine/vesical, rectal, internal pudendal arteries', supplies: 'Pelvic viscera, perineum, gluteal region' } },
  { id: 'external-iliac-artery', en: 'External iliac artery', lat: 'arteria iliaca externa', kind: A, region: 'pelvis', r: 0.0048, pts: [[0.05, 0.985, 0.006], [0.065, 0.96, 0.03], [0.078, 0.935, 0.06]], facts: { origin: 'Common iliac artery', branches: 'Inferior epigastric and deep circumflex iliac arteries', supplies: 'Lower limb, anterior abdominal wall' } },
  { id: 'femoral-artery', en: 'Femoral artery', lat: 'arteria femoralis', kind: A, region: 'lower-limb', r: 0.0048, pts: [[0.078, 0.935, 0.066], [0.084, 0.88, 0.065], [0.08, 0.78, 0.05], [0.07, 0.66, 0.022], [0.078, 0.57, -0.026]], facts: { origin: 'Continuation of the external iliac artery under the inguinal ligament', branches: 'Superficial epigastric, profunda femoris, descending genicular', supplies: 'Thigh and (via popliteal) leg and foot' }, note: 'The femoral pulse is felt at the mid-inguinal point; common access for angiography.' },
  { id: 'profunda-femoris-artery', en: 'Profunda femoris artery', lat: 'arteria profunda femoris', kind: A, region: 'lower-limb', r: 0.0036, pts: [[0.084, 0.88, 0.062], [0.1, 0.83, 0.03], [0.11, 0.74, 0.0], [0.105, 0.64, -0.01]], facts: { origin: 'Femoral artery in the femoral triangle', branches: 'Medial & lateral circumflex femoral, perforating arteries', supplies: 'Thigh muscles, femoral head (via circumflex arteries)' } },
  { id: 'popliteal-artery', en: 'Popliteal artery', lat: 'arteria poplitea', kind: A, region: 'lower-limb', r: 0.0042, pts: [[0.078, 0.57, -0.026], [0.092, 0.51, -0.036], [0.1, 0.45, -0.03]], facts: { origin: 'Continuation of the femoral artery at the adductor hiatus', branches: 'Genicular arteries; anterior and posterior tibial arteries', supplies: 'Knee joint, leg, foot' }, note: 'A popliteal aneurysm is the commonest peripheral aneurysm — feel for an expansile pulse behind the knee.' },
  { id: 'anterior-tibial-artery', en: 'Anterior tibial artery', lat: 'arteria tibialis anterior', kind: A, region: 'lower-limb', r: 0.0028, pts: [[0.1, 0.45, -0.03], [0.112, 0.43, 0.008], [0.11, 0.3, 0.02], [0.1, 0.12, 0.03], [0.095, 0.08, 0.04]], facts: { origin: 'Popliteal artery', branches: 'Continues as the dorsalis pedis artery', supplies: 'Anterior compartment of the leg' } },
  { id: 'dorsalis-pedis-artery', en: 'Dorsalis pedis artery', lat: 'arteria dorsalis pedis', kind: A, region: 'lower-limb', r: 0.002, pts: [[0.095, 0.08, 0.04], [0.09, 0.06, 0.07], [0.085, 0.045, 0.1]], facts: { origin: 'Continuation of the anterior tibial artery at the ankle', branches: 'Arcuate artery, deep plantar artery', supplies: 'Dorsum of the foot' }, note: 'Palpated lateral to the extensor hallucis longus tendon; absent in ~10% of normal people.' },
  { id: 'posterior-tibial-artery', en: 'Posterior tibial artery', lat: 'arteria tibialis posterior', kind: A, region: 'lower-limb', r: 0.003, pts: [[0.1, 0.45, -0.03], [0.094, 0.3, -0.04], [0.082, 0.14, -0.035], [0.074, 0.08, -0.025], [0.085, 0.025, 0.02]], facts: { origin: 'Popliteal artery', branches: 'Fibular artery, medial and lateral plantar arteries', supplies: 'Posterior compartment of the leg, sole of the foot' }, note: 'Palpated behind the medial malleolus.' },
  { id: 'fibular-artery', en: 'Fibular artery', lat: 'arteria fibularis', kind: A, region: 'lower-limb', r: 0.0022, pts: [[0.098, 0.42, -0.034], [0.115, 0.3, -0.035], [0.12, 0.15, -0.03], [0.122, 0.08, -0.028]], facts: { origin: 'Posterior tibial artery', supplies: 'Lateral compartment muscles and the fibula' } },
  { id: 'common-iliac-vein', en: 'Common iliac vein', lat: 'vena iliaca communis', kind: Vn, region: 'pelvis', r: 0.0065, pts: [[0.05, 0.98, -0.002], [0.02, 1.03, -0.002], [-0.02, 1.055, 0.0]], facts: { drainage: 'Lower limb and pelvis', course: 'Unite at L5 to form the IVC; the left vein is crossed by the right common iliac artery' }, note: 'Compression of the left common iliac vein (May–Thurner syndrome) predisposes to left-sided DVT.' },
  { id: 'external-iliac-vein', en: 'External iliac vein', lat: 'vena iliaca externa', kind: Vn, region: 'pelvis', r: 0.0055, pts: [[0.068, 0.935, 0.06], [0.058, 0.96, 0.028], [0.05, 0.98, -0.002]], facts: { drainage: 'Lower limb (continuation of the femoral vein)' } },
  { id: 'femoral-vein', en: 'Femoral vein', lat: 'vena femoralis', kind: Vn, region: 'lower-limb', r: 0.0055, pts: [[0.07, 0.57, -0.03], [0.062, 0.66, 0.018], [0.07, 0.78, 0.048], [0.07, 0.88, 0.065], [0.068, 0.935, 0.06]], facts: { drainage: 'Deep structures of the thigh, leg and foot; great saphenous vein', course: 'Lies medial to the femoral artery in the femoral triangle' }, note: 'Femoral DVT may cause pulmonary embolism; femoral access for central lines is medial to the pulse.' },
  { id: 'popliteal-vein', en: 'Popliteal vein', lat: 'vena poplitea', kind: Vn, region: 'lower-limb', r: 0.0048, pts: [[0.104, 0.44, -0.04], [0.098, 0.5, -0.042], [0.085, 0.56, -0.036], [0.07, 0.57, -0.03]], facts: { drainage: 'Leg and foot (tibial veins, small saphenous vein)' } },
  { id: 'great-saphenous-vein', en: 'Great saphenous vein', lat: 'vena saphena magna', kind: Vn, region: 'lower-limb', r: 0.0028, pts: [[0.08, 0.04, 0.07], [0.072, 0.09, 0.022], [0.064, 0.3, 0.01], [0.058, 0.5, -0.03], [0.06, 0.65, 0.0], [0.065, 0.78, 0.05], [0.07, 0.885, 0.072]], facts: { drainage: 'Medial foot, leg and thigh', course: 'Anterior to the medial malleolus, behind the knee’s medial condyle, joins the femoral vein at the saphenous opening' }, note: 'The longest vein in the body; harvested for coronary bypass grafts; incompetence causes varicose veins.' },
  { id: 'small-saphenous-vein', en: 'Small saphenous vein', lat: 'vena saphena parva', kind: Vn, region: 'lower-limb', r: 0.0022, pts: [[0.135, 0.035, 0.03], [0.132, 0.065, -0.045], [0.11, 0.2, -0.07], [0.1, 0.38, -0.068], [0.1, 0.46, -0.046]], facts: { drainage: 'Lateral foot and posterior leg', course: 'Behind the lateral malleolus, up the calf to the popliteal vein' } },
  { id: 'posterior-tibial-vein', en: 'Posterior tibial veins', lat: 'venae tibiales posteriores', kind: Vn, region: 'lower-limb', r: 0.0026, pts: [[0.08, 0.04, 0.02], [0.08, 0.08, -0.03], [0.09, 0.14, -0.042], [0.098, 0.3, -0.046], [0.104, 0.44, -0.04]], facts: { drainage: 'Sole of the foot and posterior leg', course: 'Paired venae comitantes of the posterior tibial artery' }, note: 'Calf-vein DVT can propagate proximally into the popliteal and femoral veins.' },
];

function mk(v: VesselSpec, side: 'left' | 'right' | 'midline', s: number, tag: string): StructureDef {
  const r = v.r;
  return makeDef({
    id: tag ? `${v.id}-${tag}` : v.id,
    nameEn: v.en,
    nameLatin: v.lat,
    system: 'cardiovascular',
    kind: v.kind as StructureKind,
    region: v.region,
    layer: 3,
    side,
    overview: v.overview ?? `${v.kind === 'artery' ? 'Artery' : 'Vein'} of the ${v.region.replace('-', ' ')}.`,
    clinicalNote: v.note,
    facts: v.facts,
    build: () => tube(v.pts.map((p) => sx(p, s)), Array.isArray(r) ? (t) => r[0] + (r[1] - r[0]) * t : r, { radial: 10 }),
  });
}

export function buildCardiovascular(): StructureDef[] {
  const out: StructureDef[] = [];

  // ---- Heart ----
  out.push(
    makeDef({
      id: 'heart',
      nameEn: 'Heart',
      nameLatin: 'cor',
      taId: 'A12.1.00.001',
      system: 'cardiovascular',
      kind: 'organ',
      region: 'thorax',
      layer: 3,
      overview: 'Four-chambered muscular pump in the middle mediastinum, enclosed in the pericardium. Its apex lies in the left 5th intercostal space, mid-clavicular line.',
      clinicalNote: 'The apex beat is normally palpable in the left 5th intercostal space at the mid-clavicular line; displacement suggests cardiomegaly.',
      facts: {
        function: 'Pumps deoxygenated blood to the lungs (right heart) and oxygenated blood to the body (left heart)',
        bloodSupply: 'Right and left coronary arteries; venous drainage via the coronary sinus',
        innervation: 'Cardiac plexus (sympathetic T1–T4, parasympathetic vagus); intrinsic conduction system (SA & AV nodes)',
      },
      build: () =>
        blob([0.018, 1.3, 0.045], [0.055, 0.066, 0.046], {
          w: 36,
          h: 26,
          rotate: [0.25, 0.35, 0.75],
          noise: 0.03,
          seed: 3,
          // tapered apex and broader base
          deform: (d) => 1 - 0.28 * Math.max(0, -d.y) * Math.max(0, -d.y) + 0.06 * Math.max(0, d.y),
        }),
    }),
  );
  out.push(makeDef({ id: 'right-coronary-artery', nameEn: 'Right coronary artery', nameLatin: 'arteria coronaria dextra', system: 'cardiovascular', kind: 'artery', region: 'thorax', layer: 3, overview: 'Arises from the right aortic sinus and runs in the right atrioventricular groove.', facts: { origin: 'Right aortic sinus', branches: 'SA nodal (60%), right marginal, posterior interventricular (in right-dominant hearts)', supplies: 'Right atrium & ventricle, SA and AV nodes, inferior LV wall' }, clinicalNote: 'Occlusion causes an inferior myocardial infarction (ST elevation in II, III, aVF) and may cause heart block.', build: () => tube([[0.002, 1.33, 0.07], [-0.025, 1.31, 0.08], [-0.035, 1.27, 0.065], [-0.02, 1.24, 0.03]], 0.0022, { radial: 7 }) }));
  out.push(makeDef({ id: 'left-coronary-artery', nameEn: 'Left coronary artery', nameLatin: 'arteria coronaria sinistra', system: 'cardiovascular', kind: 'artery', region: 'thorax', layer: 3, overview: 'Arises from the left aortic sinus and divides into the anterior interventricular (LAD) and circumflex arteries.', facts: { origin: 'Left aortic sinus', branches: 'Anterior interventricular (LAD) and circumflex arteries', supplies: 'Left atrium, most of the left ventricle and the anterior ⅔ of the interventricular septum' }, clinicalNote: 'LAD occlusion — the “widow-maker” — produces an anterior STEMI (V1–V4).', build: () => merge([tube([[0.018, 1.335, 0.07], [0.035, 1.31, 0.085], [0.05, 1.27, 0.088], [0.065, 1.24, 0.075]], 0.0022, { radial: 7 }), tube([[0.035, 1.31, 0.085], [0.06, 1.3, 0.055], [0.07, 1.28, 0.02]], 0.0018, { radial: 7 })]) }));

  // ---- Paired & unpaired vessels ----
  for (const v of VESSELS) {
    if (v.paired === false) {
      out.push(mk(v, 'midline', 1, ''));
      continue;
    }
    for (const { s, side, tag } of SIDES) {
      if (v.only && v.only !== side) continue;
      // right-sided great vessels arise from the brachiocephalic trunk instead of the arch
      if (side === 'right' && (v.id === 'common-carotid-artery' || v.id === 'subclavian-artery')) {
        const pts = v.pts.map((p) => [...p] as V3);
        pts[0] = [0.02, 1.455, 0.028];
        out.push(mk({ ...v, pts }, side, s, tag));
      } else if (side === 'right' && v.id === 'brachiocephalic-vein') {
        out.push(mk({ ...v, pts: [[0.045, 1.455, 0.038], [0.03, 1.445, 0.038], [0.022, 1.435, 0.035]] }, side, s, tag));
      } else out.push(mk(v, side, s, tag));
    }
  }

  // ---- Palmar arches & digital arteries ----
  const Wr = new THREE.Vector3(...LM.wrist);
  const D = new THREE.Vector3(0.36, 0.68, 0.03).sub(Wr).normalize();
  const T = new THREE.Vector3(1, 0, 0).sub(D.clone().multiplyScalar(D.x)).normalize();
  const N = new THREE.Vector3().crossVectors(T, D).multiplyScalar(-1).normalize();
  const H = (d: number, t: number, n = 0): V3 => {
    const p = Wr.clone().addScaledVector(D, d).addScaledVector(T, t).addScaledVector(N, n);
    return [p.x, p.y, p.z];
  };
  const tips: [number, number][] = [[0.09, 0.055], [0.15, 0.022], [0.16, 0.004], [0.15, -0.012], [0.125, -0.026]];
  const digitNames = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
  for (const { s, side, tag } of SIDES) {
    const P = (q: V3) => sx(q, s);
    out.push(makeDef({ id: `superficial-palmar-arch-${tag}`, nameEn: 'Superficial palmar arch', nameLatin: 'arcus palmaris superficialis', system: 'cardiovascular', kind: 'artery', region: 'upper-limb', layer: 3, side, overview: 'Arterial arcade in the palm, formed mainly by the ulnar artery.', facts: { origin: 'Ulnar artery (completed by the superficial palmar branch of the radial artery)', branches: 'Common palmar digital arteries', supplies: 'Fingers' }, build: () => tube([P(H(0.0, -0.016, 0.008)), P(H(0.045, -0.016, 0.013)), P(H(0.055, 0.0, 0.014)), P(H(0.045, 0.016, 0.013))], 0.0015, { radial: 6 }) }));
    out.push(makeDef({ id: `deep-palmar-arch-${tag}`, nameEn: 'Deep palmar arch', nameLatin: 'arcus palmaris profundus', system: 'cardiovascular', kind: 'artery', region: 'upper-limb', layer: 3, side, overview: 'Deep arterial arcade of the palm, formed mainly by the radial artery.', facts: { origin: 'Radial artery (completed by the deep branch of the ulnar artery)', branches: 'Palmar metacarpal arteries', supplies: 'Metacarpal region, interossei' }, build: () => tube([P(H(0.01, 0.022, 0.0)), P(H(0.035, 0.015, 0.004)), P(H(0.04, 0.0, 0.004)), P(H(0.035, -0.015, 0.004))], 0.0013, { radial: 6 }) }));
    digitNames.forEach((dn, f) => {
      out.push(makeDef({ id: `palmar-digital-artery-${f + 1}-${tag}`, nameEn: `Palmar digital arteries of ${dn}`, nameLatin: `arteriae digitales palmares propriae`, system: 'cardiovascular', kind: 'artery', region: 'upper-limb', layer: 3, side, overview: `Paired arteries running along each side of the ${dn}.`, facts: { origin: f === 0 ? 'Princeps pollicis artery (radial artery)' : 'Common palmar digital arteries (superficial palmar arch)', supplies: `The ${dn}` }, build: () => tube([P(H(0.05, tips[f][1] * 0.7, 0.012)), P(H((0.05 + tips[f][0]) / 2, tips[f][1] * 0.95, 0.011)), P(H(tips[f][0], tips[f][1], 0.006))], 0.0009, { radial: 5 }) }));
    });
  }

  // ---- Posterior intercostal arteries & veins (spaces 1–11) ----
  for (let i = 0; i < 11; i++) {
    for (const { s, side, tag } of SIDES) {
      const rib = ribCurve(i, s);
      const yv = SPINE[7 + i].y - 0.01;
      const route = (dy: number, inset: number) =>
        [[0.012 * s, yv, SPINE[7 + i].z + 0.012] as V3, ...rib.slice(1, 5).map((p) => [p[0] * inset, p[1] + dy, p[2] * inset] as V3)];
      out.push(makeDef({ id: `posterior-intercostal-artery-${i + 1}-${tag}`, nameEn: `Posterior intercostal artery ${i + 1}`, nameLatin: `arteria intercostalis posterior ${i + 1}`, system: 'cardiovascular', kind: 'artery', region: 'thorax', layer: 3, side, overview: `Supplies the ${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} intercostal space, running in the costal groove between the vein (above) and the nerve (below).`, facts: { origin: i < 2 ? 'Supreme intercostal artery (costocervical trunk)' : 'Thoracic aorta', supplies: 'Intercostal muscles, overlying skin, parietal pleura, spinal cord (via spinal branches)' }, build: () => tube(route(-0.0065, 0.988), 0.0012, { radial: 5 }) }));
      out.push(makeDef({ id: `posterior-intercostal-vein-${i + 1}-${tag}`, nameEn: `Posterior intercostal vein ${i + 1}`, nameLatin: `vena intercostalis posterior ${i + 1}`, system: 'cardiovascular', kind: 'vein', region: 'thorax', layer: 3, side, overview: `Drains the ${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} intercostal space into the ${s < 0 ? 'azygos' : 'hemiazygos / accessory hemiazygos'} system.`, facts: { drainage: 'Intercostal space, back muscles, vertebral venous plexus' }, build: () => tube(route(-0.0045, 0.99), 0.0012, { radial: 5 }) }));
    }
  }
  return out;
}
