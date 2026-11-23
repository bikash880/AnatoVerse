import type { GridLayout } from './explode';

/**
 * Explode state shared between BodyModel (writer) and the overlays (readers: grid headers,
 * name labels). Kept in its own module so component files only export components (Fast Refresh).
 */
export const explodeShared: { t: number; grid: GridLayout | null; version: number } = { t: 0, grid: null, version: 0 };
