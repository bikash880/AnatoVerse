/**
 * Lymphatic system (lymphoid organs, ducts and ~300 individually named lymph nodes)
 * and the integumentary layer (skin shell, peeled by the Layers slider).
 */
import * as THREE from 'three';
import type { RegionId, Sex, StructureDef } from '../../types';
import { makeDef, SIDES } from '../def';
import { blob, merge, rng, seedOf, sx, tube, type V3 } from '../geometry';

/* ======================= LYMPHATIC ======================= */
interface NodeGroup {
  id: string;
  en: string;
  lat: string;
  region: RegionId;
  count: number;
  /** centre, half-extent of the cluster (left side coords). A `path` spreads nodes along a line instead. */
  c?: V3;
  spread?: V3;
  path?: [V3, V3];
  r: number;
  drains: string;
  paired: boolean;
  note?: string;
}

const NODE_GROUPS: NodeGroup[] = [
  { id: 'submandibular', en: 'Submandibular lymph node', lat: 'nodus lymphoideus submandibularis', region: 'head-neck', count: 5, c: [0.038, 1.56, 0.045], spread: [0.012, 0.006, 0.012], r: 0.0035, drains: 'Face, nose, lips, anterior tongue, floor of mouth', paired: true },
  { id: 'submental', en: 'Submental lymph node', lat: 'nodus lymphoideus submentalis', region: 'head-neck', count: 3, c: [0.008, 1.548, 0.065], spread: [0.008, 0.004, 0.006], r: 0.003, drains: 'Chin, lower lip, tip of the tongue', paired: false },
  { id: 'occipital', en: 'Occipital lymph node', lat: 'nodus lymphoideus occipitalis', region: 'head-neck', count: 3, c: [0.03, 1.625, -0.085], spread: [0.012, 0.006, 0.006], r: 0.003, drains: 'Posterior scalp', paired: true },
  { id: 'preauricular', en: 'Pre-auricular lymph node', lat: 'nodus lymphoideus preauricularis', region: 'head-neck', count: 2, c: [0.07, 1.64, 0.015], spread: [0.003, 0.008, 0.004], r: 0.003, drains: 'Lateral eyelids, temple, anterior ear', paired: true, note: 'Pre-auricular node enlargement accompanies viral (adenoviral) conjunctivitis.' },
  { id: 'postauricular', en: 'Post-auricular lymph node', lat: 'nodus lymphoideus mastoideus', region: 'head-neck', count: 2, c: [0.062, 1.64, -0.035], spread: [0.003, 0.008, 0.004], r: 0.003, drains: 'Posterior ear and scalp', paired: true, note: 'Enlarged in rubella.' },
  { id: 'superficial-cervical', en: 'Superficial cervical lymph node', lat: 'nodus lymphoideus cervicalis superficialis', region: 'head-neck', count: 5, path: [[0.056, 1.595, -0.002], [0.062, 1.48, 0.022]], r: 0.003, drains: 'Lower ear, parotid region', paired: true },
  { id: 'deep-cervical', en: 'Deep cervical lymph node', lat: 'nodus lymphoideus cervicalis profundus', region: 'head-neck', count: 14, path: [[0.038, 1.6, -0.002], [0.048, 1.46, 0.03]], r: 0.0038, drains: 'All lymph of the head and neck (final common pathway)', paired: true, note: 'The jugulodigastric node is the first to enlarge in tonsillitis.' },
  { id: 'supraclavicular', en: 'Supraclavicular lymph node', lat: 'nodus lymphoideus supraclavicularis', region: 'head-neck', count: 4, c: [0.06, 1.462, 0.03], spread: [0.02, 0.004, 0.01], r: 0.0035, drains: 'Neck, thorax and (on the left) abdomen via the thoracic duct', paired: true, note: 'An enlarged left supraclavicular node (Virchow’s node, Troisier’s sign) suggests abdominal — often gastric — malignancy.' },
  { id: 'axillary', en: 'Axillary lymph node', lat: 'nodus lymphoideus axillaris', region: 'upper-limb', count: 22, c: [0.135, 1.36, 0.0], spread: [0.02, 0.045, 0.03], r: 0.0042, drains: 'Upper limb, breast (≈75%), anterior and posterior chest wall above the umbilicus', paired: true, note: 'Sentinel-node biopsy of the axilla stages breast cancer; clearance risks lymphoedema of the arm.' },
  { id: 'cubital', en: 'Cubital (supratrochlear) lymph node', lat: 'nodus lymphoideus cubitalis', region: 'upper-limb', count: 2, c: [0.218, 1.15, -0.02], spread: [0.003, 0.012, 0.004], r: 0.003, drains: 'Medial hand and forearm', paired: true },
  { id: 'parasternal', en: 'Parasternal lymph node', lat: 'nodus lymphoideus parasternalis', region: 'thorax', count: 6, path: [[0.028, 1.42, 0.072], [0.032, 1.27, 0.098]], r: 0.0028, drains: 'Medial breast, anterior chest and abdominal wall, upper liver surface', paired: true },
  { id: 'tracheobronchial', en: 'Tracheobronchial lymph node', lat: 'nodus lymphoideus tracheobronchialis', region: 'thorax', count: 6, c: [0.025, 1.36, -0.005], spread: [0.02, 0.02, 0.012], r: 0.004, drains: 'Lungs and bronchi', paired: true, note: 'Hilar lymphadenopathy is seen in sarcoidosis, TB, lymphoma and lung cancer.' },
  { id: 'mediastinal', en: 'Mediastinal lymph node', lat: 'nodus lymphoideus mediastinalis', region: 'thorax', count: 10, c: [0.0, 1.4, 0.02], spread: [0.02, 0.04, 0.025], r: 0.0038, drains: 'Thoracic viscera: heart, pericardium, thymus, oesophagus', paired: false },
  { id: 'coeliac', en: 'Coeliac lymph node', lat: 'nodus lymphoideus coeliacus', region: 'abdomen', count: 5, c: [0.008, 1.17, 0.025], spread: [0.02, 0.008, 0.012], r: 0.0035, drains: 'Stomach, liver, gallbladder, spleen, pancreas (foregut)', paired: false },
  { id: 'gastric', en: 'Gastric lymph node', lat: 'nodus lymphoideus gastricus', region: 'abdomen', count: 8, path: [[0.04, 1.17, 0.03], [0.07, 1.1, 0.078]], r: 0.003, drains: 'Lesser and greater curvatures of the stomach', paired: false },
  { id: 'mesenteric', en: 'Superior mesenteric lymph node', lat: 'nodus lymphoideus mesentericus superior', region: 'abdomen', count: 36, c: [0.0, 1.03, 0.058], spread: [0.06, 0.05, 0.02], r: 0.0033, drains: 'Jejunum, ileum, caecum, appendix, ascending & transverse colon (midgut)', paired: false, note: 'Mesenteric adenitis in children mimics appendicitis.' },
  { id: 'inferior-mesenteric', en: 'Inferior mesenteric lymph node', lat: 'nodus lymphoideus mesentericus inferior', region: 'abdomen', count: 6, c: [0.035, 1.0, 0.035], spread: [0.015, 0.03, 0.01], r: 0.003, drains: 'Descending & sigmoid colon, upper rectum (hindgut)', paired: false },
  { id: 'lumbar', en: 'Lumbar (para-aortic) lymph node', lat: 'nodus lymphoideus lumbalis', region: 'abdomen', count: 8, path: [[0.022, 1.16, -0.008], [0.02, 1.065, 0.008]], r: 0.0036, drains: 'Kidneys, adrenals, gonads, posterior abdominal wall, iliac nodes', paired: true, note: 'Testicular and ovarian cancers spread first to para-aortic nodes.' },
  { id: 'common-iliac', en: 'Common iliac lymph node', lat: 'nodus lymphoideus iliacus communis', region: 'pelvis', count: 3, path: [[0.012, 1.055, 0.012], [0.05, 0.99, 0.016]], r: 0.0033, drains: 'External and internal iliac nodes', paired: true },
  { id: 'external-iliac', en: 'External iliac lymph node', lat: 'nodus lymphoideus iliacus externus', region: 'pelvis', count: 4, path: [[0.054, 0.985, 0.016], [0.074, 0.94, 0.064]], r: 0.0033, drains: 'Inguinal nodes, bladder, upper vagina / prostate', paired: true },
  { id: 'internal-iliac', en: 'Internal iliac lymph node', lat: 'nodus lymphoideus iliacus internus', region: 'pelvis', count: 4, c: [0.045, 0.94, -0.03], spread: [0.01, 0.025, 0.012], r: 0.0033, drains: 'Pelvic viscera, perineum, gluteal region', paired: true },
  { id: 'superficial-inguinal', en: 'Superficial inguinal lymph node', lat: 'nodus lymphoideus inguinalis superficialis', region: 'lower-limb', count: 10, path: [[0.04, 0.9, 0.09], [0.11, 0.94, 0.075]], r: 0.0042, drains: 'Lower limb (superficial), lower abdominal wall below the umbilicus, perineum, anal canal below the pectinate line, external genitalia', paired: true, note: 'Palpate below the inguinal ligament; enlargement follows infection of the leg or perineum.' },
  { id: 'deep-inguinal', en: 'Deep inguinal lymph node', lat: 'nodus lymphoideus inguinalis profundus', region: 'lower-limb', count: 3, path: [[0.072, 0.92, 0.064], [0.072, 0.88, 0.064]], r: 0.0036, drains: 'Deep lymphatics of the lower limb, glans', paired: true, note: 'The highest node (of Cloquet) lies in the femoral canal.' },
  { id: 'popliteal', en: 'Popliteal lymph node', lat: 'nodus lymphoideus popliteus', region: 'lower-limb', count: 5, c: [0.095, 0.51, -0.045], spread: [0.012, 0.025, 0.008], r: 0.0032, drains: 'Lateral foot and posterolateral leg (with the small saphenous vein)', paired: true },
];

