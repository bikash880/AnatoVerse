/**
 * Small shared UI pieces: logo, icons, switch, segmented control, slider.
 */
import type { CSSProperties, ReactNode } from 'react';

/** Line-art heart combined with an orbit ring. */
export function Logo({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path
        d="M24 38s-12-7.4-12-16.2A6.6 6.6 0 0 1 24 18a6.6 6.6 0 0 1 12 3.8C36 30.6 24 38 24 38z"
        stroke="#14B8A6"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <ellipse cx="24" cy="26" rx="20" ry="7.5" transform="rotate(-18 24 26)" stroke="#14B8A6" strokeWidth="1.8" opacity="0.85" />
      <circle cx="42.6" cy="19.4" r="2.2" fill="#14B8A6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo />
      <div className="leading-tight">
        <div className="text-[17px] font-semibold tracking-tight text-white">
          Anato<span className="text-accent">Verse</span>
        </div>
        <div className="text-[11px] font-medium text-white/45">3D Anatomy Atlas</div>
      </div>
    </div>
  );
}

type IconName =
  | 'search' | 'back' | 'close' | 'reset' | 'eye-off' | 'isolate' | 'layers' | 'focus' | 'bookmark' | 'bookmark-fill'
  | 'up' | 'down' | 'left' | 'right' | 'plus' | 'minus' | 'quiz' | 'cards' | 'info' | 'play' | 'pause' | 'scissors'
  | 'tag' | 'check' | 'x' | 'list' | 'download' | 'flip' | 'body' | 'eye' | 'rot-l' | 'rot-r' | 'spin';

const PATHS: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>,
  'eye-off': <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  isolate: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></>,
  focus: <><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /><circle cx="12" cy="12" r="2.5" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  'bookmark-fill': <path d="M6 3h12v18l-6-4-6 4z" fill="currentColor" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  quiz: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  cards: <><rect x="3" y="6" width="14" height="14" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.5" r=".6" fill="currentColor" /></>,
  play: <path d="M7 5l12 7-12 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
  tag: <><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  check: <path d="M5 12l5 5L20 7" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  flip: <><path d="M4 7h13l-3-3M20 17H7l3 3" /></>,
  eye: <><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  'rot-l': <><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 3.5V8h4.5" /></>,
  'rot-r': <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 3.5V8h-4.5" /></>,
  spin: <><ellipse cx="12" cy="12" rx="9" ry="3.5" /><path d="M12 3v18" /><path d="m17.5 14.6 2.2-.9-.6 2.3" /></>,
  body: <><circle cx="12" cy="4.5" r="2" /><path d="M8 9h8l-1 6h-2l-.5 6h-1L11 15H9z" /></>,
};

export function Icon({ name, size = 16, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-accent' : 'bg-white/15'}`}
    >
      <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[19px]' : 'left-[3px]'}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className = '' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`flex rounded-xl bg-black/30 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${value === o.value ? 'bg-accent text-white shadow-[0_0_14px_-4px_#14B8A6]' : 'text-white/60 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      className="slider w-full"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--fill' as string]: `${fill}%` }}
      onChange={(e) => onChange(+e.target.value)}
      onPointerUp={(e) => onCommit?.(+(e.target as HTMLInputElement).value)}
      onKeyUp={(e) => onCommit?.(+(e.target as HTMLInputElement).value)}
    />
  );
}
