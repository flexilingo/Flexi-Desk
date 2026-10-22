import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * At the foot of the lines while the rest of the subtitles is still being made (website:
 * `TranscribingMore`): the first lines are on screen and the pill says more is on the way.
 */
export function TranscribingMore({ percent }: { percent: number | null }) {
  const { t } = useTranslation('podcastUi');
  return (
    <div className="flex shrink-0 justify-center px-4 pb-4 pt-1">
      <div
        role="status"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-muted py-1.5 ps-3 pe-3.5 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span>{t('np.npMakingRest')}</span>
        {percent !== null && (
          <span className="font-semibold tabular-nums text-foreground">{percent}%</span>
        )}
      </div>
    </div>
  );
}
