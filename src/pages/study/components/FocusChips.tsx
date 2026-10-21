import { useTranslation } from 'react-i18next';
import { Scale, Headphones, PenLine, Eye, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudyStore } from '../stores/studyStore';
import { FOCUS_PRESETS, FOCUS_WEIGHTS, focusFromWeights, type StudyFocus } from '../types';

const FOCUS_ICON: Record<StudyFocus, LucideIcon> = {
  balanced: Scale,
  listening: Headphones,
  production: PenLine,
  recognition: Eye,
};

const ACTIVE_CHIP = 'border-primary/50 bg-primary/15 text-primary';
const IDLE_CHIP = 'border-border bg-card text-muted-foreground hover:border-primary/40';

interface Props {
  disabled?: boolean;
  className?: string;
  /** Opens the detailed per-activity editor (Settings → Activities). */
  onCustomize?: () => void;
}

/**
 * Focus selector — preset chips (Balanced / Listening / Production / Recognition).
 * A chip writes that weight preset into `activity_weights`, which is the single
 * source of truth shared with Settings → Activities. So the highlighted chip is
 * *derived* from the saved weights; hand-tuning them there shows up as "Custom".
 * Presets only change weights, never which activities are enabled.
 */
export function FocusChips({ disabled = false, className, onCustomize }: Props) {
  const { t } = useTranslation('study');
  const config = useStudyStore((s) => s.config);
  const updateConfig = useStudyStore((s) => s.updateConfig);
  const saving = useStudyStore((s) => s.savingConfig);

  const derived = focusFromWeights(config?.activity_weights);
  const stored = config?.focus ?? null;
  // The persisted choice decides "Custom" (it has no weights of its own); presets
  // stay authoritative from the saved weights. Older configs (focus null) derive.
  const selected: StudyFocus | 'custom' =
    stored === 'custom' || derived === 'custom' ? 'custom' : derived;
  const busy = disabled || saving;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {FOCUS_PRESETS.map((focus) => {
          const Icon = FOCUS_ICON[focus];
          const active = selected === focus;
          return (
            <button
              key={focus}
              type="button"
              onClick={() => {
                if (!active) updateConfig({ focus, activity_weights: FOCUS_WEIGHTS[focus] });
              }}
              disabled={busy}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                active ? ACTIVE_CHIP : IDLE_CHIP,
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {t(`focus.${focus}`)}
            </button>
          );
        })}

        {/* "Custom" — jumps into Settings → Activities. Always visible when the
            editor is wired; highlighted once the saved weights match no preset. */}
        {onCustomize ? (
          <button
            type="button"
            onClick={() => {
              if (selected === 'custom') onCustomize();
              else updateConfig({ focus: 'custom' });
            }}
            disabled={busy}
            aria-pressed={selected === 'custom'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed',
              selected === 'custom' ? ACTIVE_CHIP : IDLE_CHIP,
            )}
          >
            <SlidersHorizontal className="h-3 w-3 shrink-0" />
            {t('focus.custom')}
          </button>
        ) : (
          selected === 'custom' && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
                ACTIVE_CHIP,
              )}
            >
              <SlidersHorizontal className="h-3 w-3 shrink-0" />
              {t('focus.custom')}
            </span>
          )
        )}
      </div>

      {/* One-line explanation of the selected focus; Custom also links to the editor. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t(`focus.desc.${selected}`)}
      </p>
      {selected === 'custom' && onCustomize && (
        <button
          type="button"
          onClick={onCustomize}
          disabled={busy}
          className="inline-flex items-center gap-1 self-start text-[11px] font-semibold text-primary transition-colors hover:opacity-80 disabled:opacity-50"
        >
          <SlidersHorizontal className="h-3 w-3 shrink-0" />
          {t('focus.customize')}
        </button>
      )}
    </div>
  );
}
