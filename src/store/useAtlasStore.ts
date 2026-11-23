import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { OrganId, RegionId, Sex, SystemId, ViewPreset } from '../types';
import type { GroupId } from '../data/systems';

/** Name labels: none, only the selection, one group, or every group. */
export type LabelMode = 'off' | 'selected' | 'group' | 'all';

export type Screen = 'explorer' | 'organ';
export type SidebarTab = 'systems' | 'layers' | 'regions';
export type StudyMode = 'none' | 'quiz' | 'flashcards' | 'studyList';

export interface QuizState {
  /** Structure currently being asked about. */
  targetId: string | null;
  options: string[];
  answered: 'correct' | 'wrong' | null;
  score: number;
  total: number;
  streak: number;
  bestStreak: number;
  inputMode: 'choice' | 'type';
}

export interface LoadingState {
  active: boolean;
  progress: number; // 0..1
  label: string;
}

interface AtlasState {
  // ---- core spec state ----
  selectedId: string | null;
  visibleSystems: Record<SystemId, boolean>;
  /** 0 = skin on … 4 = only skeleton. Fractional values fade the outermost visible layer. */
  layerDepth: number;
  /** 0..100 */
  explodeValue: number;
  viewPreset: ViewPreset | null;
  sex: Sex;
  studyList: string[];
  quizState: QuizState;

  // ---- UI / scene state ----
  screen: Screen;
  activeOrgan: OrganId | null;
  sidebarTab: SidebarTab;
  activeRegion: RegionId | null;
  hiddenIds: string[];
  /** When non-null only these ids are drawn (Isolate). */
  isolateIds: string[] | null;
  hoveredId: string | null;
  visibleCount: number;
  loadedSystems: Partial<Record<`${Sex}:${SystemId}`, true>>;
  loading: LoadingState;
  creditsOpen: boolean;
  studyMode: StudyMode;
  flashcardIndex: number;
  /** Bumped to ask the search box to focus (keyboard "/"). */
  searchFocusTick: number;
  /** Hides the floating name label (quiz / flashcard front). */
  suppressLabel: boolean;
  /** Bumped when an explode change is committed (slider release, E/R keys) → camera re-frames. */
  explodeCommit: number;
  /** True once the initial set of systems has streamed in. */
  bootstrapped: boolean;
  labelMode: LabelMode;
  /** Group shown when labelMode === 'group'. */
  labelGroup: GroupId;
  /** "Live" physiology: heartbeat, breathing, neural pulses, peristalsis, blood flow. */
  live: boolean;
  /** Per-system opacity (0.05..1); the skin layer uses `integumentary`. */
  systemOpacity: Record<SystemId, number>;
  /** Slow turntable rotation of the body. */
  autoRotate: boolean;

  // ---- actions ----
  select: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  toggleSystem: (id: SystemId, on?: boolean) => void;
  setLayerDepth: (v: number) => void;
  setExplode: (v: number) => void;
  setViewPreset: (v: ViewPreset | null) => void;
  setSex: (s: Sex) => void;
  toggleStudy: (id: string) => void;
  setScreen: (s: Screen, organ?: OrganId | null) => void;
  setSidebarTab: (t: SidebarTab) => void;
  setRegion: (r: RegionId | null) => void;
  hide: (id: string) => void;
  isolate: (ids: string[] | null) => void;
  showOnlySystem: (id: SystemId) => void;
  resetVisibility: () => void;
  setVisibleCount: (n: number) => void;
  markLoaded: (sex: Sex, sys: SystemId) => void;
  setLoading: (l: Partial<LoadingState>) => void;
  setCreditsOpen: (o: boolean) => void;
  setStudyMode: (m: StudyMode) => void;
  setFlashcardIndex: (i: number) => void;
  focusSearch: () => void;
  setSuppressLabel: (b: boolean) => void;
  commitExplode: (v?: number) => void;
  setBootstrapped: () => void;
  setLabelMode: (m: LabelMode) => void;
  setLabelGroup: (g: GroupId) => void;
  setLive: (v: boolean) => void;
  setSystemOpacity: (sys: SystemId, v: number) => void;
  setAutoRotate: (v: boolean) => void;
  patchQuiz: (q: Partial<QuizState>) => void;
}

const ALL_ON: Record<SystemId, boolean> = {
  skeletal: true,
  muscular: true,
  nervous: true,
  cardiovascular: true,
  respiratory: true,
  digestive: true,
  urinary: true,
  lymphatic: true,
  reproductive: true,
  integumentary: true,
};

const INITIAL_QUIZ: QuizState = {
  targetId: null,
  options: [],
  answered: null,
  score: 0,
  total: 0,
  streak: 0,
  bestStreak: 0,
  inputMode: 'choice',
};

