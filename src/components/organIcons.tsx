import type { OrganId } from '../types';

/** Minimal line-art organ icons used in the "Organs in 3D" row and the deep-dive header. */
const P: Record<OrganId, JSX.Element> = {
  heart: (
    <>
      <path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z" />
      <path d="M10 8V4.5M13.5 8.5V5" />
    </>
  ),
  lungs: (
    <>
      <path d="M12 4v8M12 12l-2.5 2M12 12l2.5 2" />
      <path d="M9.5 8.5C7 7.5 4 11 4 16c0 2 1.2 3 2.6 3 2 0 3-1.6 3-4V8.5zM14.5 8.5c2.5-1 5.5 2.5 5.5 7.5 0 2-1.2 3-2.6 3-2 0-3-1.6-3-4V8.5z" />
    </>
  ),
  brain: (
    <>
      <path d="M12 5.5c-1-1.6-4.2-1.7-5 .6-2 .2-3 2.4-2 4-1.3 1.3-.8 3.7 1 4.2.2 2.2 2.6 3.2 4.3 2.2.5.8 1 1 1.7 1V5.5z" />
      <path d="M12 5.5c1-1.6 4.2-1.7 5 .6 2 .2 3 2.4 2 4 1.3 1.3.8 3.7-1 4.2-.2 2.2-2.6 3.2-4.3 2.2-.5.8-1 1-1.7 1" />
      <path d="M12 17.5V20" />
    </>
  ),
  kidneys: (
    <>
      <path d="M8.5 4.5C5.5 4.5 4 7.5 4 11s1.5 6.5 4.5 6.5c1.8 0 2.5-1.5 1.8-3-.6-1.2-.6-2.4 0-3.6.7-1.5 0-3.4.7-4.4-.5-1.3-1.3-2-2.5-2zM15.5 4.5c3 0 4.5 3 4.5 6.5s-1.5 6.5-4.5 6.5c-1.8 0-2.5-1.5-1.8-3 .6-1.2.6-2.4 0-3.6-.7-1.5 0-3.4-.7-4.4.5-1.3 1.3-2 2.5-2z" />
      <path d="M10.5 12.5 11 20M13.5 12.5 13 20" />
    </>
  ),
  liver: <path d="M3.5 9.5C5 6 11 5 20.5 6.5c.5 3-2 7.5-6.5 9.5-2.5 1-4.5.5-5.5-1-1.5-2.3-4-1.5-5-5.5z" />,
  stomach: (
    <>
      <path d="M9 3v4c0 1.5-1 2.5-2.5 3.5C4.5 12 4 14 4.5 16c.8 3 4 4.6 7.5 4 4-.7 7-4.4 7-8.5 0-3-2-5.5-4.5-5.5-1.7 0-2.5 1.2-2.5 2.5" />
      <path d="M4.5 16c-1 .5-1.5 1.5-1.5 3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
};

export function OrganIcon({ id, size = 24, className = '' }: { id: OrganId; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {P[id]}
    </svg>
  );
}
