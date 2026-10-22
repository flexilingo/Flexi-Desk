import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LanguageOption } from './languages';
import { LocaleBadge } from './LocaleBadge';

/**
 * One language decision on one surface: a menu under its trigger (the parent is
 * `relative`). A tap on a language applies it and closes; typing filters by code,
 * English name or native name, and Enter takes the first match.
 */
export function LanguagePickerSheet({
  title,
  languages,
  value,
  onSelect,
  onClose,
}: {
  title: string;
  languages: LanguageOption[];
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('wordDialog');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? languages.filter(
            (l) =>
              l.code.toLowerCase().startsWith(q) ||
              l.name.toLowerCase().includes(q) ||
              l.nativeName.toLowerCase().includes(q),
          )
        : languages,
    [languages, q],
  );

  const pick = (code: string) => {
    onSelect(code);
    onClose();
  };

  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default"
      />
      <div
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Handled here, so the word dialog's own Escape closes only this menu.
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        className="absolute end-0 top-full z-[61] mt-2 flex max-h-[440px] w-[340px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <p className="m-0 text-[13px] font-bold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mx-4 mb-2 flex h-9 shrink-0 items-center gap-2 rounded-[9px] border border-border bg-background px-3 focus-within:border-primary">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault();
                pick(matches[0].code);
              }
            }}
            placeholder={t('languagePicker.search')}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-muted-foreground">
              {t('languagePicker.noMatch')}
            </p>
          ) : (
            matches.map((lang) => {
              const active = lang.code === value;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => pick(lang.code)}
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-[38px] w-full items-center gap-3 rounded-[9px] px-3 text-start text-[13px] transition-colors',
                    active
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <LocaleBadge code={lang.code} size={22} />
                  <bdi className="min-w-0 truncate">{lang.nativeName}</bdi>
                  {lang.nativeName !== lang.name && (
                    <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                      {lang.name}
                    </span>
                  )}
                  {active && <Check className="ms-auto h-4 w-4 shrink-0" strokeWidth={3} />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
