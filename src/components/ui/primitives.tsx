import type { ReactNode } from 'react';
import { RELIABILITY_LABEL, SOURCES } from '../../data/sources';
import type { Reliability } from '../../data/types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export const RELIABILITY_STYLE: Record<Reliability, { dot: string; text: string; ring: string; short: string }> = {
  oficial: { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-400/30', short: 'OFICIAL' },
  secundaria: { dot: 'bg-sky-400', text: 'text-sky-300', ring: 'ring-sky-400/30', short: 'SECUNDÁRIA' },
  estimativa: { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-400/30', short: 'ESTIMATIVA' },
  indisponivel: { dot: 'bg-ink-400', text: 'text-ink-300', ring: 'ring-ink-400/30', short: 'N/D' },
};

export function ReliabilityBadge({ r, compact }: { r: Reliability; compact?: boolean }) {
  const s = RELIABILITY_STYLE[r];
  return (
    <span title={RELIABILITY_LABEL[r]} className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[1px] text-[9px] font-semibold tracking-wider ring-1', s.text, s.ring)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {!compact && s.short}
    </span>
  );
}

export function SourceLinks({ ids, className }: { ids?: string[]; className?: string }) {
  if (!ids?.length) return null;
  return (
    <span className={cx('flex flex-wrap gap-1', className)}>
      {ids.map((id) => {
        const s = SOURCES[id];
        if (!s) return null;
        return (
          <a
            key={id}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            title={`${s.publisher} — ${s.title}${s.date ? ` (${s.date})` : ''}`}
            className="rounded bg-white/5 px-1.5 py-[1px] font-mono text-[9px] text-ink-300 transition hover:bg-white/10 hover:text-white"
          >
            {s.publisher.split(/[ /–(]/)[0]}
          </a>
        );
      })}
    </span>
  );
}

export function IconButton({ children, onClick, active, title, className }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md border text-ink-200 transition',
        active ? 'border-f1/60 bg-f1/15 text-white' : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07] hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'relative flex items-center gap-1.5 rounded-md font-display font-semibold tracking-wide transition',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            value === o.value ? 'bg-white text-ink-950 shadow' : 'text-ink-300 hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[12px] text-ink-200 hover:bg-white/[0.04]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-4 w-7 shrink-0 rounded-full transition', checked ? 'bg-f1' : 'bg-ink-600')}
      >
        <span className={cx('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', checked ? 'left-3.5' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between px-1">
      <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">{children}</h3>
      {right}
    </div>
  );
}
