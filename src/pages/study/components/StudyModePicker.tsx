import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { StudyMode } from '../lib/viewPrefs';

const MODES: StudyMode[] = ['normal', 'shadowing'];

/**
 * Normal - Shadowing, with one line saying what the picked one does.
 *
 * The mode is a standing choice: once shadowing is picked it opens EVERY later
 * session, so it is in view before each start, one click from changing. The
 * selection is the primary green, not the accent: the accent on a card belongs to
 * its one action, Start.
 */
export function StudyModePicker({
  mode,
  onChange,
  disabled = false,
  className,
  tourId,
}: {
  mode: StudyMode;
  onChange: (mode: StudyMode) => void;
  disabled?: boolean;
  className?: string;
  /** `data-tour` target, for the one picker the guided tour points at. */
  tourId?: string;
}) {
  const { t } = useTranslation('study');
  return (
    <div className={cn('space-y-1.5', className)} data-tour={tourId}>
      <div
        role="radiogroup"
        aria-label={t('landing.modeLabel')}
        className="inline-flex rounded-lg border border-border bg-muted p-0.5"
      >
        {MODES.map((key) => {
          const on = key === mode;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => !on && onChange(key)}
              className={cn(
                'inline-flex items-center rounded-md px-3.5 py-1.5 text-[13px] font-bold transition-colors disabled:opacity-50',
                on
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              {t(`landing.mode.${key}`)}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-snug text-caption">{t(`landing.modeHint.${mode}`)}</p>
    </div>
  );
}
