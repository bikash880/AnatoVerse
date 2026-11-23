/**
 * Visceral systems: respiratory (incl. segmental bronchi), digestive, urinary and reproductive.
 */
import * as THREE from 'three';
import type { Facts, RegionId, Sex, StructureDef, SystemId } from '../../types';
import { makeDef, SIDES } from '../def';
import { blob, merge, rng, shell, sx, tube, type V3 } from '../geometry';

function organ(
  system: SystemId,
  id: string,
  nameEn: string,
  nameLatin: string,
  region: RegionId,
  build: () => THREE.BufferGeometry,
  o: { side?: 'left' | 'right' | 'midline'; facts?: Facts; overview?: string; note?: string; taId?: string; sex?: Sex | 'both'; kind?: 'organ' | 'muscle' | 'cartilage' } = {},
): StructureDef {
  return makeDef({
    id,
    nameEn,
    nameLatin,
    system,
    kind: o.kind ?? 'organ',
    region,
    layer: 3,
    side: o.side ?? 'midline',
    sex: o.sex ?? 'both',
    taId: o.taId ?? null,
    overview: o.overview ?? `${nameEn}.`,
    clinicalNote: o.note,
    facts: o.facts ?? {},
    build,
  });
}

/* ======================= RESPIRATORY ======================= */
export function buildRespiratory(): StructureDef[] {
  const out: StructureDef[] = [];
  const R = 'respiratory' as const;
  out.push(organ(R, 'nasal-cavity', 'Nasal cavity', 'cavitas nasi', 'head-neck', () => blob([0, 1.635, 0.062], [0.013, 0.022, 0.03], { w: 16, h: 12 }), { overview: 'Air passage from the nostrils to the nasopharynx, divided by the nasal septum and lined by vascular mucosa with conchae.', facts: { function: 'Warms, humidifies and filters inspired air; olfaction' }, note: 'Most nosebleeds arise from Kiesselbach’s plexus (Little’s area) on the anterior septum.' }));
  out.push(organ(R, 'larynx', 'Larynx', 'larynx', 'head-neck', () => merge([blob([0, 1.51, 0.038], [0.02, 0.022, 0.016], { deform: (d) => (d.z > 0.5 ? 1.15 : 1) }), tube([[0, 1.535, 0.03], [0, 1.548, 0.035]], 0.008)]), { kind: 'cartilage', overview: 'Voice box: cartilaginous skeleton (thyroid, cricoid, arytenoid, epiglottis) housing the vocal folds.', facts: { function: 'Phonation; protects the airway during swallowing', innervation: 'Superior and recurrent laryngeal nerves (vagus)', bloodSupply: 'Superior and inferior laryngeal arteries' }, note: 'Emergency airway: cricothyroidotomy through the cricothyroid membrane between the thyroid and cricoid cartilages.' }));
  out.push(organ(R, 'trachea', 'Trachea', 'trachea', 'thorax', () => merge([tube([[0, 1.49, 0.03], [0, 1.44, 0.022], [0, 1.4, 0.008], [0, 1.365, -0.005]], 0.0085, { radial: 14 }), ...Array.from({ length: 12 }, (_, i) => new THREE.TorusGeometry(0.0092, 0.0012, 5, 16, Math.PI * 1.6).rotateX(Math.PI / 2).rotateY(Math.PI * 0.7).translate(0, 1.485 - i * 0.01, 0.03 - i * 0.003))]), { kind: 'cartilage', overview: 'Windpipe supported by 16–20 C-shaped cartilage rings; bifurcates at the carina (T4/T5).', facts: { function: 'Conducts air between the larynx and the main bronchi', bloodSupply: 'Inferior thyroid and bronchial arteries', innervation: 'Vagus and recurrent laryngeal nerves; sympathetic trunk' }, note: 'Tracheal deviation away from the affected side is a sign of tension pneumothorax.' }));
  out.push(organ(R, 'main-bronchus-r', 'Right main bronchus', 'bronchus principalis dexter', 'thorax', () => tube([[0, 1.365, -0.005], [-0.025, 1.35, -0.01], [-0.055, 1.34, -0.012]], 0.0065), { side: 'right', kind: 'cartilage', overview: 'Shorter, wider and more vertical than the left main bronchus.', facts: { function: 'Conducts air to the right lung' }, note: 'Inhaled foreign bodies usually lodge in the right main bronchus because it is wider and more vertical.' }));
  out.push(organ(R, 'main-bronchus-l', 'Left main bronchus', 'bronchus principalis sinister', 'thorax', () => tube([[0, 1.365, -0.005], [0.03, 1.355, -0.012], [0.06, 1.33, -0.015]], 0.0055), { side: 'left', kind: 'cartilage', overview: 'Longer and more horizontal; passes under the arch of the aorta.', facts: { function: 'Conducts air to the left lung' } }));

  // Lobes: built as overlapping lobed ellipsoids so fissures read as creases.
  type Lobe = { id: string; en: string; lat: string; c: V3; r: V3; side: 'left' | 'right' };
  const lobes: Lobe[] = [
    { id: 'lung-right-upper-lobe', en: 'Right lung — upper lobe', lat: 'lobus superior pulmonis dextri', c: [-0.074, 1.395, 0.01], r: [0.058, 0.075, 0.068], side: 'right' },
    { id: 'lung-right-middle-lobe', en: 'Right lung — middle lobe', lat: 'lobus medius pulmonis dextri', c: [-0.08, 1.3, 0.045], r: [0.056, 0.04, 0.04], side: 'right' },
    { id: 'lung-right-lower-lobe', en: 'Right lung — lower lobe', lat: 'lobus inferior pulmonis dextri', c: [-0.082, 1.28, -0.025], r: [0.06, 0.075, 0.062], side: 'right' },
    { id: 'lung-left-upper-lobe', en: 'Left lung — upper lobe', lat: 'lobus superior pulmonis sinistri', c: [0.078, 1.37, 0.022], r: [0.055, 0.095, 0.064], side: 'left' },
    { id: 'lung-left-lower-lobe', en: 'Left lung — lower lobe', lat: 'lobus inferior pulmonis sinistri', c: [0.082, 1.28, -0.025], r: [0.058, 0.078, 0.062], side: 'left' },
  ];
  lobes.forEach((l, i) => {
    const s = l.side === 'left' ? 1 : -1;
    out.push(
      organ(R, l.id, l.en, l.lat, 'thorax', () => blob(l.c, l.r, { w: 30, h: 22, noise: 0.025, seed: 20 + i, deform: (d) => {
        let k = 1;
        if (-d.x * s > 0.35) k *= 0.8 + 0.2 * (1 - (-d.x * s - 0.35)); // flattened mediastinal surface
        if (l.side === 'left' && l.id.includes('upper') && -d.x * s > 0.2 && d.y < -0.1 && d.z > 0.2) k *= 0.7; // cardiac notch
        if (d.y < -0.6) k *= 0.88; // concave diaphragmatic surface
        return k;
      } }), {
        side: l.side,
        taId: undefined,
        overview: `${l.en}. ${l.side === 'right' ? 'The right lung has three lobes separated by the oblique and horizontal fissures.' : 'The left lung has two lobes separated by the oblique fissure, with a cardiac notch and lingula.'}`,
        facts: { function: 'Gas exchange between alveolar air and pulmonary capillary blood', bloodSupply: 'Pulmonary arteries (gas exchange); bronchial arteries (nutrition)', innervation: 'Pulmonary plexus (vagus and sympathetic trunk)' },
        note: l.id.includes('lower') ? 'Aspiration in the supine patient favours the superior segment of the lower lobe.' : 'Auscultate the upper lobes anteriorly and the lower lobes posteriorly.',
      }),
    );
  });

  // Lobar & segmental bronchi
  const segs: [string, 'left' | 'right', V3, V3][] = [
    ['Apical segmental bronchus (B1)', 'right', [-0.06, 1.345, -0.01], [-0.07, 1.43, 0.0]],
    ['Posterior segmental bronchus (B2)', 'right', [-0.06, 1.345, -0.01], [-0.09, 1.39, -0.04]],
    ['Anterior segmental bronchus (B3)', 'right', [-0.06, 1.345, -0.01], [-0.085, 1.37, 0.05]],
    ['Lateral segmental bronchus (B4)', 'right', [-0.06, 1.32, 0.0], [-0.11, 1.3, 0.035]],
    ['Medial segmental bronchus (B5)', 'right', [-0.06, 1.32, 0.0], [-0.06, 1.29, 0.06]],
    ['Superior segmental bronchus (B6)', 'right', [-0.062, 1.31, -0.015], [-0.08, 1.31, -0.07]],
    ['Medial basal segmental bronchus (B7)', 'right', [-0.062, 1.3, -0.015], [-0.05, 1.23, 0.0]],
    ['Anterior basal segmental bronchus (B8)', 'right', [-0.062, 1.3, -0.015], [-0.09, 1.23, 0.03]],
    ['Lateral basal segmental bronchus (B9)', 'right', [-0.062, 1.3, -0.015], [-0.12, 1.23, -0.01]],
    ['Posterior basal segmental bronchus (B10)', 'right', [-0.062, 1.3, -0.015], [-0.08, 1.22, -0.06]],
    ['Apicoposterior segmental bronchus (B1+2)', 'left', [0.065, 1.33, -0.012], [0.08, 1.43, -0.02]],
    ['Anterior segmental bronchus (B3)', 'left', [0.065, 1.33, -0.012], [0.09, 1.37, 0.05]],
    ['Superior lingular bronchus (B4)', 'left', [0.065, 1.32, -0.005], [0.11, 1.31, 0.04]],
    ['Inferior lingular bronchus (B5)', 'left', [0.065, 1.32, -0.005], [0.08, 1.26, 0.06]],
    ['Superior segmental bronchus (B6)', 'left', [0.066, 1.315, -0.02], [0.085, 1.31, -0.07]],
    ['Anteromedial basal segmental bronchus (B7+8)', 'left', [0.066, 1.3, -0.02], [0.08, 1.22, 0.02]],
    ['Lateral basal segmental bronchus (B9)', 'left', [0.066, 1.3, -0.02], [0.12, 1.23, -0.01]],
    ['Posterior basal segmental bronchus (B10)', 'left', [0.066, 1.3, -0.02], [0.085, 1.22, -0.06]],
  ];
  segs.forEach(([en, side, a, b], i) => {
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.005, (a[2] + b[2]) / 2];
    const bn = en.match(/\((B[^)]+)\)/)![1].toLowerCase().replace('+', '');
    out.push(organ(R, `segmental-bronchus-${side[0]}-${bn}`, en, `bronchus segmentalis ${en.split(' (')[0].toLowerCase()}`, 'thorax', () => tube([side === 'right' ? [-0.055, 1.34, -0.012] : [0.06, 1.33, -0.015], a, mid, b], (t) => 0.0042 * (1 - t * 0.6), { radial: 7 }), { side, kind: 'cartilage', overview: `${en} — airway to a bronchopulmonary segment (${i < 10 ? 'right' : 'left'} lung).`, facts: { function: 'Conducts air to a single bronchopulmonary segment, the surgical unit of the lung' }, note: 'Bronchopulmonary segments can be resected individually (segmentectomy) because each has its own bronchus and artery.' }));
  });

  out.push(organ(R, 'diaphragm', 'Diaphragm', 'diaphragma', 'thorax', () => merge([
    shell([-0.04, 1.135, -0.005], [0.105, 0.105, 0.1], 0, Math.PI * 2, 0, Math.PI / 2),
    shell([0.045, 1.13, -0.005], [0.1, 0.095, 0.1], 0, Math.PI * 2, 0, Math.PI / 2),
  ]), { kind: 'muscle', overview: 'Dome-shaped musculotendinous sheet separating the thoracic and abdominal cavities; the main muscle of inspiration.', facts: { origin: 'Xiphoid process, lower 6 costal cartilages, lumbar vertebrae (crura) and arcuate ligaments', insertion: 'Central tendon', action: 'Contracts and descends during inspiration, increasing thoracic volume', innervation: 'Phrenic nerves (C3–C5)', bloodSupply: 'Pericardiophrenic, musculophrenic, superior & inferior phrenic arteries' }, note: 'Openings: IVC at T8, oesophagus at T10, aorta at T12 (“I 8 10 Eggs At 12”).' }));
  return out;
}

