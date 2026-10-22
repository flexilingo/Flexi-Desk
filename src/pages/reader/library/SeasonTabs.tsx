import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SeasonTab = {
  number: number;
  /** "Season 2" */
  label: string;
  /** The season's own name, in the book's language; null when it has none. */
  title: string | null;
};

/**
 * A series page's seasons as tabs — one season's episodes on screen at a time (the website's
 * `SeasonTabs`). Which tab is open is the caller's: the continue episode's season until the
 * reader picks one. Arrow keys move between tabs, as a tab list should.
 */
export function SeasonTabs({
  tabs,
  active,
  onPick,
  lang,
  ariaLabel,
  children,
}: {
  tabs: SeasonTab[];
  active: number;
  onPick: (n: number) => void;
  lang: string;
  ariaLabel: string;
  /** The open season's panel. */
  children: ReactNode;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onPick(next.number);
    document.getElementById(`season-tab-${next.number}`)?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((t, i) => {
          const selected = t.number === active;
          return (
            <button
              key={t.number}
              id={`season-tab-${t.number}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`season-${t.number}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onPick(t.number)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-4 pb-2.5 pt-2 text-start transition-colors',
                selected
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="block text-[14px] font-bold">{t.label}</span>
              {t.title && (
                <span
                  className="mt-0.5 block max-w-[15rem] truncate text-[12px] font-medium text-caption"
                  lang={lang}
                  dir="auto"
                >
                  {t.title}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`season-${active}`}
        role="tabpanel"
        aria-labelledby={`season-tab-${active}`}
        className="pt-5"
      >
        {children}
      </div>
    </div>
  );
}
