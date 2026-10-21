import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { targetLanguages } from '@/config/languages';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';

/**
 * Switches the language translations are shown in, from wherever the user happens
 * to be reading. It writes to the shared language store, so the dictionary, the
 * subtitle bar and the deck builder all follow — the same "one global choice"
 * behaviour the web app has.
 *
 * Front labels each row with a flag emoji. Desk forbids emoji, so the language
 * code carries that job in a monospace chip.
 */
export function TranslationLanguagePicker({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { nativeLang, setNativeLang } = useLanguageSettings();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('dictionary.translationLanguage')}
          title={t('dictionary.translationLanguage')}
          className={cn('h-8 w-8 px-0', className)}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] p-3">
        <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Languages className="h-3.5 w-3.5 text-accent" />
          {t('dictionary.translationLanguage')}
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {targetLanguages.map((lang) => {
            const isActive = nativeLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => void setNativeLang(lang.code)}
                aria-pressed={isActive}
                className={cn(
                  'inline-flex min-w-0 items-center gap-2 rounded-[9px] border px-2.5 py-2 text-start text-xs transition-colors',
                  isActive
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {lang.code}
                </span>
                <span className="truncate font-medium" dir={lang.dir}>
                  {lang.nativeName}
                </span>
                {isActive && <Check className="ms-auto h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
