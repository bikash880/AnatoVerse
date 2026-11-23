/**
 * Explode view.
 *   0 – 60 %  : every part moves radially away from the body centre (eased).
 *   60 – 100 %: parts glide from their radial positions into a flat "parts catalogue" grid
 *               facing the camera, grouped by system and sorted by size.
 * Positions are written directly to mesh.position in useFrame (no React work per mesh).
 */
import * as THREE from 'three';
import { GROUPS, type GroupId } from '../data/systems';
import type { Entry } from './meshRegistry';

export const RADIAL_END = 0.6;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface GridItem {
  id: string;
  /** world-space centre of the part in the grid */
  center: THREE.Vector3;
  /** part footprint (world units, screen plane) */
  w: number;
  h: number;
  /** full cell width available for the name underneath */
  cellW: number;
  group: GroupId;
}

export interface GridLayout {
  targets: Map<string, THREE.Vector3>;
  items: GridItem[];
  /** column headers, anchored at the column's top-left corner */
  labels: { id: GroupId; label: string; position: THREE.Vector3; width: number; count: number }[];
  bounds: THREE.Box3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

/** Centroid of the visible body (AABB centre of original positions). */
export function bodyCenter(list: Entry[]) {
  const box = new THREE.Box3();
  for (const e of list) box.expandByPoint(e.orig);
  return box.isEmpty() ? new THREE.Vector3(0, 0.95, 0) : box.getCenter(new THREE.Vector3());
}

/* Grid spacing (world metres). Every cell reserves a band under the part for its name. */
const GAP_X = 0.018;
const GAP_Y = 0.01;
const NAME_BAND = 0.036; // room for two lines of name text
const MIN_CELL_W = 0.075;
export const COLUMN_GAP = 0.24;

/**
 * Shelf-pack every visible part into five labelled columns (Bones, Muscles, Nerves, Vessels,
 * Organs — grouped by body system so counts match the Systems tab), laid out left→right in
 * the camera's screen plane (`right`, `up`) around `center`.
 */
export function computeGrid(list: Entry[], center: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): GridLayout {
  const targets = new Map<string, THREE.Vector3>();
  const items: GridItem[] = [];
  const labels: GridLayout['labels'] = [];
  const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  // projected footprint of an AABB onto the screen plane
  const foot = (e: Entry) => {
    let w = 0;
    let h = 0;
    for (let i = 0; i < 3; i++) {
      const s = e.size.getComponent(i);
      w += Math.abs(right.dot(ax[i])) * s;
      h += Math.abs(up.dot(ax[i])) * s;
    }
    w = Math.max(w, 0.012);
    h = Math.max(h, 0.012);
    return { w, h, cw: Math.max(w, MIN_CELL_W), ch: h + NAME_BAND };
  };

  type Cell = { e: Entry; x: number; y: number; w: number; h: number; cw: number; ch: number };
  type Block = { id: GroupId; label: string; cells: Cell[]; w: number; h: number };
  const groups = GROUPS.map((g) =>
    list
      .filter((e) => g.systems.includes(e.def.system))
      .map((e) => ({ e, ...foot(e), x: 0, y: 0 }))
      .sort((a, b) => b.h - a.h || b.w - a.w),
  );
  const areaOf = (cells: Cell[]) => cells.reduce((s, c) => s + (c.cw + GAP_X) * (c.ch + GAP_Y), 0);
  // common column height → a wide band that suits a landscape screen
  const targetH = Math.max(0.55, Math.sqrt(groups.reduce((s, c) => s + areaOf(c), 0) * 0.34));
  const blocks: Block[] = [];
  const natural = groups.map((cells) => (cells.length ? Math.max((areaOf(cells) / targetH) * 1.1, Math.max(...cells.map((c) => c.cw)) + GAP_X) : 0));
  // no column narrower than ~14 % of the grid, so every header stays readable
  const minColW = Math.max(0.3, 0.14 * natural.reduce((s, w) => s + w, 0));
  GROUPS.forEach((g, gi) => {
    const cells = groups[gi];
    if (!cells.length) return;
    const maxW = Math.max(natural[gi], minColW);
    let x = 0;
    let y = 0;
    let rowH = 0;
    let blockW = 0;
    for (const c of cells) {
      if (x > 0 && x + c.cw > maxW) {
        y += rowH + GAP_Y;
        x = 0;
        rowH = 0;
      }
      c.x = x + c.cw / 2;
      c.y = y + c.h / 2; // part sits at the top of its cell, name band below
      x += c.cw + GAP_X;
      rowH = Math.max(rowH, c.ch);
      blockW = Math.max(blockW, x - GAP_X);
    }
    blocks.push({ id: g.id, label: g.label, cells, w: Math.max(blockW, minColW), h: y + rowH });
  });

  const totalW = blocks.reduce((s, b) => s + b.w, 0) + COLUMN_GAP * Math.max(0, blocks.length - 1);
  const totalH = Math.max(0, ...blocks.map((b) => b.h));
  const bounds = new THREE.Box3();
  let bx = -totalW / 2;
  const top = totalH / 2;
  for (const b of blocks) {
    for (const c of b.cells) {
      const p = center.clone().addScaledVector(right, bx + c.x).addScaledVector(up, top - c.y);
      targets.set(c.e.def.id, p);
      items.push({ id: c.e.def.id, center: p, w: c.w, h: c.h, cellW: c.cw, group: b.id });
      bounds.expandByPoint(p.clone().addScaledVector(right, c.cw / 2).addScaledVector(up, c.h / 2));
      bounds.expandByPoint(p.clone().addScaledVector(right, -c.cw / 2).addScaledVector(up, -c.h / 2 - NAME_BAND));
    }
    const headerPos = center.clone().addScaledVector(right, bx).addScaledVector(up, top + 0.045);
    bounds.expandByPoint(headerPos.clone().addScaledVector(up, 0.04));
    labels.push({ id: b.id, label: b.label, count: b.cells.length, position: headerPos, width: b.w });
    bx += b.w + COLUMN_GAP;
  }
  return { targets, items, labels, bounds, right: right.clone(), up: up.clone() };
}

const tmp = new THREE.Vector3();
const radialPos = new THREE.Vector3();

/** Write exploded positions for all entries. `t` is 0..1. */
export function applyExplode(list: Entry[], t: number, center: THREE.Vector3, grid: GridLayout | null) {
  const kr = easeOut(Math.min(1, t / RADIAL_END));
  const kg = t > RADIAL_END ? easeInOut((t - RADIAL_END) / (1 - RADIAL_END)) : 0;
  for (const e of list) {
    // radial: scale the offset from the centre and add a constant push so central parts separate too
    tmp.copy(e.orig).sub(center);
    const len = tmp.length() || 1e-4;
    radialPos
      .copy(e.orig)
      .addScaledVector(tmp, 0.85 * kr)
      .addScaledVector(tmp.divideScalar(len), 0.12 * kr);
    if (kg > 0 && grid) {
      const g = grid.targets.get(e.def.id);
      if (g) radialPos.lerp(g, kg);
    }
    e.mesh.position.copy(radialPos);
  }
}