/* ======================= DIGESTIVE ======================= */
export function buildDigestive(): StructureDef[] {
  const out: StructureDef[] = [];
  const G = 'digestive' as const;
  out.push(organ(G, 'tongue', 'Tongue', 'lingua', 'head-neck', () => blob([0, 1.575, 0.05], [0.02, 0.01, 0.03], { deform: (d) => (d.z > 0.3 ? 1 - 0.3 * d.z : 1) }), { kind: 'muscle', overview: 'Muscular organ of the oral floor for taste, chewing, swallowing and speech.', facts: { function: 'Manipulates food, taste, articulation of speech', innervation: 'Motor: hypoglossal (CN XII); taste: facial (anterior ⅔) and glossopharyngeal (posterior ⅓); general sensation: lingual nerve (V3)', bloodSupply: 'Lingual artery' } }));
  for (const { s, side, tag } of SIDES) {
    out.push(organ(G, `parotid-gland-${tag}`, 'Parotid gland', 'glandula parotidea', 'head-neck', () => blob(sx([0.058, 1.6, 0.0], s), [0.012, 0.025, 0.018], { noise: 0.1 }), { side, overview: 'Largest salivary gland, wrapped around the ramus of the mandible.', facts: { function: 'Serous saliva (amylase) into the mouth via the parotid (Stensen) duct opposite the 2nd upper molar', innervation: 'Parasympathetic secretomotor fibres from CN IX via the otic ganglion', bloodSupply: 'External carotid artery branches' }, note: 'The facial nerve branches run through the gland — at risk in parotid surgery; mumps causes parotid swelling.' }));
    out.push(organ(G, `submandibular-gland-${tag}`, 'Submandibular gland', 'glandula submandibularis', 'head-neck', () => blob(sx([0.035, 1.555, 0.03], s), [0.01, 0.01, 0.016], { noise: 0.1 }), { side, overview: 'Salivary gland in the submandibular triangle.', facts: { function: 'Mixed saliva via the submandibular (Wharton) duct', innervation: 'Parasympathetic from CN VII (chorda tympani) via the submandibular ganglion' }, note: 'The most common site of salivary stones (sialolithiasis).' }));
  }
  out.push(organ(G, 'pharynx', 'Pharynx', 'pharynx', 'head-neck', () => tube([[0, 1.645, 0.03], [0, 1.62, 0.012], [0, 1.58, 0.008], [0, 1.535, 0.012], [0, 1.5, 0.012]], (t) => 0.014 - t * 0.005, { radial: 14 }), { kind: 'muscle', overview: 'Musculomembranous tube (naso-, oro- and laryngopharynx) shared by the respiratory and digestive tracts.', facts: { function: 'Conducts air and food; swallowing', innervation: 'Pharyngeal plexus (CN IX, X)' } }));
  out.push(organ(G, 'oesophagus', 'Oesophagus', 'oesophagus', 'thorax', () => tube([[0, 1.5, 0.012], [0.002, 1.45, 0.006], [0.006, 1.38, -0.015], [0.012, 1.3, -0.03], [0.02, 1.22, -0.015], [0.03, 1.19, 0.0], [0.042, 1.178, 0.018]], 0.0075, { radial: 12 }), { kind: 'muscle', overview: 'Muscular tube (~25 cm) from the pharynx (C6) to the stomach (T11), passing through the diaphragm at T10.', facts: { function: 'Transports food by peristalsis', bloodSupply: 'Inferior thyroid, oesophageal branches of the aorta, left gastric arteries', innervation: 'Oesophageal plexus (vagus and sympathetic)' }, note: 'Barrett’s oesophagus (metaplasia from chronic reflux) predisposes to adenocarcinoma.' }));
  out.push(organ(G, 'stomach', 'Stomach', 'gaster', 'abdomen', () => tube([[0.042, 1.178, 0.018], [0.07, 1.2, 0.0], [0.09, 1.165, 0.02], [0.085, 1.12, 0.05], [0.06, 1.09, 0.068], [0.025, 1.098, 0.072], [-0.005, 1.11, 0.062], [-0.022, 1.122, 0.05]], (t) => 0.012 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.12)) * (t < 0.15 ? 0.85 : 1) - 0.014 * Math.max(0, t - 0.75) * 4, { radial: 22, tubular: 64 }), { taId: 'A05.5.01.001', overview: 'J-shaped dilatation of the gut in the left upper quadrant: cardia, fundus, body, pyloric antrum and pylorus.', facts: { function: 'Stores and mixes food with acid & pepsin (chyme); secretes intrinsic factor', bloodSupply: 'Left & right gastric, left & right gastro-omental and short gastric arteries (all from the coeliac trunk)', innervation: 'Vagus (parasympathetic: secretion, motility), coeliac plexus (sympathetic)' }, note: 'Posterior duodenal/gastric ulcers may erode the gastroduodenal or splenic artery and bleed massively.' }));
  out.push(organ(G, 'duodenum', 'Duodenum', 'duodenum', 'abdomen', () => tube([[-0.022, 1.122, 0.05], [-0.042, 1.12, 0.035], [-0.05, 1.09, 0.025], [-0.042, 1.055, 0.02], [-0.01, 1.05, 0.02], [0.02, 1.06, 0.02], [0.03, 1.075, 0.025]], 0.011, { radial: 12 }), { overview: 'First, C-shaped part of the small intestine (~25 cm) curving around the head of the pancreas.', facts: { function: 'Receives bile and pancreatic juice (major duodenal papilla); neutralises chyme; begins absorption', bloodSupply: 'Gastroduodenal and pancreaticoduodenal arteries' }, note: 'The commonest site of peptic ulcers (first part, “duodenal cap”).' }));
  // Jejunum & ileum: serpentine coils
  const coil = (x0: number, x1: number, y0: number, y1: number, z: number, loops: number, seed: number): V3[] => {
    const r = rng(seed);
    const pts: V3[] = [];
    for (let i = 0; i <= loops * 6; i++) {
      const t = i / (loops * 6);
      const row = Math.floor(t * loops);
      const u = (t * loops) % 1;
      const dir = row % 2 === 0 ? u : 1 - u;
      pts.push([x0 + (x1 - x0) * dir, y1 - ((y1 - y0) * (row + 0.5)) / loops + 0.012 * Math.sin(u * Math.PI * 3), z + 0.02 * Math.sin(u * Math.PI * 2 + row) + (r() - 0.5) * 0.012]);
    }
    return pts;
  };
  out.push(organ(G, 'jejunum', 'Jejunum', 'jejunum', 'abdomen', () => tube([[0.03, 1.075, 0.025], ...coil(-0.01, 0.1, 1.0, 1.08, 0.07, 5, 3)], 0.0095, { radial: 10, tubular: 260 }), { overview: 'Proximal two-fifths of the jejuno-ileum, mostly in the left upper abdomen; thick wall with prominent circular folds.', facts: { function: 'Main site of nutrient absorption', bloodSupply: 'Jejunal arteries (SMA) with few arcades and long vasa recta' } }));
  out.push(organ(G, 'ileum', 'Ileum', 'ileum', 'abdomen', () => tube([...coil(-0.07, 0.05, 0.93, 1.0, 0.07, 5, 9), [-0.07, 0.96, 0.055]], 0.0085, { radial: 10, tubular: 260 }), { overview: 'Distal three-fifths of the jejuno-ileum, mostly in the right lower abdomen and pelvis; ends at the ileocaecal valve.', facts: { function: 'Absorbs vitamin B12 and bile salts; Peyer’s patches (immunity)', bloodSupply: 'Ileal arteries (SMA) with many arcades and short vasa recta' }, note: 'Meckel diverticulum: 2% of people, 2 feet from the ileocaecal valve, 2 inches long.' }));
  out.push(organ(G, 'caecum', 'Caecum', 'caecum', 'abdomen', () => blob([-0.085, 0.965, 0.05], [0.024, 0.026, 0.022], { noise: 0.06 }), { overview: 'Blind-ended pouch at the start of the large intestine in the right iliac fossa.', facts: { function: 'Receives ileal contents; absorbs water and electrolytes', bloodSupply: 'Ileocolic artery' } }));
  out.push(organ(G, 'appendix', 'Vermiform appendix', 'appendix vermiformis', 'abdomen', () => tube([[-0.078, 0.948, 0.05], [-0.07, 0.928, 0.058], [-0.06, 0.915, 0.048], [-0.058, 0.905, 0.032]], 0.0035), { overview: 'Narrow, worm-like diverticulum of the caecum rich in lymphoid tissue.', facts: { function: 'Lymphoid organ (GALT); possible reservoir of gut flora', bloodSupply: 'Appendicular artery (ileocolic)' }, note: 'Appendicitis: periumbilical pain migrating to McBurney’s point (⅓ from ASIS to umbilicus).' }));
  const haustra = (r: number) => (t: number) => r * (1 + 0.14 * Math.sin(t * 90));
  out.push(organ(G, 'ascending-colon', 'Ascending colon', 'colon ascendens', 'abdomen', () => tube([[-0.088, 0.98, 0.045], [-0.1, 1.05, 0.035], [-0.1, 1.11, 0.03], [-0.09, 1.135, 0.035]], haustra(0.016), { radial: 14 }), { overview: 'Ascends on the right posterior abdominal wall from the caecum to the hepatic flexure; retroperitoneal.', facts: { function: 'Water & electrolyte absorption', bloodSupply: 'Ileocolic and right colic arteries (SMA)' } }));
  out.push(organ(G, 'transverse-colon', 'Transverse colon', 'colon transversum', 'abdomen', () => tube([[-0.09, 1.135, 0.035], [-0.07, 1.08, 0.085], [-0.02, 1.05, 0.1], [0.04, 1.06, 0.095], [0.085, 1.12, 0.06], [0.1, 1.15, 0.02]], haustra(0.016), { radial: 14 }), { overview: 'Mobile loop suspended by the transverse mesocolon between the hepatic and splenic flexures.', facts: { function: 'Water absorption; stool formation', bloodSupply: 'Middle colic (SMA) and left colic (IMA) arteries — watershed at the splenic flexure' } }));
  out.push(organ(G, 'descending-colon', 'Descending colon', 'colon descendens', 'abdomen', () => tube([[0.1, 1.15, 0.02], [0.11, 1.08, 0.02], [0.108, 1.0, 0.03]], haustra(0.014), { radial: 14 }), { overview: 'Descends on the left posterior abdominal wall from the splenic flexure; retroperitoneal.', facts: { function: 'Stores and moves faeces', bloodSupply: 'Left colic artery (IMA)' } }));
  out.push(organ(G, 'sigmoid-colon', 'Sigmoid colon', 'colon sigmoideum', 'pelvis', () => tube([[0.108, 1.0, 0.03], [0.09, 0.955, 0.06], [0.05, 0.95, 0.065], [0.025, 0.97, 0.03], [0.008, 0.955, -0.035]], haustra(0.013), { radial: 14 }), { overview: 'S-shaped mobile segment on its own mesentery, from the pelvic brim to S3.', facts: { function: 'Stores faeces before defecation', bloodSupply: 'Sigmoid arteries (IMA)' }, note: 'The commonest site of diverticular disease and of volvulus in the elderly.' }));
  out.push(organ(G, 'rectum', 'Rectum', 'rectum', 'pelvis', () => tube([[0.008, 0.955, -0.035], [0.0, 0.92, -0.05], [0.0, 0.89, -0.042], [0.0, 0.872, -0.025]], (t) => 0.014 + 0.004 * Math.sin(Math.PI * t), { radial: 14 }), { overview: 'Final 12–15 cm of the large intestine, following the sacral curve, ending at the anal canal.', facts: { function: 'Temporary storage of faeces; defecation reflex', bloodSupply: 'Superior (IMA), middle and inferior rectal arteries' }, note: 'Digital rectal examination palpates the prostate (in males) and rectal masses.' }));
  out.push(organ(G, 'liver', 'Liver', 'hepar', 'abdomen', () => blob([-0.045, 1.19, 0.02], [0.105, 0.062, 0.078], { w: 40, h: 26, noise: 0.03, seed: 5, // thin left lobe, flattened visceral (inferior) surface, domed diaphragmatic surface
          deform: (d) => (1 - 0.45 * Math.max(0, d.x) * (d.y < 0.3 ? 1 : 0.6)) * (d.y < -0.2 ? 0.82 : 1) * (d.y > 0.4 ? 1.05 : 1) }), { taId: 'A05.8.01.001', overview: 'Largest gland and internal organ (~1.5 kg) in the right upper quadrant under the diaphragm; right, left, caudate and quadrate lobes.', facts: { function: 'Metabolism, bile production, protein synthesis (albumin, clotting factors), detoxification, glycogen storage', bloodSupply: 'Hepatic artery proper (25%) and hepatic portal vein (75%); drains via hepatic veins to the IVC', innervation: 'Hepatic plexus (vagus, coeliac sympathetic)' }, note: 'The liver edge descends on inspiration — palpate from the right iliac fossa upwards.' }));
  out.push(organ(G, 'gallbladder', 'Gallbladder', 'vesica biliaris', 'abdomen', () => blob([-0.055, 1.14, 0.062], [0.011, 0.024, 0.011], { rotate: [0.5, 0, 0.3], deform: (d) => (d.y > 0 ? 0.8 : 1) }), { overview: 'Pear-shaped sac on the visceral surface of the liver storing and concentrating bile.', facts: { function: 'Stores and concentrates bile; contracts after fatty meals (CCK)', bloodSupply: 'Cystic artery (usually from the right hepatic artery)' }, note: 'Murphy’s sign: inspiration halts with pain on palpation of the right subcostal region in cholecystitis.' }));
  out.push(organ(G, 'pancreas', 'Pancreas', 'pancreas', 'abdomen', () => tube([[-0.04, 1.08, 0.025], [-0.02, 1.1, 0.025], [0.02, 1.115, 0.01], [0.06, 1.13, -0.005], [0.085, 1.145, -0.02]], (t) => 0.015 - t * 0.008, { radial: 12 }), { overview: 'Retroperitoneal gland (head, neck, body, tail) behind the stomach; head in the duodenal C-loop.', facts: { function: 'Exocrine: digestive enzymes; endocrine: insulin, glucagon, somatostatin (islets of Langerhans)', bloodSupply: 'Pancreaticoduodenal and splenic artery branches' }, note: 'Pancreatitis pain radiates to the back; causes include gallstones and alcohol.' }));
  return out;
}

