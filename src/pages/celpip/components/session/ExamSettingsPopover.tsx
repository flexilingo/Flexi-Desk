import { Languages, Settings2, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FONT_SCALE_STEPS, useExamSettings } from './ExamSettingsContext';

interface Props {
  /** Tap-to-translate exists only in learning mode — a timed exam has no dictionary. */
  learningMode: boolean;
  translateOn: boolean;
  onToggleTranslate: (on: boolean) => void;
}

/**
 * In-exam settings, anchored under the header gear. Ported from mobile's
 * `ExamSettingsSheet` — the text-size control existed nowhere else.
 *
 * Text size is always available; tap-to-translate appears only in learning mode.
 */
export function ExamSettingsPopover({ learningMode, translateOn, onToggleTranslate }: Props) {
  const { t } = useTranslation('celpip');
  const { fontScale, setFontScale } = useExamSettings();

  const previewSize = Math.round(15 * fontScale * 10) / 10;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 px-0"
          aria-label={t('examSettingsTitle')}
          title={t('examSettingsTitle')}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[286px] p-4">
        <p className="mb-3 text-sm font-bold text-foreground">{t('examSettingsTitle')}</p>

        {/* ── Text size ── */}
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Type className="h-3.5 w-3.5 text-accent" />
            {t('examSettingsTextSize')}
          </span>

          <div className="flex gap-1.5" role="group" aria-label={t('examSettingsTextSize')}>
            {FONT_SCALE_STEPS.map((step, i) => {
              const selected = Math.abs(step - fontScale) < 0.001;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => setFontScale(step)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex h-11 flex-1 items-center justify-center rounded-[10px] border transition-colors',
                    selected
                      ? 'border-accent bg-accent/10 font-bold text-accent'
                      : 'border-border bg-card font-semibold text-muted-foreground hover:bg-muted',
                    // Each step's own `A` grows, so the control shows what it does.
                    ['text-[11px]', 'text-[13px]', 'text-[16px]', 'text-[18px]', 'text-[21px]'][i],
                  )}
                >
                  A
                </button>
              );
            })}
          </div>

          {/* Live preview at the chosen size. */}
          <div className="rounded-[10px] border border-border bg-muted p-2.5">
            <p
              className="text-foreground"
              // The one dynamic value here: a user-chosen size, same exception as `ExamText`.
              style={{
                fontSize: `${previewSize}px`,
                lineHeight: `${Math.round(previewSize * 1.4)}px`,
              }}
            >
              {t('examSettingsPreview')}
            </p>
          </div>
        </div>

        {/* ── Tap to translate (learning mode only) ── */}
        {learningMode && (
          <>
            <div className="my-4 h-px bg-border" />

            <button
              type="button"
              role="switch"
              aria-checked={translateOn}
              onClick={() => onToggleTranslate(!translateOn)}
              className="flex w-full items-center justify-between gap-3 text-start"
            >
              <span className="flex-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Languages className="h-3.5 w-3.5 text-accent" />
                  {t('examSettingsTranslate')}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {t('examSettingsTranslateHint')}
                </span>
              </span>

              <span
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  translateOn ? 'bg-accent' : 'bg-muted-foreground/40',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-card transition-transform',
                    translateOn ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
