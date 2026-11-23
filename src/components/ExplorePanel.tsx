/**
 * Right sidebar: search, organ shortcuts and the Systems / Layers / Regions tabs.
 * Switches to <InfoCard/> while a structure is selected.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Fuse from 'fuse.js';
import * as THREE from 'three';
import { useAtlasStore, type SidebarTab } from '../store/useAtlasStore';
import { getCatalog } from '../anatomy/catalog';
import { displayName } from '../anatomy/def';
import { LAYERS, REGIONS, SYSTEMS, SYSTEM_BY_ID } from '../data/systems';
import organs from '../data/organs.json';
import type { OrganId, OrganRecord, RegionId, StructureDef } from '../types';
import { revealAndFocus } from '../actions';
import { getEntries } from '../three/meshRegistry';
import { focusBox, resetView } from '../three/cameraRig';
import { InfoCard } from './InfoCard';
import { StudyPanel } from './StudyModes';
import { OrganIcon } from './organIcons';
import { Icon, Segmented, Slider, Switch } from './ui';

export function ExplorePanel() {
  const selectedId = useAtlasStore((s) => s.selectedId);
  const studyMode = useAtlasStore((s) => s.studyMode);
  const showInfo = !!selectedId && studyMode !== 'quiz' && studyMode !== 'flashcards';
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <AnimatePresence initial={false}>
        {studyMode !== 'none' ? (
          <motion.div key={`study-${studyMode}`} className="absolute inset-0 flex flex-col" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.22 }}>
            <StudyPanel />
          </motion.div>
        ) : showInfo ? (
          <motion.div key="info" className="absolute inset-0 flex flex-col" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.22 }}>
            <InfoCard id={selectedId!} />
          </motion.div>
        ) : (
          <motion.div key="explore" className="absolute inset-0 flex flex-col" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.22 }}>
            <ExploreHome />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExploreHome() {
  const tab = useAtlasStore((s) => s.sidebarTab);
  const setTab = useAtlasStore((s) => s.setSidebarTab);
  const isolateIds = useAtlasStore((s) => s.isolateIds);
  const hidden = useAtlasStore((s) => s.hiddenIds.length);
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Explore</h2>
        {(isolateIds || hidden > 0) && (
          <button className="chip hover:bg-white/10" onClick={() => useAtlasStore.getState().resetVisibility()}>
            <Icon name="reset" size={12} /> Show all {hidden > 0 && `(${hidden} hidden)`}
          </button>
        )}
      </div>
      <SearchBox />
      <OrgansRow />
      <Segmented<SidebarTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'systems', label: 'Systems' },
          { value: 'layers', label: 'Layers' },
          { value: 'regions', label: 'Regions' },
        ]}
      />
      <div className="scroll-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {tab === 'systems' && <SystemsTab />}
        {tab === 'layers' && <LayersTab />}
        {tab === 'regions' && <RegionsTab />}
      </div>
    </div>
  );
}

/* ---------------- Search ---------------- */
let handledFocusTick = 0;

