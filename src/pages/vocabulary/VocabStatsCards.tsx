import { useTranslation } from 'react-i18next';
import { BookOpen, Layers, Star, TrendingUp } from 'lucide-react';
import type { VocabStats } from './vocabLogic';

const card =
  'flex items-center gap-3 rounded-lg border border-border border-s-[3px] bg-card p-3 shadow-xs';

export function VocabStatsCards({ stats }: { stats: VocabStats }) {
  const { t } = useTranslation('vocabulary');
  const n = (v: number) => v.toLocaleString();
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <div className={`${card} border-s-success`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success/10">
          <BookOpen className="h-4 w-4 text-success" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-[22px] font-black leading-none tracking-tight text-foreground">
            {n(stats.total)}
          </div>
          <div className="mt-0.5 text-[11px] text-caption">{t('statTotal')}</div>
        </div>
      </div>
      <div className={`${card} border-s-accent`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10">
          <Layers className="h-4 w-4 text-accent" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-[22px] font-black leading-none tracking-tight text-foreground">
            {n(stats.inDeck)}
          </div>
          <div className="mt-0.5 text-[11px] text-caption">{t('statInDeck')}</div>
        </div>
      </div>
      <div className={`${card} border-s-primary-light`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-light/10">
          <Star className="h-4 w-4 text-primary-light" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <div className="text-[22px] font-black leading-none tracking-tight text-foreground">
              {n(stats.mastered)}
            </div>
            <div className="text-[10px] font-semibold text-caption">{stats.masteryPct}%</div>
          </div>
          <div className="mb-1.5 mt-0.5 text-[11px] text-caption">{t('statMastered')}</div>
          <progress
            max={100}
            value={stats.masteryPct}
            aria-label={t('statMastered')}
            className="block h-1 w-full appearance-none overflow-hidden rounded-full bg-border [&::-moz-progress-bar]:bg-primary-light/60 [&::-webkit-progress-bar]:bg-border [&::-webkit-progress-value]:bg-primary-light/60"
          />
        </div>
      </div>
      <div className={`${card} border-s-success`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success/10">
          <TrendingUp className="h-4 w-4 text-success" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-[22px] font-black leading-none tracking-tight text-foreground">
            {stats.newThisWeek > 0 ? `+${n(stats.newThisWeek)}` : stats.newThisWeek}
          </div>
          <div className="mt-0.5 text-[11px] text-caption">{t('statNewThisWeek')}</div>
        </div>
      </div>
    </div>
  );
}
