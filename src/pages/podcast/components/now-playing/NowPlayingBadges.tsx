import { BookOpen, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const CEFR_STYLE: Record<string, string> = {
  A1: 'bg-cefr-a1 text-white',
  A2: 'bg-cefr-a2 text-white',
  B1: 'bg-cefr-b1 text-white',
  B2: 'bg-cefr-b2 text-white',
  C1: 'bg-cefr-c1 text-white',
  C2: 'bg-cefr-c2 text-white',
};

/** Level · length · words — the three facts a learner picks an episode by (website: `NowPlayingBadges`). */
export function NowPlayingBadges({
  level,
  durationSeconds,
  uniqueWords,
  className,
}: {
  level?: string | null;
  durationSeconds?: number | null;
  uniqueWords?: number | null;
  className?: string;
}) {
  const { t } = useTranslation('podcastUi');
  const minutes =
    durationSeconds && durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null;
  if (!level && !minutes && uniqueWords == null) return null;
  const chip =
    'inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11.5px] font-medium tabular-nums text-muted-foreground';
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {level && (
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tracking-wide',
            CEFR_STYLE[level] ?? 'bg-muted text-foreground',
          )}
        >
          {level}
        </span>
      )}
      {minutes && (
        <span className={chip}>
          <Clock className="h-3 w-3 text-primary" strokeWidth={2} />
          {t('np.npMinutes', { count: minutes })}
        </span>
      )}
      {uniqueWords != null && (
        <span className={chip}>
          <BookOpen className="h-3 w-3 text-primary" strokeWidth={2} />
          {t('np.npWords', { count: uniqueWords })}
        </span>
      )}
    </div>
  );
}
