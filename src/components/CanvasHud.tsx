/**
 * Heads-up elements over the canvas: visible-structure badge, camera rail, sex switch, hover tooltip, study buttons.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtlasStore } from '../store/useAtlasStore';
import { orbit, resetView, setView, zoom } from '../three/cameraRig';
import { getStructure } from '../anatomy/catalog';
import { displayName } from '../anatomy/def';
import { SYSTEM_BY_ID } from '../data/systems';
import type { Sex, ViewPreset } from '../types';
import { Icon } from './ui';

export function VisibleBadge() {
  const count = useAtlasStore((s) => s.visibleCount);
  const loading = useAtlasStore((s) => s.loading);
  const bootstrapped = useAtlasStore((s) => s.bootstrapped);
  return (
    <div className="glass pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white/80">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      Visible structures: <span className="tabular-nums text-white">{count.toLocaleString()}</span>
      {bootstrapped && loading.active && (
        <span className="ml-1 flex items-center gap-1.5 text-white/50">
          <span className="h-1 w-14 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full bg-accent" style={{ width: `${Math.round(loading.progress * 100)}%` }} />
          </span>
          loading
        </span>
      )}
    </div>
  );
}

const VIEWS: { v: ViewPreset; label: string; short: string }[] = [
  { v: 'front', label: 'Front view', short: 'Front' },
  { v: 'back', label: 'Back view', short: 'Back' },
  { v: 'left', label: 'Side view', short: 'Side' },
  { v: 'threeQuarter', label: '3/4 view', short: '3/4' },
];

/** Left floating controls: view presets, rotate, turntable, zoom, reset. */
export function ViewRail({ compact = false }: { compact?: boolean }) {
  const viewPreset = useAtlasStore((s) => s.viewPreset);
  const autoRotate = useAtlasStore((s) => s.autoRotate);
  const btn = `flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} items-center justify-center rounded-xl text-white/70 transition hover:bg-accent/15 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`;
  const go = (v: ViewPreset) => {
    useAtlasStore.getState().setViewPreset(v);
    setView(v);
  };
  return (
    <div className="glass pointer-events-auto flex flex-col items-center gap-1 rounded-2xl p-1.5" role="toolbar" aria-label="Camera controls" aria-orientation="vertical">
      {VIEWS.map(({ v, label, short }, i) => (
        <button
          key={v}
          className={`${btn} !w-auto min-w-[36px] px-1 text-[11px] font-semibold ${viewPreset === v ? '!bg-accent !text-white shadow-[0_0_14px_-3px_#14B8A6]' : ''}`}
          onClick={() => go(v)}
          title={`${label} (${[1, 2, 3, 5][i]})`}
          aria-label={label}
          aria-pressed={viewPreset === v}
        >
          {short}
        </button>
      ))}
      <span className="my-0.5 h-px w-7 bg-white/10" />
      <button className={btn} onClick={() => { useAtlasStore.getState().setViewPreset(null); orbit(-45); }} aria-label="Rotate left" title="Rotate left">
        <Icon name="rot-l" size={16} />
      </button>
      <button className={btn} onClick={() => { useAtlasStore.getState().setViewPreset(null); orbit(45); }} aria-label="Rotate right" title="Rotate right">
        <Icon name="rot-r" size={16} />
      </button>
      <button
        className={`${btn} ${autoRotate ? '!text-accent-soft bg-accent/15' : ''}`}
        onClick={() => useAtlasStore.getState().setAutoRotate(!autoRotate)}
        aria-pressed={autoRotate}
        aria-label="Auto-rotate"
        title="Auto-rotate (turntable)"
      >
        <Icon name="spin" size={16} />
      </button>
      <span className="my-0.5 h-px w-7 bg-white/10" />
      <button className={btn} onClick={() => zoom(0.75)} aria-label="Zoom in" title="Zoom in"><Icon name="plus" /></button>
      <button className={btn} onClick={() => zoom(1.33)} aria-label="Zoom out" title="Zoom out"><Icon name="minus" /></button>
      <button className={`${btn} text-accent`} onClick={() => { useAtlasStore.getState().setViewPreset('front'); resetView(); }} aria-label="Reset view" title="Reset view (or double-click empty space)">
        <Icon name="reset" size={15} />
      </button>
    </div>
  );
}

/** Male / Female switch in the header. */
export function SexSwitch() {
  const sex = useAtlasStore((s) => s.sex);
  return (
    <div className="glass pointer-events-auto relative flex rounded-full p-1" role="radiogroup" aria-label="Model sex">
      {(['male', 'female'] as Sex[]).map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={sex === s}
          onClick={() => sex !== s && useAtlasStore.getState().setSex(s)}
          className={`relative z-10 rounded-full px-3.5 py-1 text-[12.5px] font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${sex === s ? 'text-white' : 'text-white/60 hover:text-white'}`}
        >
          {sex === s && <motion.span layoutId="sex-pill" className="absolute inset-0 -z-10 rounded-full bg-accent shadow-[0_0_16px_-4px_#14B8A6]" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
          <span aria-hidden className="mr-1 opacity-80">{s === 'male' ? '♂' : '♀'}</span>
          {s}
        </button>
      ))}
    </div>
  );
}

/** Name of the structure under the mouse, following the cursor (desktop). */
export function HoverTooltip() {
  const hoveredId = useAtlasStore((s) => (s.hoveredId === s.selectedId ? null : s.hoveredId));
  const sex = useAtlasStore((s) => s.sex);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const def = hoveredId ? getStructure(sex, hoveredId) : undefined;
  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-[60]" aria-hidden>
      <AnimatePresence>
        {def && (
          <motion.div
            key={def.id}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="glass-strong whitespace-nowrap rounded-xl px-2.5 py-1 text-[12px] font-medium text-white"
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SYSTEM_BY_ID[def.system].dot }} />
            {displayName(def)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StudyBar() {
  const studyMode = useAtlasStore((s) => s.studyMode);
  const studyCount = useAtlasStore((s) => s.studyList.length);
  const set = useAtlasStore((s) => s.setStudyMode);
  const item = (mode: 'quiz' | 'flashcards' | 'studyList', icon: 'quiz' | 'cards' | 'list', label: string, badge?: number) => (
    <button className={`btn !py-1.5 ${studyMode === mode ? 'btn-active' : ''}`} onClick={() => set(studyMode === mode ? 'none' : mode)}>
      <Icon name={icon} size={15} />
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && <span className="rounded-full bg-white/15 px-1.5 text-[10px] tabular-nums">{badge}</span>}
    </button>
  );
  return (
    <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-[18px] p-1">
      {item('quiz', 'quiz', 'Quiz')}
      {item('flashcards', 'cards', 'Flashcards')}
      {item('studyList', 'list', 'Study list', studyCount)}
      <button className="btn !py-1.5" onClick={() => useAtlasStore.getState().setCreditsOpen(true)} aria-label="About & Credits" title="About & Credits">
        <Icon name="info" size={15} />
      </button>
    </div>
  );
}
