import type { RegionId, StructureKind, SystemId } from '../types';

export interface SystemMeta {
  id: SystemId;
  label: string;
  /** Colour of the dot in the UI. */
  dot: string;
  /** Shown in the Systems tab (skin is controlled by the Layers slider instead). */
  listed: boolean;
}

/** Order here = order in the Systems tab. */
export const SYSTEMS: SystemMeta[] = [
  { id: 'skeletal', label: 'Skeletal', dot: '#EDE6D6', listed: true },
  { id: 'muscular', label: 'Muscular', dot: '#E0565B', listed: true },
  { id: 'nervous', label: 'Nervous', dot: '#F5D04C', listed: true },
  { id: 'cardiovascular', label: 'Cardiovascular', dot: '#E0434B', listed: true },
  { id: 'respiratory', label: 'Respiratory', dot: '#F2A7B5', listed: true },
  { id: 'digestive', label: 'Digestive', dot: '#EE9AA8', listed: true },
  { id: 'urinary', label: 'Urinary', dot: '#D98AA0', listed: true },
  { id: 'lymphatic', label: 'Lymphatic', dot: '#4ADE80', listed: true },
  { id: 'reproductive', label: 'Reproductive', dot: '#F0B5C8', listed: true },
  { id: 'integumentary', label: 'Skin', dot: '#E8C1A0', listed: false },
];

export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((s) => [s.id, s])) as Record<SystemId, SystemMeta>;

/** Base surface colours per structure kind (arteries red, veins blue, etc.). */
export const KIND_COLORS: Record<StructureKind, string> = {
  bone: '#E9E1CF',
  cartilage: '#C9DDE3',
  muscle: '#B8383F',
  nerve: '#F2CC3D',
  artery: '#D42A34',
  vein: '#2F64D6',
  organ: '#E58A9A',
  lymph: '#3FCB72',
  skin: '#E3B391',
};

export const REGIONS: { id: RegionId; label: string }[] = [
  { id: 'head-neck', label: 'Head & Neck' },
  { id: 'thorax', label: 'Thorax' },
  { id: 'abdomen', label: 'Abdomen' },
  { id: 'pelvis', label: 'Pelvis' },
  { id: 'back', label: 'Back' },
  { id: 'upper-limb', label: 'Upper Limb' },
  { id: 'lower-limb', label: 'Lower Limb' },
];

export const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.id, r.label])) as Record<RegionId, string>;

export const LAYERS = ['Skin', 'Superficial muscles', 'Deep muscles', 'Organs', 'Skeleton'] as const;

export type GroupId = 'bones' | 'muscles' | 'nerves' | 'vessels' | 'organs';

/**
 * The five display groups used by the exploded parts grid AND by name labels. They are defined
 * by body system (not by tissue kind) so every count matches the Systems tab exactly:
 * Bones = Skeletal, Muscles = Muscular, Nerves = Nervous, Vessels = Cardiovascular + Lymphatic,
 * Organs = Respiratory + Digestive + Urinary + Reproductive + Skin.
 */
export const GROUPS: { id: GroupId; label: string; systems: SystemId[]; color: string }[] = [
  { id: 'bones', label: 'Bones', systems: ['skeletal'], color: '#EDE6D6' },
  { id: 'muscles', label: 'Muscles', systems: ['muscular'], color: '#E0565B' },
  { id: 'nerves', label: 'Nerves', systems: ['nervous'], color: '#F5D04C' },
  { id: 'vessels', label: 'Vessels', systems: ['cardiovascular', 'lymphatic'], color: '#3B82F6' },
  { id: 'organs', label: 'Organs', systems: ['respiratory', 'digestive', 'urinary', 'reproductive', 'integumentary'], color: '#F2A7B5' },
];

export const GROUP_OF_SYSTEM = Object.fromEntries(GROUPS.flatMap((g) => g.systems.map((s) => [s, g.id]))) as Record<SystemId, GroupId>;
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, (typeof GROUPS)[number]>;
