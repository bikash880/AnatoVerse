import { AnimatePresence, motion } from 'framer-motion';
import { useAtlasStore } from '../store/useAtlasStore';
import { Logo } from './ui';

/** Full-screen splash while the first systems stream in. */
export function LoadingScreen() {
  const bootstrapped = useAtlasStore((s) => s.bootstrapped);
  const loading = useAtlasStore((s) => s.loading);
  return (
    <AnimatePresence>
      {!bootstrapped && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(20,184,166,0.16),transparent_55%)]" />
          <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.1 }}>
            <Logo size={84} />
          </motion.div>
          <div className="mt-5 text-3xl font-semibold tracking-tight">
            Anato<span className="text-accent">Verse</span>
          </div>
          <div className="mt-1 text-sm text-white/50">Explore every structure of the human body in 3D.</div>
          <div className="mt-8 h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.round(loading.progress * 100)}%` }} transition={{ ease: 'easeOut' }} />
          </div>
          <div className="mt-3 text-xs text-white/45">
            {loading.label} {Math.round(loading.progress * 100)}%
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
