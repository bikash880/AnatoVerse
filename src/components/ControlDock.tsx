/**
 * Floating bottom bar: layer peel (skin → muscle → organs → bone), labels, live, explode.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtlasStore, type LabelMode } from '../store/useAtlasStore';
import { GROUPS } from '../data/systems';
import { Icon, Slider } from './ui';

const PEEL = ['Skin', 'Muscle', 'Deep', 'Organs', 'Bone'] as const;
export function ControlDock({ compact }: { compact: boolean; narrow?: boolean }) {
  const explode = useAtlasStore((s) => s.explodeValue);
  const setExplode = useAtlasStore((s) => s.setExplode);
  const commitExplode = useAtlasStore((s) => s.commitExplode);


  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 160, damping: 22 }}
      className={`glass pointer-events-auto flex flex-wrap items-center justify-center rounded-2xl ${compact ? 'gap-2 px-2 py-2' : 'gap-3 px-3 py-2.5'}`}
    >
      <LayerPeel compact={compact} />

      <div className="hidden h-7 w-px bg-white/10 sm:block" />

      <LabelsControl compact={compact} />
      <LiveToggle />

      <div className="hidden h-7 w-px bg-white/10 sm:block" />

      {/* Explode */}
      <div className={`flex items-center gap-2.5 ${compact ? 'w-full px-1' : ''}`}>
        <span className="section-title !tracking-[0.1em]">Explode</span>
        <div className={compact ? 'flex-1' : 'w-40 xl:w-48'}>
          <Slider label="Explode view" value={explode} min={0} max={100} onChange={setExplode} onCommit={(v) => commitExplode(v)} />
          <div className="-mt-1 flex justify-between text-[10px] leading-none text-white/40">
            <span>Assembled</span>
            <span>Separated</span>
          </div>
        </div>
        <span className="w-[46px] rounded-full bg-accent/15 py-0.5 text-center text-[12px] font-semibold tabular-nums text-accent-soft">{Math.round(explode)}%</span>
        <button className="btn !px-2.5 !py-1.5 disabled:opacity-40" onClick={() => commitExplode(0)} disabled={explode === 0} title="Reassemble (R)" aria-label="Reassemble">
          <span aria-hidden>↺</span> {!compact && 'Reassemble'}
        </button>
      </div>
    </motion.div>
  );
}

const MODES: { value: LabelMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'selected', label: 'Selected' },
  { value: 'group', label: 'Group' },
  { value: 'all', label: 'All' },
];

/** "Labels" button with a popover: mode (Off / Selected only / Group / All) + group filter. */
function LabelsControl({ compact }: { compact: boolean }) {
  const mode = useAtlasStore((s) => s.labelMode);
  const group = useAtlasStore((s) => s.labelGroup);
  const setMode = useAtlasStore((s) => s.setLabelMode);
  const setGroup = useAtlasStore((s) => s.setLabelGroup);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const current = mode === 'group' ? GROUPS.find((g) => g.id === group)!.label : MODES.find((m) => m.value === mode)!.label;
  return (
    <div ref={ref} className="relative">
      <button className={`btn !px-2.5 !py-1.5 ${mode === 'group' || mode === 'all' ? 'text-accent-soft' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title="Name labels (L)">
        <Icon name="tag" size={14} />
        {!compact && <span>Labels</span>}
        <span className="rounded-md bg-white/10 px-1.5 text-[11px] text-white/80">{current}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label="Label options"
            className="glass-strong absolute bottom-full left-1/2 z-50 mb-3 w-[272px] -translate-x-1/2 rounded-[18px] p-3"
          >
            <div className="section-title mb-2">Name labels</div>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/30 p-1" role="radiogroup" aria-label="Label mode">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  role="radio"
                  aria-checked={mode === m.value}
                  onClick={() => setMode(m.value)}
                  className={`rounded-lg py-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${mode === m.value ? 'bg-accent text-white' : 'text-white/60 hover:text-white'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="section-title mb-2 mt-3">Show only group</div>
            <div className="flex flex-wrap gap-1.5">
              {GROUPS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGroup(g.id)}
                  aria-pressed={mode === 'group' && group === g.id}
                  className={`chip transition ${mode === 'group' && group === g.id ? '!border-accent !bg-accent/20 !text-white' : 'hover:bg-white/10'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                  {g.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-white/45">
              Labels appear for parts facing the camera once the view stops moving. Zoom in to label smaller parts. Hover or tap a label for its Latin name.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Live" physiology on/off (breathing, heartbeat, neural pulses, blood flow). */
function LiveToggle() {
  const live = useAtlasStore((s) => s.live);
  return (
    <button
      className={`btn !px-2.5 !py-1.5 ${live ? 'text-accent-soft' : ''}`}
      onClick={() => useAtlasStore.getState().setLive(!live)}
      aria-pressed={live}
      title="Live: breathing, heartbeat, neural pulses, blood flow"
    >
      <span className={`relative flex h-2 w-2 ${live ? '' : 'opacity-40'}`}>
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-red-400' : 'bg-white/50'}`} />
      </span>
      Live
    </button>
  );
}

/** Peel the body from the surface inwards: Skin · Muscle · Deep · Organs · Bone. */
function LayerPeel({ compact }: { compact: boolean }) {
  const depth = useAtlasStore((s) => s.layerDepth);
  const set = useAtlasStore((s) => s.setLayerDepth);
  const i = Math.round(depth);
  return (
    <div className={`flex items-center gap-2.5 ${compact ? 'w-full px-1' : ''}`}>
      <span className="section-title !tracking-[0.1em]">Layers</span>
      <div className={compact ? 'flex-1' : 'w-48 xl:w-56'}>
        <Slider label="Peel layers" value={depth} min={0} max={4} step={1} onChange={set} />
        <div className="-mt-1 flex justify-between text-[10px] leading-none">
          {PEEL.map((l, k) => (
            <button key={l} onClick={() => set(k)} className={`transition ${k === i ? 'font-semibold text-accent-soft' : k < i ? 'text-white/25 line-through' : 'text-white/45 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
