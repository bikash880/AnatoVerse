/**
 * App shell: layout of header, canvas, sidebar / bottom sheet, dock, HUD, study overlays and the
 * Organ Deep-Dive screen. Responsive: phones get a swipe-up bottom sheet and a compact dock.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { useAtlasStore } from '../store/useAtlasStore';
import { useKeyboardShortcuts, useMediaQuery } from '../hooks/useKeyboardShortcuts';
import { BodyExplorer } from './BodyExplorer';
import { ExplorePanel } from './ExplorePanel';
import { ControlDock } from './ControlDock';
import { HoverTooltip, SexSwitch, StudyBar, ViewRail, VisibleBadge } from './CanvasHud';
import { OrganViewer } from './OrganViewer';
import { LoadingScreen } from './LoadingScreen';
import { CreditsModal } from './CreditsModal';
import { Wordmark } from './ui';
import { Skelly } from '../skelly/Skelly';
import { useSkelly } from '../skelly/skellyStore';

export function AppShell() {
  useKeyboardShortcuts();
  const phone = useMediaQuery('(max-width: 767px)');
  const narrow = useMediaQuery('(max-width: 1279px)');
  // the dock wraps to two rows below 1600 px (Labels button added)
  const dockTwoRows = useMediaQuery('(max-width: 1599px)');
  const skellyOpen = useSkelly((s) => s.open);
  const screen = useAtlasStore((s) => s.screen);
  const activeOrgan = useAtlasStore((s) => s.activeOrgan);
  // phones: the bottom sheet opens over the canvas while a structure / study mode is shown
  const sheetOpen = useAtlasStore((s) => !!s.selectedId || s.studyMode !== 'none');

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink font-sans">
      {/* soft radial glow behind the model */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_42%_45%,rgba(20,184,166,0.16),rgba(6,19,22,0)_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_42%_100%,rgba(245,158,11,0.05),transparent_40%)]" />

      <BodyExplorer />

      {/* HUD layer (pointer-events only on children) */}
      <div className={`pointer-events-none absolute inset-0 z-[25] ${phone ? '' : 'right-[372px] lg:right-[392px]'}`}>
        <header className={`pointer-events-auto absolute left-4 top-4 flex items-center sm:left-5 sm:top-5 ${phone ? 'gap-2' : 'gap-4'}`}>
          {!phone && (
            <div className="glass rounded-2xl py-1.5 pl-2 pr-3.5">
              <Wordmark />
            </div>
          )}
          <SexSwitch />
        </header>
        <div className="absolute left-4 top-[68px] sm:left-5 sm:top-[74px]">
          <VisibleBadge />
        </div>
        <div className="absolute right-3 top-4 sm:right-4">
          <StudyBar />
        </div>
        {!(phone && (sheetOpen || skellyOpen)) && (
          <div className={phone ? 'absolute left-2 top-[112px]' : 'absolute left-4 top-1/2 -translate-y-1/2 sm:left-5'}>
            <ViewRail compact={phone} />
          </div>
        )}
        {/* Skelly: bottom-right of the canvas, left of the Explore panel, above the dock */}
        <div className={`absolute z-10 ${phone ? (skellyOpen ? 'right-2 top-[104px]' /* above the chat sheet, so you can watch Skelly talk */ : 'bottom-[296px] right-2') : dockTwoRows ? 'bottom-[150px] right-3' : 'bottom-[104px] right-4'}`}>
          <Skelly phone={phone} />
        </div>
        <div className={`absolute left-0 right-0 flex justify-center px-3 ${phone ? 'bottom-[132px]' : 'bottom-4 sm:bottom-5'}`}>
          <ControlDock compact={phone} narrow={narrow} />
        </div>
      </div>

      {phone ? (
        <BottomSheet />
      ) : (
        <motion.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 140, damping: 20 }}
          className="glass absolute bottom-4 right-4 top-4 z-[25] w-[356px] overflow-hidden rounded-2xl lg:w-[376px]"
          aria-label="Explore panel"
        >
          <ExplorePanel />
        </motion.aside>
      )}

      <AnimatePresence>{screen === 'organ' && activeOrgan && <OrganViewer key={activeOrgan} id={activeOrgan} />}</AnimatePresence>

      {!phone && <HoverTooltip />}
      <CreditsModal />
      <LoadingScreen />
    </div>
  );
}

/** Phone: swipe-up bottom sheet holding the explore panel / info card. */
function BottomSheet() {
  // peek → half (model stays visible above, used for study modes) → full
  const [snap, setSnap] = useState<'peek' | 'half' | 'full'>('peek');
  const selectedId = useAtlasStore((s) => s.selectedId);
  const studyMode = useAtlasStore((s) => s.studyMode);
  const controls = useDragControls();
  const PEEK = 120;
  const order = ['peek', 'half', 'full'] as const;

  const skellyOpen = useSkelly((s) => s.open);
  useEffect(() => {
    // while Skelly's chat sheet is open it owns the screen bottom → keep this sheet collapsed
    if (skellyOpen) setSnap('peek');
    else if (studyMode !== 'none') setSnap('half');
    else if (selectedId) setSnap('full');
  }, [selectedId, studyMode, skellyOpen]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const i = order.indexOf(snap);
    if (info.velocity.y < -300 || info.offset.y < -60) setSnap(order[Math.min(2, i + 1)]);
    else if (info.velocity.y > 300 || info.offset.y > 60) setSnap(order[Math.max(0, i - 1)]);
  };
  const open = snap !== 'peek';

  return (
    <motion.div
      className="glass-strong absolute inset-x-0 bottom-0 z-30 flex h-[78vh] flex-col rounded-t-[22px]"
      animate={{ y: snap === 'full' ? 0 : snap === 'half' ? '34vh' : `calc(78vh - ${PEEK}px)` }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={onDragEnd}
    >
      <button
        className="flex w-full shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-2.5"
        onPointerDown={(e) => controls.start(e)}
        onClick={() => setSnap(open ? 'peek' : 'full')}
        aria-label={open ? 'Collapse panel' : 'Expand panel'}
      >
        <span className="h-1.5 w-10 rounded-full bg-white/25" />
      </button>
      <div className="min-h-0 flex-1">
        <ExplorePanel />
      </div>
    </motion.div>
  );
}
