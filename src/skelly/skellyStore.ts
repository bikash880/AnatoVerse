import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type SpeechLang = 'en-IN' | 'hi-IN';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** structure names Claude said the answer is about (English) */
  structures?: string[];
  /** catalog ids those names matched in the 3D model */
  matches?: string[];
  lang?: SpeechLang;
  error?: boolean;
}

interface SkellyState {
  open: boolean;
  messages: ChatMessage[];
  pending: boolean;
  muted: boolean;
  /** recognition language (EN / हिंदी switch) */
  lang: SpeechLang;
  speaking: boolean;
  listening: boolean;
  setOpen: (o: boolean) => void;
  add: (m: ChatMessage) => void;
  setPending: (p: boolean) => void;
  setMuted: (m: boolean) => void;
  setLang: (l: SpeechLang) => void;
  setSpeaking: (s: boolean) => void;
  setListening: (l: boolean) => void;
  clear: () => void;
}

/** Skelly chat state; history lives for the browser session (sessionStorage). */
export const useSkelly = create<SkellyState>()(
  persist(
    (set) => ({
      open: false,
      messages: [],
      pending: false,
      muted: false,
      lang: 'en-IN',
      speaking: false,
      listening: false,
      setOpen: (open) => set({ open }),
      add: (m) => set((s) => ({ messages: [...s.messages, m] })),
      setPending: (pending) => set({ pending }),
      setMuted: (muted) => set({ muted }),
      setLang: (lang) => set({ lang }),
      setSpeaking: (speaking) => set({ speaking }),
      setListening: (listening) => set({ listening }),
      clear: () => set({ messages: [] }),
    }),
    {
      name: 'anatoverse-skelly',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ messages: s.messages, muted: s.muted, lang: s.lang }),
    },
  ),
);

export const newId = () => Math.random().toString(36).slice(2, 10);
