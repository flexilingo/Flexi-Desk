import { useTranslation } from 'react-i18next';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SessionInsights } from '../../../types';
import { ReportPanel } from './ReportPanel';

/**
 * The words that took three or more tries tonight, hardest first. The one part of the
 * report that is a to-do rather than a statistic: the learner leaves knowing the words to
 * look at, by name. A tick marks the ones they did land by the end, so the list reads as
 * "hard but won" vs "still open" rather than as a wall of failure.
 */
export function StrugglePanel({
  struggles,
  onDrill,
  drilling,
  error,
}: {
  struggles: SessionInsights['struggles'];
  onDrill?: () => void;
  drilling?: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation('study');
  if (struggles.length === 0) return null;
  return (
    <ReportPanel
      title={t('report.strugglesTitle')}
      note={t('report.strugglesNote', { count: struggles.length })}
      testId="report-struggles"
    >
      <div className="flex flex-wrap gap-1.5">
        {struggles.map((s) => (
          <span
            key={s.card_id}
            dir="auto"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border py-1.5 pe-2 ps-2.5 text-[13px] font-semibold',
              s.ended_correct
                ? 'border-border bg-muted/60 text-muted-foreground'
                : 'border-warning/30 bg-warning/10 text-foreground',
            )}
          >
            {s.ended_correct && <Check className="h-3 w-3 shrink-0 text-success" />}
            <span className="max-w-[180px] truncate">{s.front_text}</span>
            <span className="text-[11px] tabular-nums text-caption">×{s.attempts}</span>
          </span>
        ))}
      </div>
      {onDrill && (
        <div className="mt-4 border-t border-border pt-3.5">
          <Button variant="outline" onClick={onDrill} loading={drilling}>
            <RotateCcw className="h-4 w-4" />
            {t('report.drillWeak')}
          </Button>
          {error && <p className="mt-2 text-xs text-error">{error}</p>}
        </div>
      )}
    </ReportPanel>
  );
}
