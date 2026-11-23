/**
 * Skelly — floating AI anatomy tutor: 3D avatar + chat panel (bottom sheet on phones).
 * Questions go to the backend route /api/skelly/chat (the API key stays on the server).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAtlasStore } from '../store/useAtlasStore';
import { getStructure } from '../anatomy/catalog';
import { displayName } from '../anatomy/def';
import { SYSTEM_BY_ID } from '../data/systems';
import { revealAndFocus } from '../actions';
import { Icon } from '../components/ui';
import { SkellyAvatar } from './SkellyAvatar';
import { newId, useSkelly, type ChatMessage, type SpeechLang } from './skellyStore';
import { detectLang, listen, speak, stopListening, stopSpeaking, sttSupported, ttsSupported } from './speech';
import { matchStructures } from './match';

/** Turns sent to the server (the full session history stays in the panel). */
const HISTORY_TURNS = 16;

async function ask(question: string) {
  const sk = useSkelly.getState();
  const atlas = useAtlasStore.getState();
  const sel = getStructure(atlas.sex, atlas.selectedId);
  sk.add({ id: newId(), role: 'user', content: question, lang: detectLang(question) });
  sk.setPending(true);
  stopSpeaking();
  const history = useSkelly
    .getState()
    .messages.filter((m) => !m.error)
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));
  try {
    const res = await fetch('/api/skelly/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: history,
        selected: sel ? { name: displayName(sel), latin: sel.nameLatin, system: SYSTEM_BY_ID[sel.system].label } : null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { answer?: string; structures?: string[]; error?: string; code?: string };
    if (!res.ok || !data.answer) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { code: data.code });
    const lang = detectLang(data.answer);
    const matches = matchStructures(data.structures ?? [], atlas.sex, useAtlasStore.getState().selectedId);
    useSkelly.getState().add({ id: newId(), role: 'assistant', content: data.answer, structures: data.structures ?? [], matches, lang });
    // highlight + fly to the first structure the answer is about
    if (matches[0] && useAtlasStore.getState().screen === 'explorer' && useAtlasStore.getState().studyMode !== 'quiz') revealAndFocus(matches[0]);
    if (!useSkelly.getState().muted) speak(data.answer, lang);
  } catch (e) {
    const err = e as Error & { code?: string };
    const content =
      err.code === 'not_configured'
        ? 'I can’t think yet — my brain (the AI service) isn’t connected. Add GEMINI_API_KEY (free, from aistudio.google.com) or ANTHROPIC_API_KEY to the .env file and restart the server (see README).'
        : err instanceof TypeError
          ? 'I can’t reach my server. Make sure it is running (npm run dev).'
          : err.message;
    useSkelly.getState().add({ id: newId(), role: 'assistant', content, error: true });
  } finally {
    useSkelly.getState().setPending(false);
  }
}

const CHIPS: { label: string; en: (n?: string) => string; hi: (n?: string) => string }[] = [
  {
    label: 'Explain this part',
    en: (n) => (n ? `Explain the ${n}.` : 'Explain one important structure of the human body.'),
    hi: (n) => (n ? `${n} को सरल भाषा में समझाइए।` : 'मानव शरीर की एक महत्वपूर्ण संरचना समझाइए।'),
  },
  {
    label: 'Quiz me',
    en: (n) => (n ? `Quiz me with one question about the ${n}.` : 'Quiz me with one anatomy question.'),
    hi: (n) => (n ? `${n} के बारे में मुझसे एक प्रश्न पूछिए।` : 'मुझसे शरीर रचना का एक प्रश्न पूछिए।'),
  },
  {
    label: 'Clinical importance',
    en: (n) => (n ? `What is the clinical importance of the ${n}?` : 'Tell me about a clinically important structure.'),
    hi: (n) => (n ? `${n} का क्लिनिकल महत्व क्या है?` : 'किसी क्लिनिकली महत्वपूर्ण संरचना के बारे में बताइए।'),
  },
];

