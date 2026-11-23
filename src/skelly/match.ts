/**
 * Map structure names returned by Skelly (English, e.g. "Femur", "Left ventricle") to
 * structures that exist in the 3D model.
 */
import Fuse from 'fuse.js';
import { getCatalog } from '../anatomy/catalog';
import type { Sex, StructureDef } from '../types';

const cache = new Map<Sex, Fuse<StructureDef>>();

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\((left|right|l|r)\)/g, '')
    .replace(/^(left|right)\s+/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Returns catalog ids, best first (max 3). For paired structures the side the user is already
 * looking at (current selection) is preferred, then the left side.
 */
export function matchStructures(names: string[], sex: Sex, selectedId: string | null): string[] {
  const cat = getCatalog(sex);
  let fuse = cache.get(sex);
  if (!fuse) {
    fuse = new Fuse(cat.list.filter((d) => d.kind !== 'skin'), {
      keys: [
        { name: 'nameEn', weight: 0.7 },
        { name: 'nameLatin', weight: 0.3 },
      ],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
    });
    cache.set(sex, fuse);
  }
  const selected = selectedId ? cat.byId.get(selectedId) : undefined;
  const out: string[] = [];
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    const wantSide = /\bleft\b|\(l\)/i.test(raw) ? 'left' : /\bright\b|\(r\)/i.test(raw) ? 'right' : null;
    // 1) exact name match (ignoring side words)
    let candidates = cat.list.filter((d) => norm(d.nameEn) === n || norm(d.nameLatin) === n);
    // 2) fuzzy
    if (!candidates.length) {
      const best = fuse.search(n, { limit: 6 });
      if (best.length && (best[0].score ?? 1) < 0.3) candidates = best.filter((r) => r.item.nameEn === best[0].item.nameEn).map((r) => r.item);
    }
    if (!candidates.length) continue;
    const pick =
      (selected && candidates.find((d) => d.id === selected.id)) ??
      (wantSide && candidates.find((d) => d.side === wantSide)) ??
      (selected && candidates.find((d) => d.side === selected.side)) ??
      candidates.find((d) => d.side === 'left') ??
      candidates[0];
    if (!out.includes(pick.id)) out.push(pick.id);
    if (out.length >= 3) break;
  }
  return out;
}
