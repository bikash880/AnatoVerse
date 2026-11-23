/**
 * Study features: Quiz (multiple choice or typed answers with fuzzy matching), Flashcards
 * generated from the study list, and the Study list panel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Fuse from 'fuse.js';
import { useAtlasStore } from '../store/useAtlasStore';
import { getCatalog, getStructure } from '../anatomy/catalog';
import { displayName } from '../anatomy/def';
import { SYSTEM_BY_ID } from '../data/systems';
import type { FactKey, StructureDef } from '../types';
import { revealAndFocus } from '../actions';
import { Icon, Segmented } from './ui';

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Study panels live in the sidebar (desktop / tablet) or the bottom sheet (phone). */
const Panel = ({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) => (
  <div className="flex h-full flex-col p-4">
    <button className="mb-3 flex items-center gap-1 self-start text-[12.5px] font-medium text-accent-soft hover:text-white" onClick={onClose}>
      <Icon name="back" size={14} /> Back to explore
    </button>
    <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
    <div className="scroll-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div>
  </div>
);

/** Whichever study mode is active. */
export function StudyPanel() {
  const mode = useAtlasStore((s) => s.studyMode);
  if (mode === 'quiz') return <QuizMode />;
  if (mode === 'flashcards') return <Flashcards />;
  if (mode === 'studyList') return <StudyListPanel />;
  return null;
}

/* ============================ QUIZ ============================ */
export function QuizMode() {
  const sex = useAtlasStore((s) => s.sex);
  const quiz = useAtlasStore((s) => s.quizState);
  const visibleSystems = useAtlasStore((s) => s.visibleSystems);
  const patch = useAtlasStore((s) => s.patchQuiz);
  const [typed, setTyped] = useState('');
  const timer = useRef<number>();

  /** Quiz pool: named structures of visible systems (lymph nodes & skin patches excluded). */
  const pool = useMemo(
    () => getCatalog(sex).list.filter((d) => d.kind !== 'skin' && !d.id.startsWith('ln-') && !d.id.startsWith('spinal-cord-') && visibleSystems[d.system]),
    [sex, visibleSystems],
  );

  const next = useCallback(() => {
    if (!pool.length) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const sameSys = shuffle(pool.filter((d) => d.system === target.system && d.nameEn !== target.nameEn));
    const names = new Set<string>([target.nameEn]);
    for (const d of [...sameSys, ...shuffle(pool)]) {
      if (names.size >= 4) break;
      names.add(d.nameEn);
    }
    patch({ targetId: target.id, options: shuffle([...names]), answered: null });
    setTyped('');
    revealAndFocus(target.id, { select: false });
  }, [pool, patch]);

  useEffect(() => {
    useAtlasStore.getState().select(null);
    next();
    return () => {
      window.clearTimeout(timer.current);
      useAtlasStore.getState().patchQuiz({ targetId: null, answered: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = getStructure(sex, quiz.targetId);

  const answer = (correct: boolean) => {
    if (quiz.answered) return;
    const streak = correct ? quiz.streak + 1 : 0;
    patch({
      answered: correct ? 'correct' : 'wrong',
      score: quiz.score + (correct ? 1 : 0),
      total: quiz.total + 1,
      streak,
      bestStreak: Math.max(quiz.bestStreak, streak),
    });
    if (correct) timer.current = window.setTimeout(next, 1300);
  };

  const checkTyped = () => {
    if (!target || !typed.trim()) return;
    const f = new Fuse([target.nameEn, target.nameLatin], { includeScore: true, threshold: 0.4 });
    answer(f.search(typed.trim()).some((r) => (r.score ?? 1) < 0.35));
  };

  const close = () => useAtlasStore.getState().setStudyMode('none');

  return (
    <Panel title="Quiz" onClose={close}>
      <p className="mb-3 text-[13px] text-white/60">Name the structure highlighted in <span className="font-semibold text-amber">amber</span>.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="chip">Score <b className="text-white">{quiz.score}/{quiz.total}</b></span>
        <span className="chip">🔥 Streak <b className="text-white">{quiz.streak}</b></span>
        <span className="chip">Best <b className="text-white">{quiz.bestStreak}</b></span>
        <Segmented
          className="ml-auto !p-0.5"
          value={quiz.inputMode}
          onChange={(m) => patch({ inputMode: m })}
          options={[
            { value: 'choice', label: 'Pick' },
            { value: 'type', label: 'Type' },
          ]}
        />
      </div>
      {target && (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-white/55">
          <span className="h-2 w-2 rounded-full" style={{ background: SYSTEM_BY_ID[target.system].dot }} />
          Hint: {SYSTEM_BY_ID[target.system].label} system{target.side !== 'midline' && <> · {target.side} side</>}
        </div>
      )}
      {quiz.inputMode === 'choice' ? (
        <div className="grid grid-cols-1 gap-2">
          {quiz.options.map((o) => {
            const isRight = o === target?.nameEn;
            const state = quiz.answered ? (isRight ? 'right' : 'dim') : 'idle';
            return (
              <button
                key={o}
                onClick={() => answer(isRight)}
                disabled={!!quiz.answered}
                className={`rounded-xl border px-3 py-2.5 text-left text-[13px] transition ${
                  state === 'right' ? 'border-accent bg-accent/20 text-white' : state === 'dim' ? 'border-white/5 text-white/35' : 'border-white/10 bg-white/[0.04] text-white/85 hover:border-accent/60 hover:bg-white/[0.07]'
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            checkTyped();
          }}
        >
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            disabled={!!quiz.answered}
            placeholder="English or Latin name…"
            className="h-10 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-[14px] text-white placeholder:text-white/35 focus:border-accent focus:outline-none"
          />
          <button className="btn btn-active" disabled={!!quiz.answered}>Check</button>
        </form>
      )}
      <AnimatePresence>
        {quiz.answered && target && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
            <div className={`rounded-xl p-3 text-[13px] ${quiz.answered === 'correct' ? 'bg-accent/15 text-accent-soft' : 'bg-red-500/10 text-red-300'}`}>
              {quiz.answered === 'correct' ? '✓ Correct! ' : '✗ Not quite — it is '}
              <b className="text-white">{displayName(target)}</b> <span className="italic text-white/50">({target.nameLatin})</span>
            </div>
            {quiz.answered === 'wrong' && (
              <button className="btn btn-active mt-2 w-full" onClick={next}>
                Next structure <Icon name="right" size={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {!quiz.answered && (
        <button className="btn mt-2 w-full text-white/50" onClick={() => { patch({ streak: 0 }); next(); }}>
          Skip
        </button>
      )}
    </Panel>
  );
}

/* ============================ FLASHCARDS ============================ */
const KEY_FACTS: [FactKey, string][] = [
  ['function', 'Function'],
  ['origin', 'Origin'],
  ['insertion', 'Insertion'],
  ['action', 'Action'],
  ['innervation', 'Innervation'],
  ['supplies', 'Supplies'],
  ['articulations', 'Articulations'],
  ['drainage', 'Drainage'],
  ['bloodSupply', 'Blood supply'],
];

export function Flashcards() {
  const sex = useAtlasStore((s) => s.sex);
  const list = useAtlasStore((s) => s.studyList);
  const index = useAtlasStore((s) => s.flashcardIndex);
  const setIndex = useAtlasStore((s) => s.setFlashcardIndex);
  const [flipped, setFlipped] = useState(false);
  const deck = useMemo(() => list.map((id) => getStructure(sex, id)).filter(Boolean) as StructureDef[], [list, sex]);
  const card = deck[Math.min(index, deck.length - 1)];

  useEffect(() => {
    setFlipped(false);
    if (card) {
      useAtlasStore.getState().setSuppressLabel(true);
      revealAndFocus(card.id);
    }
  }, [card?.id]);
  useEffect(() => {
    useAtlasStore.getState().setSuppressLabel(!flipped);
  }, [flipped]);
  useEffect(
    () => () => {
      useAtlasStore.getState().setSuppressLabel(false);
    },
    [],
  );

  const close = () => useAtlasStore.getState().setStudyMode('none');
  if (!deck.length)
    return (
      <Panel title="Flashcards" onClose={close}>
        <p className="text-[13px] text-white/65">Your study list is empty. Select any structure and tap <b className="text-white">Add to study list</b> — each saved structure becomes a flashcard.</p>
      </Panel>
    );

  const facts = KEY_FACTS.filter(([k]) => card.facts[k]).slice(0, 3);
  return (
    <Panel title={`Flashcards · ${Math.min(index, deck.length - 1) + 1} / ${deck.length}`} onClose={close}>
      <div className="[perspective:1200px]">
        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.45 }} className="relative min-h-[240px] [transform-style:preserve-3d]">
          <button onClick={() => setFlipped(true)} className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-amber/10 to-transparent p-4 text-center [backface-visibility:hidden]">
            <span className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber">Front</span>
            <span className="text-[15px] text-white">Which structure is highlighted in the 3D view?</span>
            <span className="mt-3 flex items-center gap-1.5 text-[12px] text-white/45"><Icon name="flip" size={13} /> Tap to flip</span>
          </button>
          <div onClick={() => setFlipped(false)} className="absolute inset-0 cursor-pointer overflow-y-auto rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="font-display text-xl font-semibold text-white">{displayName(card)}</div>
            <div className="mb-2 text-[12px] italic text-white/55">{card.nameLatin}</div>
            {facts.map(([k, l]) => (
              <div key={k} className="mb-1 text-[12.5px] text-white/80"><b className="text-white/55">{l}: </b>{card.facts[k]}</div>
            ))}
            {!facts.length && <div className="text-[12.5px] text-white/80">{card.overview}</div>}
          </div>
        </motion.div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button className="btn" onClick={() => setIndex((index - 1 + deck.length) % deck.length)}><Icon name="left" size={14} /> Prev</button>
        <button className="btn" onClick={() => setFlipped((f) => !f)}><Icon name="flip" size={14} /> Flip</button>
        <button className="btn btn-active" onClick={() => setIndex((index + 1) % deck.length)}>Next <Icon name="right" size={14} /></button>
      </div>
    </Panel>
  );
}

/* ============================ STUDY LIST ============================ */
export function StudyListPanel() {
  const sex = useAtlasStore((s) => s.sex);
  const list = useAtlasStore((s) => s.studyList);
  const close = () => useAtlasStore.getState().setStudyMode('none');
  return (
    <Panel title={`Study list (${list.length})`} onClose={close}>
      {list.length === 0 ? (
        <p className="text-[13px] text-white/65">Bookmark structures from their info card to build your personal study list. It is saved on this device.</p>
      ) : (
        <>
          <ul className="scroll-thin -mr-2 max-h-[40vh] space-y-1 overflow-y-auto pr-2">
            {list.map((id) => {
              const d = getStructure(sex, id);
              if (!d) return null;
              return (
                <li key={id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SYSTEM_BY_ID[d.system].dot }} />
                  <button className="min-w-0 flex-1 truncate text-left text-[13px] text-white/85 hover:text-white" onClick={() => { close(); revealAndFocus(id); }}>
                    {displayName(d)}
                  </button>
                  <button className="btn !p-1 text-white/40" onClick={() => useAtlasStore.getState().toggleStudy(id)} aria-label="Remove from study list">
                    <Icon name="x" size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-active flex-1" onClick={() => { useAtlasStore.getState().setFlashcardIndex(0); useAtlasStore.getState().setStudyMode('flashcards'); }}>
              <Icon name="cards" size={14} /> Study as flashcards
            </button>
            <button className="btn border border-white/10" onClick={() => useAtlasStore.setState({ studyList: [] })}>Clear</button>
          </div>
        </>
      )}
    </Panel>
  );
}
