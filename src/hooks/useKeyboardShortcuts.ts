import { useEffect, useState } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';
import { setView } from '../three/cameraRig';
import { focusSelected } from '../actions';
import type { ViewPreset } from '../types';

const VIEW_KEYS: Record<string, ViewPreset> = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'threeQuarter' };

/** Global shortcuts: 1–5 views, E explode, R reassemble, F focus, Esc deselect, / search. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useAtlasStore.getState();
      if (st.screen !== 'explorer') return;
      const k = e.key.toLowerCase();
      if (VIEW_KEYS[k]) {
        st.setViewPreset(VIEW_KEYS[k]);
        setView(VIEW_KEYS[k]);
      } else if (k === 'e') {
        st.commitExplode(st.explodeValue < 60 ? 60 : 100);
      } else if (k === 'r') {
        st.commitExplode(0);
      } else if (k === 'l') {
        const order = ['off', 'selected', 'group', 'all'] as const;
        st.setLabelMode(order[(order.indexOf(st.labelMode) + 1) % order.length]);
      } else if (k === 'f') {
        focusSelected();
      } else if (k === 'escape') {
        if (st.creditsOpen) st.setCreditsOpen(false);
        else if (st.studyMode !== 'none') st.setStudyMode('none');
        else st.select(null);
      } else if (k === '/') {
        e.preventDefault();
        // the search box lives on the Explore view — leave the info card / study panel first
        if (st.selectedId) st.select(null);
        if (st.studyMode !== 'none') st.setStudyMode('none');
        st.focusSearch();
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
