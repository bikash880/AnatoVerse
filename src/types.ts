import type * as THREE from 'three';

/** Body systems shown in the Systems tab. `integumentary` (skin) is driven by the Layers slider. */
export type SystemId =
  | 'skeletal'
  | 'muscular'
  | 'nervous'
  | 'cardiovascular'
  | 'respiratory'
  | 'digestive'
  | 'urinary'
  | 'lymphatic'
  | 'reproductive'
  | 'integumentary';

export type RegionId = 'head-neck' | 'thorax' | 'abdomen' | 'pelvis' | 'back' | 'upper-limb' | 'lower-limb';

export type Side = 'left' | 'right' | 'midline';
export type Sex = 'male' | 'female';

/**
 * Depth layers peeled by the Layers slider (lower numbers are more superficial).
 * 0 skin · 1 superficial muscles · 2 deep muscles · 3 organs, vessels & nerves · 4 skeleton
 */
export type LayerIndex = 0 | 1 | 2 | 3 | 4;

/** Sub-kind used for colouring (arteries vs veins) and for grouping the exploded parts grid. */
export type StructureKind = 'bone' | 'cartilage' | 'muscle' | 'nerve' | 'artery' | 'vein' | 'organ' | 'lymph' | 'skin';

export type FactKey =
  | 'origin'
  | 'insertion'
  | 'action'
  | 'innervation'
  | 'bloodSupply'
  | 'articulations'
  | 'features'
  | 'function'
  | 'roots'
  | 'supplies'
  | 'branches'
  | 'drainage'
  | 'course';

export type Facts = Partial<Record<FactKey, string>>;

/** Record shape of src/data/structures.json (spec data model). */
export interface StructureRecord {
  id: string;
  nameEn: string;
  nameLatin: string;
  taId: string | null;
  system: SystemId;
  region: RegionId;
  layer: LayerIndex;
  side: Side;
  sex: Sex | 'both';
  /** GLB file this mesh lives in (per-system GLB), or "procedural" for the built-in model. */
  meshFile: string;
  overview: string;
  clinicalNote: string;
  facts: Facts;
  /** Foundational Model of Anatomy concept id (BodyParts3D meshes). */
  fmaId?: string;
  /** Where the geometry comes from. */
  source?: 'bodyparts3d' | 'reconstructed' | 'procedural';
}

/** Runtime structure: metadata + a lazy geometry factory. */
export interface StructureDef extends StructureRecord {
  kind: StructureKind;
  /** Builds the geometry in world space. Called lazily when the system is first shown. */
  build: () => THREE.BufferGeometry;
}

export interface Hotspot {
  number: number;
  label: string;
  description: string;
  position: [number, number, number];
  important?: boolean;
  /** Inside the organ (seen with cross-section) — not snapped to the outer surface. */
  internal?: boolean;
}

export interface OrganRecord {
  id: OrganId;
  nameEn: string;
  nameLatin: string;
  model: string;
  /** id of the matching structure in the full-body model (for "show in body"). */
  bodyStructureId?: string;
  animation: 'heartbeat' | 'breathing' | 'pulse' | 'peristalsis' | 'none';
  hotspots: Hotspot[];
}

export type OrganId = 'heart' | 'lungs' | 'brain' | 'kidneys' | 'liver' | 'stomach' | 'eye';

export type ViewPreset = 'front' | 'back' | 'left' | 'right' | 'threeQuarter';
