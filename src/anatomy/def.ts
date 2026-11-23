import type * as THREE from 'three';
import type { Facts, LayerIndex, RegionId, Sex, Side, StructureDef, StructureKind, SystemId } from '../types';

/** Default clinical notes per structure kind, used when no curated note exists. */
const DEFAULT_NOTE: Record<StructureKind, string> = {
  bone: 'Fractures are assessed with plain radiographs in two perpendicular views; always check neurovascular status distal to the injury.',
  cartilage: 'Avascular cartilage heals poorly; degeneration contributes to osteoarthritis and disc herniation.',
  muscle: 'Test strength on the MRC 0–5 scale; weakness in a muscle group helps localise a nerve or root lesion.',
  nerve: 'Assess dermatomes, myotomes and reflexes to localise a lesion along the nerve’s course.',
  artery: 'Palpate distal pulses and check capillary refill when this vessel may be compromised.',
  vein: 'Venous stasis in deep veins predisposes to thrombosis (DVT) and pulmonary embolism.',
  organ: 'Imaging (ultrasound, CT, MRI) and laboratory markers are combined to assess organ function.',
  lymph: 'Enlarged (>1 cm), hard or fixed lymph nodes warrant investigation for infection or malignancy.',
  skin: 'Skin integrity is checked in every pressure-area assessment (e.g. Braden scale).',
};

export interface DefInput {
  id: string;
  nameEn: string;
  nameLatin: string;
  system: SystemId;
  kind: StructureKind;
  region: RegionId;
  layer: LayerIndex;
  side?: Side;
  sex?: Sex | 'both';
  taId?: string | null;
  overview?: string;
  clinicalNote?: string;
  facts?: Facts;
  build: () => THREE.BufferGeometry;
}

export function makeDef(d: DefInput): StructureDef {
  return {
    taId: null,
    side: 'midline',
    sex: 'both',
    meshFile: 'procedural',
    overview: '',
    clinicalNote: DEFAULT_NOTE[d.kind],
    facts: {},
    ...d,
  };
}

export const SIDES = [
  { s: 1, side: 'left' as Side, tag: 'l', lat: 'sinister' },
  { s: -1, side: 'right' as Side, tag: 'r', lat: 'dexter' },
];

/** Display label including side, e.g. "Serratus anterior (R)". */
export function displayName(d: { nameEn: string; side: Side }) {
  return d.side === 'midline' ? d.nameEn : `${d.nameEn} (${d.side === 'left' ? 'L' : 'R'})`;
}