function Bubble({ m, onShow }: { m: ChatMessage; onShow: (id: string) => void }) {
  const sex = useAtlasStore((s) => s.sex);
  if (m.role === 'user')
    return (
      <div className="ml-8 self-end rounded-2xl rounded-br-md bg-accent/85 px-3 py-2 text-[13px] leading-relaxed text-white" lang={m.lang === 'hi-IN' ? 'hi' : 'en'}>
        {m.content}
      </div>
    );
  const shows = (m.matches ?? []).map((id) => getStructure(sex, id)).filter(Boolean);
  return (
    <div className="mr-6 flex flex-col gap-1.5 self-start" lang={m.lang === 'hi-IN' ? 'hi' : 'en'}>
      <div className={`rounded-2xl rounded-bl-md px-3 py-2 text-[13px] leading-relaxed ${m.error ? 'border border-amber/40 bg-amber/10 text-amber' : 'bg-white/[0.07] text-white/90'}`}>{m.content}</div>
      {!m.error && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shows.map((d) => (
            <button key={d!.id} onClick={() => onShow(d!.id)} className="chip !border-accent/40 !bg-accent/15 !text-accent-soft transition hover:!bg-accent/30">
              <Icon name="focus" size={12} /> Show me: {displayName(d!)}
            </button>
          ))}
          {ttsSupported && (
            <button onClick={() => speak(m.content, m.lang)} className="chip transition hover:bg-white/10" title="Replay answer aloud" aria-label="Replay answer aloud">
              <Icon name="play" size={11} /> Replay
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChatPanel({ phone }: { phone: boolean }) {
  const messages = useSkelly((s) => s.messages);
  const pending = useSkelly((s) => s.pending);
  const muted = useSkelly((s) => s.muted);
  const speaking = useSkelly((s) => s.speaking);
  const listening = useSkelly((s) => s.listening);
  const lang = useSkelly((s) => s.lang);
  const sex = useAtlasStore((s) => s.sex);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const sel = getStructure(sex, selectedId);
  const [text, setText] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending]);
  useEffect(() => {
    if (!phone) input.current?.focus();
  }, [phone]);

  const send = (q: string) => {
    const t = q.trim();
    if (!t || pending) return;
    setText('');
    ask(t);
  };
  const mic = () => {
    setMicError(null);
    if (listening) return stopListening();
    listen(
      lang,
      (t, final) => {
        setText(t);
        if (final) send(t);
      },
      setMicError,
    );
  };
  const show = (id: string) => {
    useAtlasStore.getState().setScreen('explorer');
    revealAndFocus(id);
  };
  const close = () => {
    stopListening();
    useSkelly.getState().setOpen(false);
  };
  const name = sel ? displayName(sel) : undefined;

  return (
    <motion.div
      role="dialog"
      aria-label="Skelly, AI anatomy tutor"
      initial={phone ? { y: '100%' } : { opacity: 0, x: 16, scale: 0.97 }}
      animate={phone ? { y: 0 } : { opacity: 1, x: 0, scale: 1 }}
      exit={phone ? { y: '100%' } : { opacity: 0, x: 16, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className={
        phone
          ? 'glass-strong pointer-events-auto fixed inset-x-0 bottom-0 z-[45] flex h-[66vh] flex-col rounded-t-[22px] font-sans text-white'
          : 'glass-strong pointer-events-auto flex h-[min(520px,calc(100vh-260px))] w-[360px] flex-col rounded-[18px]'
      }
    >
      {phone && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-white/25" />}
      {/* header */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            Skelly
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-accent-soft">AI tutor</span>
          </div>
          <div className="truncate text-[11px] text-white/45">{pending ? 'Thinking…' : speaking ? 'Speaking…' : listening ? 'Listening…' : name ? `Context: ${name}` : 'Ask me about any body part'}</div>
        </div>
        {speaking && (
          <button className="btn !p-1.5" onClick={stopSpeaking} title="Stop speaking" aria-label="Stop speaking">
            <Icon name="pause" size={15} />
          </button>
        )}
        {ttsSupported && (
          <button
            className={`btn !p-1.5 ${muted ? 'text-amber' : ''}`}
            onClick={() => {
              const m = !muted;
              useSkelly.getState().setMuted(m);
              if (m) stopSpeaking();
            }}
            title={muted ? 'Unmute Skelly' : 'Mute Skelly'}
            aria-label={muted ? 'Unmute Skelly' : 'Mute Skelly'}
            aria-pressed={muted}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
            </svg>
          </button>
        )}
        {messages.length > 0 && (
          <button className="btn !p-1.5" onClick={() => { stopSpeaking(); useSkelly.getState().clear(); }} title="Clear chat" aria-label="Clear chat">
            <Icon name="reset" size={14} />
          </button>
        )}
        <button className="btn !p-1.5" onClick={close} aria-label="Close chat">
          <Icon name="close" size={15} />
        </button>
      </div>

      {/* messages */}
      <div ref={list} className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="self-start rounded-2xl rounded-bl-md bg-white/[0.07] px-3 py-2 text-[13px] leading-relaxed text-white/85">
            Hi, I’m Skelly! 💀 Ask me about any bone, muscle or organ — in English or हिंदी. {name ? <>You’ve selected <b className="text-white">{name}</b>, so I’ll use it as context.</> : 'Select a structure and I’ll use it as context.'}
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} onShow={show} />
        ))}
        {pending && (
          <div className="flex gap-1 self-start rounded-2xl bg-white/[0.07] px-3 py-3" aria-label="Skelly is thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* suggestion chips */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 scroll-thin">
        {CHIPS.map((c) => (
          <button key={c.label} disabled={pending} onClick={() => send(lang === 'hi-IN' ? c.hi(name) : c.en(name))} className="chip shrink-0 transition hover:bg-white/10 disabled:opacity-40">
            {c.label}
          </button>
        ))}
      </div>

      {/* input */}
      <form
        className="flex items-center gap-2 border-t border-white/[0.08] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="flex shrink-0 rounded-lg bg-black/30 p-0.5" role="radiogroup" aria-label="Voice input language">
          {(['en-IN', 'hi-IN'] as SpeechLang[]).map((l) => (
            <button
              type="button"
              key={l}
              role="radio"
              aria-checked={lang === l}
              onClick={() => useSkelly.getState().setLang(l)}
              className={`rounded-md px-1.5 py-1 text-[11px] font-semibold transition ${lang === l ? 'bg-accent text-white' : 'text-white/55 hover:text-white'}`}
            >
              {l === 'en-IN' ? 'EN' : 'हिंदी'}
            </button>
          ))}
        </div>
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            e.stopPropagation();
          }}
          placeholder={listening ? (lang === 'hi-IN' ? 'सुन रहा हूँ…' : 'Listening…') : lang === 'hi-IN' ? 'अपना प्रश्न लिखें…' : 'Ask Skelly…'}
          aria-label="Your question"
          maxLength={1500}
          className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-[13px] text-white placeholder:text-white/35 focus:border-accent focus:outline-none"
        />
        {sttSupported && (
          <button
            type="button"
            onClick={mic}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${listening ? 'animate-pulse bg-red-500/80 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
            aria-label={listening ? 'Stop listening' : `Speak your question (${lang === 'hi-IN' ? 'Hindi' : 'English'})`}
            title={listening ? 'Stop listening' : 'Speak your question'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
        <button type="submit" disabled={!text.trim() || pending} className="btn btn-active h-9 !px-3 disabled:opacity-40" aria-label="Send">
          <Icon name="right" size={15} />
        </button>
      </form>
      {micError && <div className="px-4 pb-2 text-[11.5px] text-amber">{micError}</div>}
    </motion.div>
  );
}

/** Skelly avatar + chat, positioned by the caller (bottom-right of the canvas area). */
export function Skelly({ phone }: { phone: boolean }) {
  const open = useSkelly((s) => s.open);
  const screen = useAtlasStore((s) => s.screen);
  // stop talking / listening when leaving the explorer or closing
  useEffect(() => {
    if (screen !== 'explorer') stopListening();
  }, [screen]);
  if (screen !== 'explorer') return null;
  return (
    <div className="pointer-events-none flex items-end gap-3">
      <AnimatePresence>{open && !phone && <ChatPanel key="panel" phone={false} />}</AnimatePresence>
      <SkellyAvatar height={phone ? 112 : 160} />
      {/* phone: bottom sheet rendered at the document root so it sits above the Explore sheet */}
      {createPortal(<AnimatePresence>{open && phone && <ChatPanel key="sheet" phone />}</AnimatePresence>, document.body)}
    </div>
  );
}
