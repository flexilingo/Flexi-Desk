import { useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { languageLabel, searchLanguages } from '../../lib/deckLanguages';

interface LanguagePickerProps {
  value: string;
  onSelect: (code: string) => void;
  disabled?: boolean;
  /** Codes that cannot be picked (already held). */
  isDisabled?: (code: string) => boolean;
}

/** A searchable language field: type to narrow the list, pick one. */
export function LanguagePicker({ value, onSelect, disabled, isDisabled }: LanguagePickerProps) {
  const { t } = useTranslation('decks');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shown = searchLanguages(query);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground disabled:opacity-50"
        >
          <span className="truncate">
            <bdi>{languageLabel(value)}</bdi>
            <span className="ms-2 font-mono text-[10px] uppercase text-muted-foreground">
              {value}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('form.searchLanguage')}
            className="h-8 w-full rounded-md border border-border bg-transparent ps-7 pe-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <ul className="max-h-56 overflow-y-auto">
          {shown.length === 0 && (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('form.noLanguage')}
            </li>
          )}
          {shown.map((l) => {
            const blocked = isDisabled?.(l.code) ?? false;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    onSelect(l.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted disabled:opacity-40',
                    l.code === value && 'bg-muted font-semibold',
                  )}
                >
                  <span className="truncate">
                    <bdi>{l.nativeName}</bdi>
                    <span className="ms-2 text-xs text-muted-foreground">{l.name}</span>
                  </span>
                  {l.code === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
