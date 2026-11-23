/**
 * Cross-component actions that touch both the store and the 3D scene.
 */
import { useAtlasStore } from './store/useAtlasStore';
import { getStructure } from './anatomy/catalog';
import { ensureSystem, getEntry } from './three/meshRegistry';
import { focusObject } from './three/cameraRig';

/**
 * Make a structure visible (turning on its system, peeling layers, clearing filters that hide
 * it), load its system if needed, select it and fly the camera to it.
 */
export async function revealAndFocus(id: string, opts: { select?: boolean } = {}) {
  const st = useAtlasStore.getState();
  const def = getStructure(st.sex, id);
  if (!def) return;
  if (!st.visibleSystems[def.system]) st.toggleSystem(def.system, true);
  if (def.layer < Math.floor(st.layerDepth)) st.setLayerDepth(def.layer);
  if (st.activeRegion && st.activeRegion !== def.region) st.setRegion(null);
  if (st.isolateIds && !st.isolateIds.includes(id)) st.isolate(null);
  if (st.hiddenIds.includes(id)) useAtlasStore.setState({ hiddenIds: st.hiddenIds.filter((h) => h !== id) });
  await ensureSystem(st.sex, def.system);
  useAtlasStore.getState().markLoaded(st.sex, def.system);
  if (opts.select !== false) useAtlasStore.getState().select(id);
  // wait a frame so the explode/visibility pass has positioned the mesh
  requestAnimationFrame(() => {
    const e = getEntry(useAtlasStore.getState().sex, id);
    if (e) focusObject(e.mesh);
  });
}

export function focusSelected() {
  const st = useAtlasStore.getState();
  const e = getEntry(st.sex, st.selectedId);
  if (e) focusObject(e.mesh);
}