export const useAtlasStore = create<AtlasState>()(
  persist(
    (set) => ({
      selectedId: null,
      visibleSystems: { ...ALL_ON },
      layerDepth: 1,
      explodeValue: 0,
      viewPreset: 'front',
      sex: 'male',
      studyList: [],
      quizState: INITIAL_QUIZ,

      screen: 'explorer',
      activeOrgan: null,
      sidebarTab: 'systems',
      activeRegion: null,
      hiddenIds: [],
      isolateIds: null,
      hoveredId: null,
      visibleCount: 0,
      loadedSystems: {},
      loading: { active: true, progress: 0, label: 'Preparing atlas…' },
      creditsOpen: false,
      studyMode: 'none',
      flashcardIndex: 0,
      searchFocusTick: 0,
      suppressLabel: false,
      explodeCommit: 0,
      bootstrapped: false,
      labelMode: 'selected',
      labelGroup: 'muscles',
      live: true,
      systemOpacity: Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, 1])) as Record<SystemId, number>,

      select: (id) => set({ selectedId: id }),
      setHovered: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),
      toggleSystem: (id, on) =>
        set((s) => ({ visibleSystems: { ...s.visibleSystems, [id]: on ?? !s.visibleSystems[id] } })),
      setLayerDepth: (v) => set({ layerDepth: Math.max(0, Math.min(4, v)) }),
      setExplode: (v) => set({ explodeValue: Math.max(0, Math.min(100, v)) }),
      setViewPreset: (v) => set({ viewPreset: v }),
      setSex: (sex) => set({ sex, selectedId: null, hiddenIds: [], isolateIds: null }),
      toggleStudy: (id) =>
        set((s) => ({
          studyList: s.studyList.includes(id) ? s.studyList.filter((x) => x !== id) : [...s.studyList, id],
        })),
      setScreen: (screen, organ = null) => set({ screen, activeOrgan: organ }),
      setSidebarTab: (sidebarTab) => set({ sidebarTab }),
      setRegion: (activeRegion) => set({ activeRegion }),
      hide: (id) => set((s) => ({ hiddenIds: [...s.hiddenIds, id], selectedId: s.selectedId === id ? null : s.selectedId })),
      isolate: (ids) => set({ isolateIds: ids }),
      showOnlySystem: (id) =>
        set((s) => ({
          visibleSystems: Object.fromEntries(
            Object.keys(s.visibleSystems).map((k) => [k, k === id]),
          ) as Record<SystemId, boolean>,
          // peel back skin & superficial layers that would otherwise hide the system
          layerDepth: id === 'muscular' ? Math.min(s.layerDepth, 1) : Math.max(s.layerDepth, 1),
        })),
      resetVisibility: () =>
        set({ hiddenIds: [], isolateIds: null, activeRegion: null, visibleSystems: { ...ALL_ON } }),
      setVisibleCount: (visibleCount) => set({ visibleCount }),
      markLoaded: (sex, sys) => set((s) => ({ loadedSystems: { ...s.loadedSystems, [`${sex}:${sys}`]: true } })),
      setLoading: (l) => set((s) => ({ loading: { ...s.loading, ...l } })),
      setCreditsOpen: (creditsOpen) => set({ creditsOpen }),
      setStudyMode: (studyMode) => set({ studyMode, suppressLabel: false }),
      setFlashcardIndex: (flashcardIndex) => set({ flashcardIndex }),
      focusSearch: () => set((s) => ({ searchFocusTick: s.searchFocusTick + 1 })),
      setSuppressLabel: (suppressLabel) => set({ suppressLabel }),
      commitExplode: (v) =>
        set((s) => ({
          explodeValue: v === undefined ? s.explodeValue : Math.max(0, Math.min(100, v)),
          explodeCommit: s.explodeCommit + 1,
        })),
      setBootstrapped: () => set({ bootstrapped: true }),
      setLabelMode: (labelMode) => set({ labelMode }),
      setLabelGroup: (labelGroup) => set({ labelGroup, labelMode: 'group' }),
      setLive: (live) => set({ live }),
      autoRotate: false,
      setAutoRotate: (autoRotate) => set({ autoRotate }),
      setSystemOpacity: (sys, v) => set((s) => ({ systemOpacity: { ...s.systemOpacity, [sys]: Math.max(0.05, Math.min(1, v)) } })),
      patchQuiz: (q) => set((s) => ({ quizState: { ...s.quizState, ...q } })),
    }),
    {
      name: 'anatoverse',
      storage: createJSONStorage(() => localStorage),
      // Only the study list and quiz best streak survive reloads.
      partialize: (s) => ({ studyList: s.studyList, labelMode: s.labelMode, labelGroup: s.labelGroup, live: s.live, systemOpacity: s.systemOpacity, quizState: { ...INITIAL_QUIZ, bestStreak: s.quizState.bestStreak } }),
    },
  ),
);

// `?debug` exposes the store for automated end-to-end checks
if (typeof location !== 'undefined' && location.search.includes('debug'))
  (window as unknown as { __store: typeof useAtlasStore }).__store = useAtlasStore;
