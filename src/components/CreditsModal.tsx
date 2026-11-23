import { AnimatePresence, motion } from 'framer-motion';
import { useAtlasStore } from '../store/useAtlasStore';
import { exportRecords } from '../anatomy/catalog';
import { getModelManifest } from '../modelsInit';
import { Icon, Logo } from './ui';

const SHORTCUTS: [string, string][] = [
  ['1 – 5', 'Front · Back · Left · Right · 3/4 view'],
  ['E', 'Explode (60% radial → 100% parts grid)'],
  ['R', 'Reassemble'],
  ['F', 'Focus camera on selection'],
  ['L', 'Cycle name labels: Off → Selected → Group → All'],
  ['Esc', 'Deselect / close'],
  ['/', 'Search'],
];

export function CreditsModal() {
  const open = useAtlasStore((s) => s.creditsOpen);
  const sex = useAtlasStore((s) => s.sex);
  const close = () => useAtlasStore.getState().setCreditsOpen(false);

  const download = () => {
    const blob = new Blob([JSON.stringify(exportRecords(sex), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `structures-${sex}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="credits-title"
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong scroll-thin max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[18px] p-6"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Logo size={40} />
                <div>
                  <h2 id="credits-title" className="text-xl font-semibold">About &amp; Credits</h2>
                  <p className="text-[12.5px] text-white/55">AnatoVerse — Explore every structure of the human body in 3D.</p>
                </div>
              </div>
              <button className="btn !p-1.5" onClick={close} aria-label="Close"><Icon name="close" /></button>
            </div>

            <section className="space-y-2 text-[13px] leading-relaxed text-white/75">
              <h3 className="section-title">Anatomical models</h3>
              <p>
                {getModelManifest()?.male ? 'The male body and the seven organ models are' : 'When built, the male body and organ models are'} derived from{' '}
                <a className="text-accent-soft underline" href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noreferrer">BodyParts3D</a>, © The Database Center for Life
                Science, licensed under{' '}
                <a className="text-accent-soft underline" href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">CC BY-SA 2.1 Japan</a>. The converted,
                Draco-compressed models are shared under the same licence.
              </p>
              <p>
                Structures the dataset does not contain were added by AnatoVerse and are labelled as such: lung lobe surfaces and the ventricular myocardium are <b className="text-white">reconstructed</b>{' '}
                as envelopes around the real airways, cardiac chambers and coronary vessels; most muscles, the peripheral and cranial nerves, spinal cord, lymph nodes and some gut and genital organs are
                <b className="text-white"> schematic</b> models fitted onto the real skeleton with a landmark-based warp. The female body is the same real anatomy reshaped by a landmark-guided morph (narrower shoulders and rib cage, wider pelvis and sacrum, smaller stature), with AnatoVerse female reproductive organs fitted into the pelvis. No open, layered real female dataset was available.
              </p>
              <p>Z-Anatomy (needs Blender to export), NIH 3D and Sketchfab models (download requires an account / API token) are not bundled.</p>
              <p>
                Lighting: “Studio Small 09” HDRI from{' '}
                <a className="text-accent-soft underline" href="https://polyhaven.com/a/studio_small_09" target="_blank" rel="noreferrer">Poly Haven</a> (CC0).
              </p>
              <p>Descriptive text, clinical notes and the partial Terminologia Anatomica IDs are educational summaries — verify against TA2 and your course materials. AnatoVerse is a study aid, not a substitute for dissection, imaging or a validated atlas.</p>
            </section>

            <section className="mt-5">
              <h3 className="section-title mb-2">Keyboard shortcuts</h3>
              <ul className="grid gap-1.5 text-[13px]">
                {SHORTCUTS.map(([k, v]) => (
                  <li key={k} className="flex items-center gap-3">
                    <kbd className="min-w-[52px] rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-center font-mono text-[11.5px] text-white/85">{k}</kbd>
                    <span className="text-white/70">{v}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5">
              <h3 className="section-title mb-2">Built with</h3>
              <p className="text-[12.5px] text-white/60">React, TypeScript, Vite, three.js, @react-three/fiber, drei, Zustand, Framer Motion, GSAP, Fuse.js, Tailwind CSS. Fonts: Inter, Playfair Display.</p>
            </section>

            <button className="btn mt-5 w-full border border-white/10" onClick={download}>
              <Icon name="download" size={14} /> Export structures.json ({sex})
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
