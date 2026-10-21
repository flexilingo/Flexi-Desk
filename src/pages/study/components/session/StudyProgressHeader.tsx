import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, Clock, RotateCcw, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CardProgressSnapshot } from '../../types';
import { cardTypeFromProgress } from '../../utils/srs-display';

interface Props {
  total: number;
  remaining: number;
  correct: number;
  incorrect: number;
  elapsedSeconds: number;
  cardProgress: CardProgressSnapshot | null;
  /** How many times this card has already come round in this session. */
  requeueCount: number;
  /** Shows the previous card's answer; undefined on the first card. */
  onPrevCard?: () => void;
  onSettings: () => void;
  onExit: () => void;
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

export function StudyProgressHeader({
  total,
  remaining,
  correct,
  incorrect,
  elapsedSeconds,
  cardProgress,
  requeueCount,
  onPrevCard,
  onSettings,
  onExit,
}: Props) {
  const { t } = useTranslation('study');
  const done = Math.max(0, total - remaining);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const cardType = cardTypeFromProgress(cardProgress);

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
          {/* SRS card type */}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase',
              CARD_TYPE_CLS[cardType],
            )}
          >
            {t(`runner.cardType.${cardType}`)}
          </span>

          {/* This card has come round again inside the session */}
          {requeueCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-warning"
              title={t('runner.requeued')}
            >
              <RotateCcw className="h-3 w-3" />
              {requeueCount}
            </span>
          )}

          <span className="inline-flex items-center gap-1 text-success">
            <Check className="h-3.5 w-3.5" />
            {correct}
          </span>
          <span className="inline-flex items-center gap-1 text-error">
            <X className="h-3.5 w-3.5" />
            {incorrect}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {fmt(elapsedSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('runner.remaining', { count: remaining })}
          </span>
          {onPrevCard && (
            <Button variant="ghost" size="icon" onClick={onPrevCard} title={t('runner.prevCard')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onSettings} title={t('landing.settings')}>
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onExit}>
            {t('runner.exit')}
          </Button>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
