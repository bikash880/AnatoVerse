/**
 * Model bootstrap: reads public/models/manifest.json (written by `npm run build:models`) before
 * the app renders, so the catalog (search, counts, quiz…) already describes the real meshes.
 */
import { setExternalCatalog } from './anatomy/catalog';
import type { Sex, StructureKind, StructureRecord } from './types';

export interface ModelManifest {
  male?: Record<string, string>;
  female?: Record<string, string>;
  organs?: Record<string, string>;
  credit?: string;
}

let manifest: ModelManifest | null = null;
export const getModelManifest = () => manifest;
export const modelUrl = (rel: string) => `${import.meta.env.BASE_URL}models/${rel}`;

export async function initModels() {
  try {
    const res = await fetch(modelUrl('manifest.json'));
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return;
    manifest = (await res.json()) as ModelManifest;
    for (const sex of ['male', 'female'] as Sex[]) {
      if (!manifest[sex] || !Object.keys(manifest[sex]!).length) continue;
      const cat = await fetch(modelUrl(`${sex}/catalog.json`));
      if (cat.ok) setExternalCatalog(sex, (await cat.json()) as (StructureRecord & { kind: StructureKind })[]);
    }
  } catch {
    manifest = null; // no models built → procedural reference model
  }
}
