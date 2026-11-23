/**
 * Skelly's voice (speechSynthesis) and ears (SpeechRecognition).
 *
 * Voice: an en-IN or hi-IN voice to match the answer's language, pitch 0.8 and rate 0.95 for a
 * deeper, slightly slower "skeleton" voice. Answers are queued sentence by sentence because some
 * browsers (Chrome) silently stop long utterances. `mouth` exposes a live 0..1 level that the 3D
 * jaw reads every frame; word-boundary events make it pulse in sync with speech.
 */
import { useSkelly, type SpeechLang } from './skellyStore';

export const mouth = { level: 0, lastBoundary: 0, speaking: false };

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voices: SpeechSynthesisVoice[] = [];
const loadVoices = () => (voices = synth?.getVoices() ?? []);
loadVoices();
synth?.addEventListener?.('voiceschanged', loadVoices);

export const ttsSupported = !!synth;

/** Devanagari text → Hindi voice, otherwise Indian English. */
export const detectLang = (text: string): SpeechLang => (/[ऀ-ॿ]/.test(text) ? 'hi-IN' : 'en-IN');

function pickVoice(lang: SpeechLang) {
  if (!voices.length) loadVoices();
  const base = lang.slice(0, 2);
  return (
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

let generation = 0;

export function stopSpeaking() {
  generation++;
  synth?.cancel();
  mouth.speaking = false;
  useSkelly.getState().setSpeaking(false);
}

export function speak(text: string, lang: SpeechLang = detectLang(text)) {
  if (!synth) return;
  stopSpeaking();
  const gen = generation;
  // split into sentences (English . ! ? and Hindi danda ।) so long answers are not cut off
  const parts = text.match(/[^.!?।]+[.!?।]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const voice = pickVoice(lang);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = lang;
    try {
      if (voice) u.voice = voice; // some engines reject voices from another engine; fall back to lang only
    } catch {
      /* keep u.lang */
    }
    u.pitch = 0.8;
    u.rate = 0.95;
    u.onstart = () => {
      if (gen !== generation) return;
      mouth.speaking = true;
      mouth.lastBoundary = performance.now();
      useSkelly.getState().setSpeaking(true);
    };
    u.onboundary = () => {
      mouth.lastBoundary = performance.now();
    };
    const done = () => {
      if (gen !== generation || i !== parts.length - 1) return;
      mouth.speaking = false;
      useSkelly.getState().setSpeaking(false);
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  });
}

/** Jaw opening for this frame (0..1): pulses on word boundaries, with a syllable-rate wobble. */
export function mouthLevel(t: number) {
  if (!mouth.speaking) return 0;
  const sinceWord = (performance.now() - mouth.lastBoundary) / 1000;
  const pulse = Math.exp(-sinceWord * 7); // opens on each word, closes over ~150 ms
  const wobble = 0.5 + 0.5 * Math.sin(t * 17) * Math.sin(t * 5.3);
  return Math.min(1, 0.25 + 0.55 * Math.max(pulse, wobble * 0.8));
}

/* ------------------------- voice input ------------------------- */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const RecognitionCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)
    : undefined;

export const sttSupported = !!RecognitionCtor;
let active: Recognition | null = null;

/**
 * Listen once in the given language. `onText` receives interim text while speaking and is called
 * with `final = true` when the phrase is complete.
 */
export function listen(lang: SpeechLang, onText: (text: string, final: boolean) => void, onError: (msg: string) => void) {
  if (!RecognitionCtor) return onError('Voice input is not supported in this browser — try Chrome or Edge.');
  stopListening();
  stopSpeaking(); // don't transcribe Skelly's own voice
  const r = new RecognitionCtor();
  r.lang = lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    onText((finalText + interim).trim(), false);
  };
  r.onerror = (e) => {
    const msg =
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone permission was denied.'
        : e.error === 'no-speech'
          ? "I didn't hear anything — tap the mic and try again."
          : e.error === 'network'
            ? 'Voice recognition needs an internet connection.'
            : `Voice input error (${e.error}).`;
    onError(msg);
  };
  r.onend = () => {
    useSkelly.getState().setListening(false);
    active = null;
    if (finalText.trim()) onText(finalText.trim(), true);
  };
  active = r;
  useSkelly.getState().setListening(true);
  r.start();
}

export function stopListening() {
  active?.stop();
}
