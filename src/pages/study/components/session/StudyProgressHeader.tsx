import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ChevronLeft, Clock, Minimize2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CardProgressSnapshot } from '../../types';
import { cardTypeFromProgress } from '../../utils/srs-display';
import type { ShadowingProgress } from '../ShadowingRunner';

interface Props {
  total: number;
  remaining: number;
  correct: number;
  incorrect: number;
  elapsedSeconds: number;
  cardProgress: CardProgressSnapshot | null;
  /** How many times this card has already come round in this session. */
  requeueCount: number;
  /** Repeats the session added to its own queue so far — why the denominator can read 31 on a session that began as 30. */
  repeatsAdded: number;
  /** Shows the previous card's answer; undefined on the first card (and in shadowing, which has no card to step back to). */
  onPrevCard?: () => void;
  onExit: () => void;
  /** The display menu + shortcut sheet, built by the runner. */
  controls: ReactNode;
  /** In focus mode the header keeps only what you need mid-card. */
  focusMode: boolean;
  onToggleFocusMode: () => void;
  /** Whether the shadowing drill is the mode on screen. */
  shadowingActive: boolean;
  /** Shadowing's own position and clock, so the header reports the run the learner is actually watching. */
  shadowingProgress?: ShadowingProgress | null;
}

const CARD_TYPE_CLS: Record<string, string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  learning: 'border-warning/40 bg-warning/10 text-warning',
  review: 'border-success/40 bg-success/10 text-success',
};

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The runner's top bar: exit, previous card, the display menu, the tallies, clock and
 * progress. Shadowing never submits an answer, so right/wrong would sit at 0/0 for the
 * whole run and say nothing — it shows its own count, round and playback stopwatch
 * instead (the session clock keeps running while paused and would claim time nobody spent).
 */
export function StudyProgressHeader({
  total,
  remaining,
  correct,
  incorrect,
  elapsedSeconds,
  cardProgress,
  requeueCount,
  repeatsAdded,
  onPrevCard,
  onExit,
  controls,
  focusMode,
  onToggleFocusMode,
  shadowingActive,
  shadowingProgress,
}: Props) {
  const { t } = useTranslation('study');
  // `remaining` is counted after the card on screen is taken, so the card on screen is number total - remaining.
  const done = Math.max(0, total - remaining - 1);
  const pct = shadowingActive
    ? shadowingProgress && shadowingProgress.total > 0
      ? Math.round((shadowingProgress.step / shadowingProgress.total) * 100)
      : 0
    : total > 0
      ? Math.round(((done + 1) / total) * 100)
      : 0;
  const cardType = cardTypeFromProgress(cardProgress);

  return (
    <div
      className="z-40 shrink-0 border-b border-border bg-card/95 backdrop-blur"
      data-testid="study-header"
    >
      <div
        className={cn(
          'mx-auto flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-2 sm:px-4 sm:py-3',
          focusMode ? 'max-w-[72em]' : 'max-w-5xl',
        )}
      >
        {/* Row 1 (narrow window): controls. From `sm` the two groups dissolve into one row. */}
        <div className="flex items-center gap-1.5 sm:contents">
          <Button variant="outline" size="sm" onClick={onExit}>
            <ArrowLeft className="rtl:rotate-180" />
            <span className="hidden sm:inline">{t('runner.exit')}</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onPrevCard}
            disabled={!onPrevCard || shadowingActive}
            title={t('runner.prevCard')}
            aria-label={t('runner.prevCard')}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          {/* Leaving fullscreen: the F key and a row inside the menu are things you must already know. Focus
              mode hides the rest of the app, so the way back out is the one control that must be visible. */}
          {focusMode && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onToggleFocusMode}
              title={t('runner.exitFocus')}
              aria-label={t('runner.exitFocus')}
            >
              <Minimize2 />
            </Button>
          )}
          {controls}
        </div>

        {/* Row 2: progress. */}
        <div className="flex items-center gap-1.5 sm:contents">
          {!focusMode && (
            <>
              {!shadowingActive && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-error/40 bg-error/10 px-2 py-1 text-xs font-bold tabular-nums text-error">
                    <X className="h-3 w-3" /> {incorrect}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-1 text-xs font-bold tabular-nums text-success">
                    <Check className="h-3 w-3" /> {correct}
                  </span>
                </>
              )}
              <span className="hidden items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 font-mono text-xs font-semibold tabular-nums text-muted-foreground sm:inline-flex">
                <Clock className="h-3 w-3" />
                {shadowingActive ? (shadowingProgress?.elapsed ?? '0:00') : fmt(elapsedSeconds)}
              </span>
            </>
          )}
          <div
            className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
          >
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            className="whitespace-nowrap text-xs font-bold tabular-nums text-muted-foreground"
            data-testid="study-counter"
          >
            {shadowingActive
              ? `${shadowingProgress?.step ?? 0} / ${shadowingProgress?.total ?? 0}${
                  shadowingProgress?.round
                    ? ` · ${t('shadowing.round', { pass: shadowingProgress.round })}`
                    : ''
                }`
              : `${Math.min(total, done + 1)} / ${total}`}
          </span>
          {/* One chip, two things to say: on a repeated card it names THIS card's pass; the rest of the time it
              accounts for the session total having grown, from the moment it grows. */}
          {!shadowingActive && (requeueCount > 0 || repeatsAdded > 0) && (
            <span
              title={t('runner.requeueHint')}
              className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-1 text-[11px] font-semibold text-warning"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">
                {requeueCount > 0
                  ? t('runner.requeueBadge', { count: requeueCount })
                  : t('runner.repeatsAdded', { count: repeatsAdded })}
              </span>
            </span>
          )}
          {!focusMode && !shadowingActive && (
            <span
              className={cn(
                'hidden rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase sm:inline-flex',
                CARD_TYPE_CLS[cardType],
              )}
            >
              {t(`runner.cardType.${cardType}`)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