function SearchBox() {
  const sex = useAtlasStore((s) => s.sex);
  const tick = useAtlasStore((s) => s.searchFocusTick);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(getCatalog(sex).list, {
        keys: [
          { name: 'nameEn', weight: 0.6 },
          { name: 'nameLatin', weight: 0.35 },
          { name: 'id', weight: 0.05 },
        ],
        threshold: 0.36,
        ignoreLocation: true,
      }),
    [sex],
  );
  const results = useMemo(() => (q.trim().length < 2 ? [] : fuse.search(q.trim(), { limit: 8 }).map((r) => r.item)), [q, fuse]);

  useEffect(() => {
    // only react to new "/" presses — not to remounts (e.g. returning from the info card)
    if (tick > handledFocusTick) {
      handledFocusTick = tick;
      input.current?.focus();
    }
  }, [tick]);

  const pick = (d: StructureDef) => {
    setQ('');
    setOpen(false);
    input.current?.blur();
    revealAndFocus(d.id);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
        <Icon name="search" className="text-white/45" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter' && results[active]) pick(results[active]);
            else if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
          placeholder="Search a structure…"
          aria-label="Search a structure"
          className="h-10 w-full bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
        />
        <kbd className="hidden rounded border border-white/15 px-1.5 text-[10px] text-white/40 md:block">/</kbd>
      </div>
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="glass-strong absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-2xl py-1"
            role="listbox"
          >
            {results.map((d, i) => (
              <li key={d.id} role="option" aria-selected={i === active}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(d)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${i === active ? 'bg-accent/15' : ''}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SYSTEM_BY_ID[d.system].dot }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-white">{displayName(d)}</span>
                    <span className="block truncate text-[11px] italic text-white/45">{d.nameLatin}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Organs row ---------------- */
function OrgansRow() {
  return (
    <div>
      <div className="section-title mb-2">Organs in 3D</div>
      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(organs as OrganRecord[]).map((o) => (
          <button
            key={o.id}
            onClick={() => useAtlasStore.getState().setScreen('organ', o.id as OrganId)}
            className="group flex w-[52px] shrink-0 flex-col items-center gap-1 focus-visible:outline-none"
            title={`${o.nameEn} — open in 3D`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] text-accent-soft transition group-hover:border-accent group-hover:shadow-[0_0_18px_-4px_#14B8A6] group-focus-visible:ring-2 group-focus-visible:ring-accent">
              <OrganIcon id={o.id} />
            </span>
            <span className="text-[10.5px] text-white/60 group-hover:text-white">{o.nameEn}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */
function SystemsTab() {
  const sex = useAtlasStore((s) => s.sex);
  const visible = useAtlasStore((s) => s.visibleSystems);
  const toggle = useAtlasStore((s) => s.toggleSystem);
  const opacity = useAtlasStore((s) => s.systemOpacity);
  const setOpacity = useAtlasStore((s) => s.setSystemOpacity);
  const counts = useMemo(() => {
    const c = getCatalog(sex);
    return Object.fromEntries(SYSTEMS.map((s) => [s.id, c.bySystem.get(s.id)?.length ?? 0]));
  }, [sex]);
  return (
    <ul className="flex flex-col gap-1">
      {SYSTEMS.filter((s) => s.listed).map((s) => {
        const on = visible[s.id];
        const op = opacity[s.id] ?? 1;
        return (
          <li key={s.id} className={`rounded-2xl px-2 py-1.5 transition hover:bg-white/[0.04] ${on ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2.5">
              <button
                role="switch"
                aria-checked={on}
                onClick={() => toggle(s.id, !on)}
                aria-label={`${on ? 'Hide' : 'Show'} ${s.label} system`}
                title={on ? 'Hide system' : 'Show system'}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-accent/15 text-accent-soft hover:bg-accent/25' : 'text-white/40 hover:bg-white/10 hover:text-white'}`}
              >
                <Icon name={on ? 'eye' : 'eye-off'} size={15} />
              </button>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10" style={{ background: s.dot }} />
              <span className="flex-1 text-[13.5px] text-white/90">{s.label}</span>
              <span className="text-[11.5px] tabular-nums text-white/40">{counts[s.id].toLocaleString()}</span>
            </div>
            <div className={`flex items-center gap-2 pl-[38px] pr-1 ${on ? '' : 'pointer-events-none'}`}>
              <div className="flex-1">
                <Slider label={`${s.label} opacity`} value={Math.round(op * 100)} min={5} max={100} onChange={(v) => setOpacity(s.id, v / 100)} />
              </div>
              <span className="w-8 text-right text-[10.5px] tabular-nums text-white/45">{Math.round(op * 100)}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LayersTab() {
  const depth = useAtlasStore((s) => s.layerDepth);
  const set = useAtlasStore((s) => s.setLayerDepth);
  const skinOp = useAtlasStore((s) => s.systemOpacity.integumentary ?? 1);
  const setOp = useAtlasStore((s) => s.setSystemOpacity);
  return (
    <div className="flex flex-col gap-4 px-1">
      <p className="text-[12.5px] leading-relaxed text-white/55">Peel the body from the surface inwards. Each step hides the outermost remaining layer.</p>
      <div className="rounded-2xl bg-white/[0.04] px-3 py-2">
        <label className="flex items-center justify-between text-[13px] text-white/85">
          Semi-transparent skin layer
          <Switch on={depth === 0} onChange={(v) => set(v ? 0 : Math.max(1, depth))} label="Show skin layer" />
        </label>
        <div className={`mt-1 flex items-center gap-2 ${depth === 0 ? '' : 'pointer-events-none opacity-40'}`}>
          <span className="text-[11px] text-white/50">Opacity</span>
          <div className="flex-1">
            <Slider label="Skin opacity" value={Math.round(skinOp * 100)} min={5} max={100} onChange={(v) => setOp('integumentary', v / 100)} />
          </div>
          <span className="w-8 text-right text-[10.5px] tabular-nums text-white/45">{Math.round(skinOp * 100)}%</span>
        </div>
      </div>
      <Slider label="Depth" value={depth} min={0} max={4} step={1} onChange={set} />
      <ol className="flex flex-col gap-1">
        {LAYERS.map((l, i) => {
          const shown = i >= depth;
          return (
            <li key={l}>
              <button onClick={() => set(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition ${i === depth ? 'bg-accent/15 text-white' : 'hover:bg-white/5'} ${shown ? 'text-white/85' : 'text-white/35 line-through decoration-white/20'}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold ${shown ? 'bg-accent/80 text-white' : 'bg-white/10 text-white/40'}`}>{i + 1}</span>
                {l}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RegionsTab() {
  const region = useAtlasStore((s) => s.activeRegion);
  const sex = useAtlasStore((s) => s.sex);
  const choose = (r: RegionId) => {
    const st = useAtlasStore.getState();
    if (region === r) {
      st.setRegion(null);
      resetView();
      return;
    }
    st.setRegion(r);
    const box = new THREE.Box3();
    for (const e of getEntries(sex).values()) if (e.def.region === r && e.def.kind !== 'skin') box.expandByPoint(e.mesh.position);
    if (!box.isEmpty()) focusBox(box.expandByScalar(0.02), 1.1);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      {REGIONS.map((r) => (
        <button key={r.id} onClick={() => choose(r.id)} className={`rounded-xl border px-3 py-3 text-left text-[13px] font-medium transition ${region === r.id ? 'border-accent bg-accent/15 text-white shadow-[0_0_16px_-6px_#14B8A6]' : 'border-white/10 bg-white/[0.03] text-white/75 hover:border-white/25 hover:text-white'}`}>
          {r.label}
        </button>
      ))}
      {region && (
        <button className="btn col-span-2 mt-1 border border-white/10" onClick={() => choose(region)}>
          <Icon name="reset" size={14} /> Show whole body
        </button>
      )}
    </div>
  );
}
