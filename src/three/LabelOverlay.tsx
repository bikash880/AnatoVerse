/**
 * Name labels for many structures at once (label modes "Group" and "All").
 *
 * Performance strategy (60 fps with 1,000+ structures):
 *  • Nothing is computed while the camera or the explode animation is moving — labels fade out
 *    and are rebuilt once the view has settled (~180 ms).
 *  • Visibility comes from a single low-resolution ID-buffer render: every visible mesh is drawn
 *    with a unique flat colour, the pixels are read back once, and each structure's visible pixel
 *    count + nearest-to-centroid pixel give (a) whether it faces the camera and is not hidden
 *    behind other parts, (b) how big it is on screen (the zoom threshold) and (c) a label anchor
 *    that lies on its visible surface. Front view therefore labels front-facing parts, Back view
 *    back-facing ones.
 *  • Labels are plain DOM written in one go (no React re-render, no per-label <Html>).
 *
 * Assembled / radial explode: callout labels in left & right columns beside the body with leader
 * lines, de-overlapped by a 1-D relaxation. Parts grid (explode ≈ 100 %): the name under each
 * cell, shown only when the cell is wide enough on screen to read it.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAtlasStore } from '../store/useAtlasStore';
import { GROUP_BY_ID, GROUP_OF_SYSTEM } from '../data/systems';
import { getEntries, getRoot, type Entry } from './meshRegistry';
import { explodeShared } from './explodeShared';
import { insets } from './cameraRig';
import { RADIAL_END } from './explode';
import { displayName } from '../anatomy/def';

const ID_SCALE = 3; // ID buffer resolution = canvas / 3
const MIN_PIXELS = 90; // CSS px² of visible surface needed for a callout (zoom threshold)
const SLOT = 19; // vertical spacing of callout labels (px)
const SETTLE_MS = 180;
const GRID_MIN_CELL_PX = 56; // grid names appear once a cell is wide enough to read (zoom threshold)
const GRID_MAX_LABELS = 450;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function wantStructure(e: Entry, mode: string, group: string) {
  if (mode === 'all') return true;
  return GROUP_OF_SYSTEM[e.def.system] === group;
}

function labelHtml(e: Entry, cls: string, style: string) {
  const color = GROUP_BY_ID[GROUP_OF_SYSTEM[e.def.system]].color;
  return `<div class="${cls}" style="${style}" data-id="${esc(e.def.id)}"><span class="av-dot" style="background:${color}"></span><span class="av-txt"><span class="av-en">${esc(displayName(e.def))}</span><span class="av-lat">${esc(e.def.nameLatin)}</span></span></div>`;
}

export function LabelOverlay() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  const dom = useRef<{ root: HTMLDivElement; svg: SVGSVGElement; labels: HTMLDivElement; hint: HTMLDivElement } | null>(null);
  const st = useRef({
    lastMat: new Float32Array(16),
    lastProj: new Float32Array(16),
    lastMove: 0,
    dirty: true,
    shown: false,
    key: '',
    rt: null as THREE.WebGLRenderTarget | null,
    buf: new Uint8Array(0),
    idMats: new Map<THREE.Mesh, THREE.MeshBasicMaterial>(),
  });

  // ---------- DOM container (sits over the canvas, under the HUD) ----------
  useEffect(() => {
    const host = gl.domElement.parentElement!;
    const root = document.createElement('div');
    root.className = 'av-labels';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'av-leaders');
    const labels = document.createElement('div');
    const hint = document.createElement('div');
    hint.className = 'av-hint';
    hint.textContent = 'Zoom in to read part names';
    root.append(svg, labels, hint);
    host.appendChild(root);
    // tap toggles the Latin name (hover does it with a mouse)
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement).closest('.av-label, .av-grid-label');
      if (el) el.classList.toggle('open');
    };
    root.addEventListener('click', onClick);
    dom.current = { root, svg, labels, hint };
    const s = st.current;
    return () => {
      root.removeEventListener('click', onClick);
      root.remove();
      s.rt?.dispose();
      s.idMats.forEach((m) => m.dispose());
      s.idMats.clear();
    };
  }, [gl]);

  useEffect(() => {
    st.current.dirty = true;
  }, [size]);

  const setShown = (v: boolean) => {
    const d = dom.current;
    if (!d || st.current.shown === v) return;
    st.current.shown = v;
    d.root.classList.toggle('show', v);
  };

  const clear = () => {
    const d = dom.current;
    if (!d) return;
    d.labels.innerHTML = '';
    d.svg.innerHTML = '';
    d.hint.style.display = 'none';
  };

  // ---------- ID buffer: which structures are visible, how big, and where ----------
  function idPass(list: Entry[]) {
    const s = st.current;
    const w = Math.max(32, Math.ceil(size.width / ID_SCALE));
    const h = Math.max(32, Math.ceil(size.height / ID_SCALE));
    if (!s.rt) s.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    if (s.rt.width !== w || s.rt.height !== h) s.rt.setSize(w, h);
    if (s.buf.length !== w * h * 4) s.buf = new Uint8Array(w * h * 4);

    const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    list.forEach((e, i) => {
      let m = s.idMats.get(e.mesh);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
        s.idMats.set(e.mesh, m);
      }
      const id = i + 1;
      m.color.setRGB(((id >> 16) & 255) / 255, ((id >> 8) & 255) / 255, (id & 255) / 255);
      saved.push([e.mesh, e.mesh.material]);
      e.mesh.material = m;
    });
    const prevTarget = gl.getRenderTarget();
    const prevColor = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    gl.setRenderTarget(s.rt);
    gl.setClearColor(0x000000, 1);
    gl.clear(true, true, true);
    gl.render(getRoot(useAtlasStore.getState().sex), camera);
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevColor, prevAlpha);
    for (const [mesh, mat] of saved) mesh.material = mat;
    gl.readRenderTargetPixels(s.rt, 0, 0, w, h, s.buf);

    const n = list.length + 1;
    const count = new Uint32Array(n);
    const sx = new Float64Array(n);
    const sy = new Float64Array(n);
    const buf = s.buf;
    for (let y = 0, p = 0; y < h; y++)
      for (let x = 0; x < w; x++, p += 4) {
        const id = (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2];
        if (id > 0 && id < n) {
          count[id]++;
          sx[id] += x;
          sy[id] += y;
        }
      }
    // anchor = the structure's own pixel nearest to its centroid (always on its visible surface)
    const best = new Float64Array(n).fill(Infinity);
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    for (let y = 0, p = 0; y < h; y++)
      for (let x = 0; x < w; x++, p += 4) {
        const id = (buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2];
        if (id > 0 && id < n) {
          const dx = x - sx[id] / count[id];
          const dy = y - sy[id] / count[id];
          const d = dx * dx + dy * dy;
          if (d < best[id]) {
            best[id] = d;
            ax[id] = x;
            ay[id] = y;
          }
        }
      }
    const kx = size.width / w;
    const ky = size.height / h;
    return list.map((e, i) => ({
      e,
      px: count[i + 1] * kx * ky, // visible area in CSS px²
      x: (ax[i + 1] + 0.5) * kx,
      y: (h - ay[i + 1] - 0.5) * ky, // GL rows are bottom-up
    }));
  }

  // ---------- callouts beside the body ----------
  function callouts(list: Entry[], mode: string, group: string, selectedId: string | null) {
    const d = dom.current!;
    const vis = idPass(list).filter((v) => v.px > 0);
    if (!vis.length) return clear();
    let minX = Infinity;
    let maxX = -Infinity;
    for (const v of vis) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
    }
    const phone = size.width < 768;
    const labelW = phone ? 112 : 168;
    const leftBound = phone ? 6 : 150; // keep clear of the pan pad
    const rightBound = size.width - insets.right - 6;
    const top = insets.top + 46;
    const bottom = size.height - insets.bottom - 8;
    const colL = Math.max(minX - 26, leftBound + labelW);
    const colR = Math.min(maxX + 26, rightBound - labelW);
    const mid = (minX + maxX) / 2;
    const capacity = Math.max(1, Math.floor((bottom - top) / SLOT));

    const cands = vis
      .filter((v) => v.px >= MIN_PIXELS && v.e.def.id !== selectedId && wantStructure(v.e, mode, group))
      .filter((v) => v.x > 0 && v.x < size.width - insets.right && v.y > insets.top && v.y < size.height - insets.bottom)
      .sort((a, b) => b.px - a.px); // biggest on screen first
    const sides: { L: typeof cands; R: typeof cands } = { L: [], R: [] };
    for (const c of cands) {
      const side = c.x < mid ? 'L' : 'R';
      if (sides[side].length < capacity) sides[side].push(c);
      else if (sides[side === 'L' ? 'R' : 'L'].length < capacity) sides[side === 'L' ? 'R' : 'L'].push(c);
    }

    let html = '';
    let paths = '';
    for (const side of ['L', 'R'] as const) {
      const items = sides[side].sort((a, b) => a.y - b.y);
      const ys = items.map((c) => Math.min(Math.max(c.y, top), bottom));
      // 1-D relaxation: push down to remove overlaps, then up from the bottom edge, then clamp
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + SLOT);
      if (ys.length && ys[ys.length - 1] > bottom) {
        ys[ys.length - 1] = bottom;
        for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - SLOT);
      }
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + SLOT, top);
      const col = side === 'L' ? colL : colR;
      items.forEach((c, i) => {
        const y = ys[i];
        const style = side === 'L' ? `right:${size.width - col}px;top:${y}px;max-width:${labelW}px` : `left:${col}px;top:${y}px;max-width:${labelW}px`;
        html += labelHtml(c.e, `av-label ${side === 'L' ? 'left' : 'right'}`, style);
        const elbow = side === 'L' ? col + 10 : col - 10;
        paths += `<path d="M${col} ${y} L${elbow} ${y} L${c.x} ${c.y}"/><circle cx="${c.x}" cy="${c.y}" r="2.2"/>`;
      });
    }
    d.labels.innerHTML = html;
    d.svg.innerHTML = paths;
    d.hint.style.display = 'none';
  }

  // ---------- names under every cell of the parts grid ----------
  function gridNames(mode: string, group: string) {
    const d = dom.current!;
    const grid = explodeShared.grid;
    if (!grid) return clear();
    const entries = getEntries(useAtlasStore.getState().sex);
    const v = new THREE.Vector3();
    const toPx = (p: THREE.Vector3) => {
      v.copy(p).project(camera);
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, v.z] as const;
    };
    let html = '';
    let shown = 0;
    let tooSmall = 0;
    const below = new THREE.Vector3();
    for (const it of grid.items) {
      const e = entries.get(it.id);
      if (!e || !e.mesh.visible || !wantStructure(e, mode, group)) continue;
      below.copy(it.center).addScaledVector(grid.up, -it.h / 2 - 0.003);
      const [x, y, z] = toPx(below);
      if (z > 1 || x < 0 || x > size.width - insets.right || y < insets.top || y > size.height - insets.bottom) continue;
      const [x2] = toPx(below.addScaledVector(grid.right, it.cellW));
      const cellPx = Math.abs(x2 - x);
      if (cellPx < GRID_MIN_CELL_PX) {
        tooSmall++;
        continue;
      }
      if (shown >= GRID_MAX_LABELS) break;
      shown++;
      html += labelHtml(e, 'av-grid-label', `left:${x}px;top:${y}px;width:${Math.min(cellPx * 1.12, 220)}px`);
    }
    d.labels.innerHTML = html;
    d.svg.innerHTML = '';
    d.hint.style.display = shown === 0 && tooSmall > 0 ? 'block' : 'none';
  }

  useFrame(() => {
    const d = dom.current;
    if (!d) return;
    const s = st.current;
    const a = useAtlasStore.getState();
    const active = (a.labelMode === 'group' || a.labelMode === 'all') && a.studyMode !== 'quiz' && !a.suppressLabel;
    if (!active) {
      if (s.shown) {
        setShown(false);
        clear();
      }
      s.dirty = true;
      return;
    }
    const now = performance.now();
    // movement detection: camera or explode animation changed since last frame
    const m = camera.matrixWorld.elements;
    const pm = camera.projectionMatrix.elements;
    let moved = false;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(m[i] - s.lastMat[i]) > 1e-5 || Math.abs(pm[i] - s.lastProj[i]) > 1e-6) moved = true;
      s.lastMat[i] = m[i];
      s.lastProj[i] = pm[i];
    }
    const key = `${a.labelMode}|${a.labelGroup}|${a.selectedId}|${explodeShared.version}|${explodeShared.t.toFixed(4)}|${size.width}x${size.height}`;
    if (key !== s.key) {
      s.key = key;
      moved = true;
    }
    if (moved) {
      s.lastMove = now;
      s.dirty = true;
      setShown(false);
      return;
    }
    if (!s.dirty || now - s.lastMove < SETTLE_MS) return;
    s.dirty = false;
    const t = explodeShared.t;
    const list = [...getEntries(a.sex).values()].filter((e) => e.mesh.visible);
    if (t >= 0.97 && explodeShared.grid) gridNames(a.labelMode, a.labelGroup);
    else if (t <= RADIAL_END) callouts(list, a.labelMode, a.labelGroup, a.selectedId);
    else clear();
    setShown(true);
  });

  return null;
}
