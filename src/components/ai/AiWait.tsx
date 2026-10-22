import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock, RefreshCw, Settings2, Square, TimerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatElapsed, type AiStopKind } from '@/lib/aiSource';
import { useElapsedSeconds } from '@/lib/aiWait';

/** After this long, say that the user's own AI can be slow and where to change it. */
const SLOW_HINT_AFTER_SEC = 45;

/**
 * Beside a running answer from the user's AI: how long it has taken so far, and
 * Cancel. Never an endless spinner with nothing to press.
 */
export function AiWorkingStatus({
  startedAt,
  onCancel,
  showAfterSec = 0,
}: {
  startedAt: number | null;
  onCancel: () => void;
  /** Stay hidden for a quick answer (a study grade usually takes a second). */
  showAfterSec?: number;
}) {
  const { t } = useTranslation('ai');
  const elapsed = useElapsedSeconds(startedAt);
  // Pressed for THIS request; the next one gets a fresh button.
  const [cancelledFor, setCancelledFor] = useState<number | null>(null);
  const cancelling = cancelledFor !== null && cancelledFor === startedAt;
  if (startedAt === null || elapsed < showAfterSec) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="ai-working">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
          <Clock className="h-3 w-3" />
          {t('wait.elapsed', { time: formatElapsed(elapsed) })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cancelling}
          onClick={() => {
            setCancelledFor(startedAt);
            onCancel();
          }}
        >
          <Square className="h-3 w-3" />
          {t('wait.cancel')}
        </Button>
      </div>
      {elapsed >= SLOW_HINT_AFTER_SEC && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">{t('wait.slowHint')}</p>
      )}
    </div>
  );
}

/**
 * The user's AI ran out of time (or was cancelled): say so plainly, suggest a smaller
 * model or their own key, and offer Try again. Shown instead of a bare "failed".
 */
export function AiStoppedNotice({ kind, onRetry }: { kind: AiStopKind; onRetry: () => void }) {
  const { t } = useTranslation('ai');
  const navigate = useNavigate();
  return (
    <div
      data-testid={`ai-stopped-${kind}`}
      className="flex flex-col gap-3 rounded-[14px] border border-warning/40 bg-warning/[0.06] p-5"
    >
      <div className="flex items-start gap-2.5">
        <TimerOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-foreground">
            {t(kind === 'timeout' ? 'errors.AI_TIMEOUT' : 'errors.AI_CANCELLED')}
          </p>
          {kind === 'timeout' && (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {t('wait.timeoutHint')}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('wait.retry')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings?tab=ai')}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {t('wait.openSettings')}
        </Button>
      </div>
    </div>
  );
}