export function buildLymphatic(): StructureDef[] {
  const out: StructureDef[] = [];
  const LYM = 'lymphatic' as const;
  const unit = () => new THREE.IcosahedronGeometry(1, 2);

  for (const g of NODE_GROUPS) {
    const sides = g.paired ? SIDES : [{ s: 1, side: 'midline' as const, tag: '' }];
    for (const { s, side, tag } of sides) {
      const rand = rng(seedOf(g.id + tag));
      for (let i = 0; i < g.count; i++) {
        let p: V3;
        if (g.path) {
          const t = g.count === 1 ? 0.5 : i / (g.count - 1);
          const [a, b] = g.path;
          p = [a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * 0.008, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + (rand() - 0.5) * 0.008];
        } else {
          const c = g.c!;
          const sp = g.spread!;
          p = [c[0] + (rand() * 2 - 1) * sp[0], c[1] + (rand() * 2 - 1) * sp[1], c[2] + (rand() * 2 - 1) * sp[2]];
        }
        if (!g.paired && g.id !== 'submental') p[0] = p[0] * (rand() < 0.5 ? -1 : 1);
        const P = sx(p, s);
        const sc: V3 = [g.r * (0.8 + rand() * 0.5), g.r * (0.7 + rand() * 0.4), g.r * (0.8 + rand() * 0.5)];
        out.push(
          makeDef({
            id: `ln-${g.id}-${i + 1}${tag ? `-${tag}` : ''}`,
            nameEn: `${g.en} ${i + 1}`,
            nameLatin: g.lat,
            system: LYM,
            kind: 'lymph',
            region: g.region,
            layer: 3,
            side,
            overview: `One of the ${g.en.toLowerCase()}s. Lymph nodes filter lymph and host lymphocytes that mount immune responses.`,
            clinicalNote: g.note,
            facts: { drainage: g.drains, function: 'Filtration of lymph; antigen presentation and lymphocyte activation' },
            build: () => unit().scale(sc[0], sc[1], sc[2]).translate(P[0], P[1], P[2]),
          }),
        );
      }
    }
  }

  // Organs & ducts
  out.push(makeDef({ id: 'spleen', nameEn: 'Spleen', nameLatin: 'splen', system: LYM, kind: 'organ', region: 'abdomen', layer: 3, overview: 'Largest lymphoid organ, in the left hypochondrium beneath ribs 9–11.', facts: { function: 'Filters blood, removes old red cells, stores platelets, mounts immune responses to blood-borne antigens', bloodSupply: 'Splenic artery; drains via the splenic vein to the portal system' }, clinicalNote: 'Easily ruptured in blunt trauma to the left lower ribs; after splenectomy give vaccines against encapsulated bacteria.', build: () => blob([0.1, 1.175, -0.045], [0.02, 0.05, 0.032], { rotate: [0.3, 0.6, -0.3], deform: (d) => (d.x < -0.4 ? 0.75 : 1), noise: 0.03 }) }));
  out.push(makeDef({ id: 'thymus', nameEn: 'Thymus', nameLatin: 'thymus', system: LYM, kind: 'organ', region: 'thorax', layer: 3, overview: 'Bilobed primary lymphoid organ in the superior/anterior mediastinum; large in childhood, involutes after puberty.', facts: { function: 'Maturation and selection of T lymphocytes', bloodSupply: 'Internal thoracic and inferior thyroid arteries' }, clinicalNote: 'Thymomas are associated with myasthenia gravis.', build: () => merge([blob([0.012, 1.405, 0.07], [0.014, 0.035, 0.008]), blob([-0.012, 1.4, 0.07], [0.013, 0.032, 0.008])]) }));
  for (const { s, side, tag } of SIDES)
    out.push(makeDef({ id: `palatine-tonsil-${tag}`, nameEn: 'Palatine tonsil', nameLatin: 'tonsilla palatina', system: LYM, kind: 'lymph', region: 'head-neck', layer: 3, side, overview: 'Lymphoid mass in the lateral wall of the oropharynx between the palatoglossal and palatopharyngeal arches.', facts: { function: 'First-line immune surveillance of ingested and inhaled antigens', bloodSupply: 'Tonsillar branch of the facial artery' }, clinicalNote: 'Peritonsillar abscess (quinsy) deviates the uvula to the opposite side.', build: () => blob(sx([0.013, 1.585, 0.03], s), [0.005, 0.009, 0.006]) }));
  out.push(makeDef({ id: 'cisterna-chyli', nameEn: 'Cisterna chyli', nameLatin: 'cisterna chyli', system: LYM, kind: 'lymph', region: 'abdomen', layer: 3, overview: 'Dilated sac at the origin of the thoracic duct, anterior to L1–L2.', facts: { function: 'Collects lymph (and chyle) from the lower body and gut', drainage: 'Intestinal and lumbar lymph trunks' }, build: () => blob([0.008, 1.14, -0.02], [0.005, 0.016, 0.005]) }));
  out.push(makeDef({ id: 'thoracic-duct', nameEn: 'Thoracic duct', nameLatin: 'ductus thoracicus', system: LYM, kind: 'lymph', region: 'thorax', layer: 3, overview: 'Largest lymphatic vessel (~40 cm) returning lymph to the venous system.', facts: { drainage: 'Lymph from the whole body except the right upper quadrant (head, neck, thorax and right arm)', course: 'Ascends through the aortic hiatus between the aorta and azygos, crosses to the left at T5, drains into the left venous angle (subclavian/internal jugular junction)' }, clinicalNote: 'Injury (e.g. during oesophagectomy) causes chylothorax.', build: () => tube([[0.008, 1.155, -0.02], [0.0, 1.22, -0.035], [-0.004, 1.3, -0.05], [0.008, 1.38, -0.04], [0.022, 1.45, -0.01], [0.04, 1.475, 0.015], [0.045, 1.458, 0.035]], 0.0018, { radial: 6 }) }));
  out.push(makeDef({ id: 'right-lymphatic-duct', nameEn: 'Right lymphatic duct', nameLatin: 'ductus lymphaticus dexter', system: LYM, kind: 'lymph', region: 'thorax', layer: 3, side: 'right', overview: 'Short trunk draining the right upper quadrant of the body.', facts: { drainage: 'Right side of the head, neck, thorax and right upper limb', course: 'Empties into the right venous angle' }, build: () => tube([[-0.035, 1.47, 0.02], [-0.042, 1.462, 0.03], [-0.045, 1.456, 0.036]], 0.0016, { radial: 6 }) }));
  return out;
}

