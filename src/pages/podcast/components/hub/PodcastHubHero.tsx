import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HERO_GRADIENT_CLASS, SAGE_PILL_CLASS } from './PodcastAnalysisChips';
import type { PublicStats } from '../../types';

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-extrabold text-primary tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

interface Props {
  /** Live catalog counters from `public-stats`; null while loading or offline. */
  stats: PublicStats | null;
}

/**
 * Counters come from the `public-stats` endpoint. When it hasn't answered yet (or
 * we're offline) we show an em-dash rather than the invented "2.4k+ / 120+"
 * placeholders this hero used to hard-code.
 */
export function PodcastHubHero({ stats }: Props) {
  const { t } = useTranslation('common');
  const dash = '—';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border px-6 py-5 ${HERO_GRADIENT_CLASS}`}
    >
      {/* Decorative blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-success/20 blur-3xl"
      />

      <div className="relative space-y-3">
        {/* Live pill */}
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${SAGE_PILL_CLASS}`}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {t('podcast.livePill', { count: stats?.ready_episodes ?? 0 })}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {t('podcast.hubTitle')}
        </h1>

        {/* Subtitle */}
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{t('podcast.hubSubtitle')}</span>
        </p>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 pt-3">
          <StatBlock
            value={stats ? formatNumber(stats.ready_episodes) : dash}
            label={t('podcast.statsReadyEpisodes')}
          />
          <StatBlock
            value={stats ? formatNumber(stats.active_podcasts) : dash}
            label={t('podcast.statsCuratedPodcasts')}
          />
          <StatBlock value="A1–C2" label={t('podcast.statsCefrRange')} />
          <StatBlock
            value={stats ? formatNumber(stats.total_episodes) : dash}
            label={t('podcast.statsTotalEpisodes')}
          />
        </div>
      </div>
    </div>
  );
}