/* ======================= URINARY ======================= */
export function buildUrinary(): StructureDef[] {
  const out: StructureDef[] = [];
  const U = 'urinary' as const;
  for (const { s, side, tag } of SIDES) {
    const y = s > 0 ? 1.14 : 1.125; // right kidney lower (liver)
    out.push(
      organ(U, `kidney-${tag}`, 'Kidney', 'ren', 'abdomen', () => blob(sx([0.062, y, -0.04], s), [0.026, 0.054, 0.02], { w: 28, h: 20, rotate: [0, -0.5 * s, -0.18 * s], deform: (d) => { const t = Math.min(1, Math.max(0, (-d.x * s - 0.35) / 0.5)); return 1 - 0.3 * t * t * (3 - 2 * t) * Math.exp(-Math.pow(d.y / 0.3, 2)); } }), {
        side,
        taId: 'A08.1.01.001',
        overview: 'Bean-shaped retroperitoneal organ at T12–L3; ~1 million nephrons filter the blood.',
        facts: { function: 'Filters blood, forms urine, regulates fluid, electrolytes, acid–base and blood pressure (renin); produces erythropoietin and calcitriol', bloodSupply: 'Renal artery (from the aorta at L1/L2); renal vein to the IVC', innervation: 'Renal plexus (T10–L1 sympathetic)' },
        note: 'Renal (loin-to-groin) colic is caused by a stone in the ureter; the renal angle is tender in pyelonephritis.',
      }),
    );
    out.push(organ(U, `adrenal-gland-${tag}`, 'Suprarenal (adrenal) gland', 'glandula suprarenalis', 'abdomen', () => blob(sx([0.05, y + 0.06, -0.035], s), [0.016, 0.012, 0.008], { deform: (d) => (d.y > 0.2 ? 0.7 + 0.3 * (1 - d.y) : 1) }), { side, overview: 'Endocrine gland capping the superior pole of the kidney (cortex and medulla).', facts: { function: 'Cortex: aldosterone, cortisol, androgens; medulla: adrenaline & noradrenaline', bloodSupply: 'Superior, middle and inferior suprarenal arteries' }, note: 'A phaeochromocytoma (medullary tumour) causes episodic hypertension, headache and sweating.' }));
    out.push(organ(U, `ureter-${tag}`, 'Ureter', 'ureter', 'abdomen', () => tube([sx([0.05, y - 0.01, -0.025], s), sx([0.045, 1.06, -0.005], s), sx([0.048, 0.99, 0.0], s), sx([0.055, 0.94, -0.01], s), sx([0.03, 0.905, 0.035], s)], 0.0022, { radial: 7 }), { side, overview: 'Muscular tube (~25 cm) conveying urine from the renal pelvis to the bladder.', facts: { function: 'Peristaltic transport of urine', course: 'Descends on psoas major, crosses the pelvic brim at the bifurcation of the common iliac artery, passes under the uterine artery / vas deferens' }, note: 'Stones lodge at the pelviureteric junction, the pelvic brim and the vesicoureteric junction. “Water under the bridge” — the ureter passes under the uterine artery.' }));
  }
  out.push(organ(U, 'urinary-bladder', 'Urinary bladder', 'vesica urinaria', 'pelvis', () => blob([0, 0.915, 0.048], [0.034, 0.03, 0.03], { noise: 0.04, deform: (d) => (d.y < -0.5 ? 0.85 : 1) }), { overview: 'Hollow muscular reservoir in the anterior pelvis (detrusor muscle); normal capacity 400–600 mL.', facts: { function: 'Stores and expels urine (micturition)', bloodSupply: 'Superior and inferior vesical arteries', innervation: 'Parasympathetic (S2–S4, contraction), sympathetic (T11–L2, storage)' }, note: 'A distended bladder rises above the pubic symphysis and is dull to percussion — suprapubic catheters are inserted here.' }));
  out.push(organ(U, 'urethra-male', 'Urethra (male)', 'urethra masculina', 'pelvis', () => tube([[0, 0.888, 0.045], [0, 0.865, 0.05], [0, 0.85, 0.075], [0, 0.86, 0.1], [0, 0.82, 0.118], [0, 0.79, 0.12]], 0.0022, { radial: 7 }), { sex: 'male', overview: 'About 20 cm long: prostatic, membranous and spongy (penile) parts.', facts: { function: 'Conveys urine and semen' }, note: 'Catheterisation must negotiate two curves; prostatic enlargement narrows the prostatic urethra.' }));
  out.push(organ(U, 'urethra-female', 'Urethra (female)', 'urethra feminina', 'pelvis', () => tube([[0, 0.888, 0.045], [0, 0.87, 0.055], [0, 0.858, 0.065]], 0.0025, { radial: 7 }), { sex: 'female', overview: 'Short (~4 cm) canal from the bladder neck to the external urethral orifice anterior to the vagina.', facts: { function: 'Conveys urine' }, note: 'Its short length explains the higher incidence of urinary tract infections in women.' }));
  return out;
}