/* ======================= SKIN (integumentary, layer 0) ======================= */

/** Lofted trunk surface: elliptical cross-sections whose radii depend on height and angle. */
function loft(y0: number, y1: number, rows: number, cols: number, section: (y: number, a: number) => [number, number]) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const [x, z] = section(y, a);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const interp = (knots: [number, number][], y: number) => {
  if (y <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++)
    if (y <= knots[i][0]) {
      const t = (y - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]);
      const s = t * t * (3 - 2 * t);
      return knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * s;
    }
  return knots[knots.length - 1][1];
};

export function buildSkin(sex: Sex): StructureDef[] {
  const out: StructureDef[] = [];
  const S = 'integumentary' as const;
  const skin = (id: string, en: string, lat: string, region: RegionId, side: 'left' | 'right' | 'midline', build: () => THREE.BufferGeometry) =>
    makeDef({ id, nameEn: en, nameLatin: lat, system: S, kind: 'skin', region, layer: 0, side, overview: `Skin of the ${en.toLowerCase().replace('skin — ', '')}: epidermis, dermis and subcutaneous tissue.`, facts: { function: 'Protection, thermoregulation, sensation, vitamin D synthesis', bloodSupply: 'Dermal and subdermal vascular plexuses' }, build });

  const RX: [number, number][] = [[0.84, 0.16], [0.95, 0.175], [1.05, 0.155], [1.15, 0.15], [1.25, 0.165], [1.35, 0.178], [1.42, 0.19], [1.47, 0.13], [1.5, 0.06]];
  const RZ: [number, number][] = [[0.84, 0.1], [0.95, 0.118], [1.05, 0.12], [1.15, 0.112], [1.3, 0.118], [1.42, 0.1], [1.5, 0.052]];
  const CZ: [number, number][] = [[0.84, -0.01], [0.95, -0.0], [1.1, 0.0], [1.3, 0.0], [1.45, -0.02], [1.5, -0.01]];
  out.push(
    skin('skin-trunk', 'Skin — trunk', 'integumentum trunci', 'thorax', 'midline', () =>
      loft(0.83, 1.5, 40, 48, (y, a) => {
        const rx = interp(RX, y);
        let rz = interp(RZ, y);
        const cz = interp(CZ, y);
        const sa = Math.sin(a);
        const ca = Math.cos(a);
        // buttocks: extra posterior bulge
        if (sa < 0) rz += 0.03 * Math.exp(-Math.pow((y - 0.9) / 0.06, 2)) * Math.pow(Math.abs(ca) < 0.8 ? 1 - Math.abs(ca) * 0.6 : 0.5, 1);
        // breasts (female): anterior bulges at x ≈ ±0.08
        if (sex === 'female' && sa > 0) rz += 0.055 * Math.exp(-Math.pow((y - 1.3) / 0.045, 2)) * Math.exp(-Math.pow((Math.abs(ca) - 0.5) / 0.22, 2));
        return [rx * ca, cz + rz * sa];
      }),
    ),
  );
  out.push(skin('skin-head', 'Skin — head', 'integumentum capitis', 'head-neck', 'midline', () => blob([0, 1.675, 0.0], [0.082, 0.112, 0.104], { w: 36, h: 26, deform: (d) => (d.y < -0.4 && d.z < 0.3 ? 0.85 : 1) * (d.z > 0.6 && Math.abs(d.x) < 0.2 && d.y > -0.4 && d.y < 0.05 ? 1.06 : 1) })));
  out.push(skin('skin-neck', 'Skin — neck', 'integumentum colli', 'head-neck', 'midline', () => tube([[0, 1.6, -0.01], [0, 1.52, 0.0], [0, 1.47, 0.0]], (t) => 0.052 + t * 0.008, { radial: 24 })));
  for (const { s, side, tag } of SIDES) {
    const P = (q: V3) => sx(q, s);
    out.push(skin(`skin-arm-${tag}`, 'Skin — arm', 'integumentum brachii', 'upper-limb', side, () => tube([P([0.185, 1.455, -0.015]), P([0.215, 1.3, -0.02]), P([0.25, 1.12, -0.03])], (t) => 0.05 - t * 0.012, { radial: 22 })));
    out.push(skin(`skin-forearm-${tag}`, 'Skin — forearm', 'integumentum antebrachii', 'upper-limb', side, () => tube([P([0.25, 1.12, -0.03]), P([0.28, 1.02, -0.018]), P([0.31, 0.875, 0.0])], (t) => 0.039 - t * 0.014 + 0.004 * Math.sin(Math.PI * t), { radial: 22 })));
    out.push(skin(`skin-hand-${tag}`, 'Skin — hand', 'integumentum manus', 'upper-limb', side, () => {
      const g = blob([0, 0, 0], [0.042, 0.1, 0.016], { w: 24, h: 18, deform: (d) => (d.y < 0 ? 1 - 0.25 * -d.y : 1) });
      const dir = new THREE.Vector3(0.05 * s, -0.195, 0.03).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
      const c = P([0.338, 0.78, 0.018]);
      return g.translate(c[0], c[1], c[2]);
    }));
    out.push(skin(`skin-thigh-${tag}`, 'Skin — thigh', 'integumentum femoris', 'lower-limb', side, () => tube([P([0.1, 0.9, 0.0]), P([0.105, 0.7, 0.0]), P([0.097, 0.5, 0.005])], (t) => 0.088 - t * 0.035, { radial: 26 })));
    out.push(skin(`skin-leg-${tag}`, 'Skin — leg', 'integumentum cruris', 'lower-limb', side, () => tube([P([0.097, 0.5, 0.005]), P([0.1, 0.36, -0.012]), P([0.1, 0.2, -0.01]), P([0.1, 0.085, -0.01])], (t) => 0.053 - t * 0.02 + 0.008 * Math.exp(-Math.pow((t - 0.3) / 0.18, 2)), { radial: 24 })));
    out.push(skin(`skin-foot-${tag}`, 'Skin — foot', 'integumentum pedis', 'lower-limb', side, () => blob(P([0.103, 0.035, 0.05]), [0.04, 0.032, 0.12], { w: 24, h: 18, deform: (d) => (d.y < -0.3 ? 0.85 : 1) * (d.z > 0.3 && d.y > 0 ? 1 - 0.5 * d.y : 1) })));
  }
  return out;
}