/* ======================= REPRODUCTIVE ======================= */
export function buildReproductive(): StructureDef[] {
  const out: StructureDef[] = [];
  const P = 'reproductive' as const;
  // male
  out.push(organ(P, 'prostate', 'Prostate', 'prostata', 'pelvis', () => blob([0, 0.875, 0.045], [0.017, 0.014, 0.013]), { sex: 'male', overview: 'Walnut-sized gland surrounding the prostatic urethra below the bladder.', facts: { function: 'Secretes slightly alkaline fluid forming ~30% of semen (incl. PSA)', bloodSupply: 'Inferior vesical and middle rectal arteries' }, note: 'Benign prostatic hyperplasia (transition zone) causes urinary symptoms; carcinoma usually arises in the peripheral zone, palpable on DRE.' }));
  out.push(organ(P, 'penis', 'Penis', 'penis', 'pelvis', () => merge([tube([[0, 0.865, 0.095], [0, 0.85, 0.11], [0, 0.81, 0.125], [0, 0.79, 0.125]], 0.014, { radial: 14 }), blob([0, 0.785, 0.125], [0.015, 0.012, 0.015])]), { sex: 'male', overview: 'Root, body (two corpora cavernosa, one corpus spongiosum) and glans.', facts: { function: 'Copulation and urination', bloodSupply: 'Internal pudendal artery (deep and dorsal arteries)', innervation: 'Pudendal nerve; pelvic splanchnic nerves (erection)' } }));
  for (const { s, side, tag } of SIDES) {
    out.push(organ(P, `testis-${tag}`, 'Testis', 'testis', 'pelvis', () => blob(sx([0.016, 0.82, 0.098], s), [0.012, 0.02, 0.014]), { side, sex: 'male', overview: 'Oval gonad in the scrotum producing sperm and testosterone.', facts: { function: 'Spermatogenesis (seminiferous tubules); testosterone (Leydig cells)', bloodSupply: 'Testicular artery (from the aorta at L2)', drainage: 'Pampiniform plexus → testicular vein (left into the left renal vein, right into the IVC)' }, note: 'Testicular torsion is a surgical emergency (6-hour window); lymph drains to para-aortic, not inguinal, nodes.' }));
    out.push(organ(P, `vas-deferens-${tag}`, 'Ductus (vas) deferens', 'ductus deferens', 'pelvis', () => tube([sx([0.022, 0.82, 0.088], s), sx([0.03, 0.88, 0.085], s), sx([0.06, 0.925, 0.075], s), sx([0.06, 0.95, 0.04], s), sx([0.03, 0.93, 0.02], s), sx([0.008, 0.885, 0.04], s)], 0.0018, { radial: 6 }), { side, sex: 'male', overview: 'Muscular duct conveying sperm from the epididymis through the inguinal canal to the ejaculatory duct.', facts: { function: 'Transports sperm', course: 'Spermatic cord → deep inguinal ring → crosses over the ureter → joins seminal vesicle duct' }, note: 'Divided in vasectomy through a small scrotal incision.' }));
    out.push(organ(P, `seminal-vesicle-${tag}`, 'Seminal vesicle', 'glandula vesiculosa', 'pelvis', () => blob(sx([0.022, 0.9, 0.012], s), [0.016, 0.007, 0.007], { rotate: [0, 0, 0.5 * s] }), { side, sex: 'male', overview: 'Coiled gland behind the bladder.', facts: { function: 'Produces ~60–70% of seminal fluid (fructose-rich)' } }));
    // female
    out.push(organ(P, `ovary-${tag}`, 'Ovary', 'ovarium', 'pelvis', () => blob(sx([0.058, 0.965, 0.01], s), [0.012, 0.008, 0.016]), { side, sex: 'female', overview: 'Almond-shaped gonad on the lateral pelvic wall (ovarian fossa).', facts: { function: 'Oogenesis; oestrogen and progesterone production', bloodSupply: 'Ovarian artery (aorta) and ovarian branch of the uterine artery' }, note: 'Ovarian pain may be referred to the medial thigh via the obturator nerve.' }));
    out.push(organ(P, `uterine-tube-${tag}`, 'Uterine (Fallopian) tube', 'tuba uterina', 'pelvis', () => tube([sx([0.02, 0.985, 0.03], s), sx([0.045, 0.99, 0.025], s), sx([0.068, 0.98, 0.015], s), sx([0.065, 0.965, 0.0], s)], (t) => 0.0022 + t * 0.003, { radial: 7 }), { side, sex: 'female', overview: 'Tube (~10 cm) from the uterine cornu to the ovary: intramural part, isthmus, ampulla, infundibulum with fimbriae.', facts: { function: 'Captures the ovum; site of fertilisation (ampulla); transports the embryo' }, note: 'The ampulla is the commonest site of ectopic pregnancy — a cause of acute abdomen in women of reproductive age.' }));
    out.push(organ(P, `mammary-gland-${tag}`, 'Mammary gland', 'glandula mammaria', 'thorax', () => blob(sx([0.082, 1.3, 0.13], s), [0.05, 0.048, 0.038], { noise: 0.04, deform: (d) => (d.z < -0.2 ? 0.6 : 1) }), { side, sex: 'female', overview: 'Modified apocrine gland in the superficial fascia of the anterior chest wall (ribs 2–6).', facts: { function: 'Milk production and secretion (lactation)', bloodSupply: 'Internal thoracic, lateral thoracic and thoraco-acromial arteries', drainage: 'Lymph ~75% to axillary nodes, remainder to parasternal nodes' }, note: 'Most breast cancers arise in the upper outer quadrant (axillary tail of Spence).' }));
  }
  out.push(organ(P, 'uterus', 'Uterus', 'uterus', 'pelvis', () => blob([0, 0.96, 0.04], [0.026, 0.036, 0.019], { rotate: [0.5, 0, 0], deform: (d) => (d.y < 0 ? 1 - 0.45 * -d.y : 1) }), { sex: 'female', overview: 'Thick-walled muscular organ (fundus, body, cervix), normally anteverted and anteflexed over the bladder.', facts: { function: 'Implantation and nourishment of the embryo; menstruation; labour contractions', bloodSupply: 'Uterine artery (internal iliac) and ovarian artery' }, note: 'The uterine artery crosses above the ureter near the cervix — at risk of ligation during hysterectomy.' }));
  out.push(organ(P, 'vagina', 'Vagina', 'vagina', 'pelvis', () => tube([[0, 0.935, 0.02], [0, 0.9, 0.03], [0, 0.865, 0.045]], 0.011, { radial: 12 }), { sex: 'female', overview: 'Fibromuscular canal from the cervix to the vestibule.', facts: { function: 'Birth canal; menstrual outflow; copulation' } }));
  return out;
}
