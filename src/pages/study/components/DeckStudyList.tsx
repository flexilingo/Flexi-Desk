import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, CircleDashed, Sprout, Flame, BookOpen, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DeckStatus, HealthStatus } from '../types';

interface Props {
  decks: DeckStatus[];
  isLoading?: boolean;
  /** Opens the scope sheet for the chosen deck (study does NOT start immediately). */
  onPickDeck: (deck: DeckStatus) => void;
}

type TabKey = 'all' | 'urgent' | 'healthy' | 'untouched';

const TAB_STATUSES: Record<TabKey, HealthStatus[]> = {
  all: ['untouched', 'fresh', 'good', 'warning', 'critical'],
  urgent: ['critical', 'warning'],
  healthy: ['fresh', 'good'],
  untouched: ['untouched'],
};

const HEALTH_TEXT: Record<HealthStatus, string> = {
  untouched: 'text-muted-foreground',
  fresh: 'text-success',
  good: 'text-success',
  warning: 'text-warning',
  critical: 'text-error',
};

const HEALTH_ICON_BG: Record<HealthStatus, string> = {
  untouched: 'bg-muted text-muted-foreground',
  fresh: 'bg-success/15 text-success',
  good: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  critical: 'bg-error/15 text-error',
};

const HEALTH_ACCENT: Record<HealthStatus, string> = {
  untouched: 'bg-muted-foreground/40',
  fresh: 'bg-success',
  good: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-error',
};

const MASTERY_BAR: Record<HealthStatus, string> = {
  untouched: 'bg-muted-foreground/40',
  fresh: 'bg-success',
  good: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-error',
};

const HEALTH_ICON: Record<HealthStatus, React.ElementType> = {
  untouched: CircleDashed,
  fresh: Sprout,
  good: CheckCircle2,
  warning: Clock,
  critical: Flame,
};

/** Average of the available proficiency dimensions (0–1), or mature ratio fallback. */
function masteryPct(d: DeckStatus): number {
  const dims = [
    d.avg_recognition,
    d.avg_recall,
    d.avg_production,
    d.avg_listening,
    d.avg_pronunciation,
  ].filter((v): v is number => typeof v === 'number');
  if (dims.length > 0) {
    return Math.round((dims.reduce((s, v) => s + v, 0) / dims.length) * 100);
  }
  if (d.total_cards > 0) return Math.round((d.mature_count / d.total_cards) * 100);
  return 0;
}

export function DeckStudyList({ decks, isLoading, onPickDeck }: Props) {
  const { t } = useTranslation('study');
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const counts = useMemo(() => {
    const c = { all: 0, urgent: 0, healthy: 0, untouched: 0 } as Record<TabKey, number>;
    for (const d of decks) {
      c.all += 1;
      if (TAB_STATUSES.urgent.includes(d.health_status)) c.urgent += 1;
      if (TAB_STATUSES.healthy.includes(d.health_status)) c.healthy += 1;
      if (TAB_STATUSES.untouched.includes(d.health_status)) c.untouched += 1;
    }
    return c;
  }, [decks]);

  const filteredDecks = useMemo(
    () => decks.filter((d) => TAB_STATUSES[activeTab].includes(d.health_status)),
    [decks, activeTab],
  );

  function healthLabel(status: HealthStatus, days: number | null): string {
    switch (status) {
      case 'untouched':
        return t('deckList.notStarted');
      case 'fresh':
        return t('deckList.justReviewed');
      case 'good':
        return t('deckList.onTrack');
      case 'warning':
        return days != null
          ? t('deckList.overdueWithDays', { days: Math.round(days) })
          : t('deckList.warning');
      case 'critical':
        return days != null
          ? t('deckList.urgentWithDays', { days: Math.round(days) })
          : t('deckList.critical');
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (!decks || decks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 px-8 text-center text-sm text-muted-foreground">
        {t('deckList.empty')}
      </div>
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: t('deckList.tabAll') },
    { key: 'urgent', label: t('deckList.tabUrgent') },
    { key: 'healthy', label: t('deckList.tabHealthy') },
    { key: 'untouched', label: t('deckList.tabNotStarted') },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
          {t('deckList.title')}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t('deckList.deckCount', { count: decks.length })}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2.5 -mb-px border-b-2 text-xs font-semibold transition-colors',
                isActive
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              {tab.label}
              <span className="tabular-nums text-[11px] font-bold">{counts[tab.key]}</span>
            </button>
          );
        })}
      </div>

      {filteredDecks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 py-10 px-8 text-center text-sm text-muted-foreground">
          {t('deckList.tabEmpty')}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {filteredDecks.map((d) => {
            const StatusIcon = HEALTH_ICON[d.health_status];
            const label = healthLabel(d.health_status, d.days_since_practice);
            const mastery = masteryPct(d);
            return (
              <div
                key={d.deck_id}
                className="group relative overflow-hidden flex flex-col rounded-xl border border-border bg-card shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className={cn('absolute inset-x-0 top-0 h-[3px]', HEALTH_ACCENT[d.health_status])}
                />

                <div className="flex items-start gap-3 p-4 pb-3 flex-1">
                  <div
                    className={cn(
                      'w-9 h-9 shrink-0 rounded-lg flex items-center justify-center',
                      HEALTH_ICON_BG[d.health_status],
                    )}
                  >
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1">
                      {d.deck_title}
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] font-medium mt-0.5',
                        HEALTH_TEXT[d.health_status],
                      )}
                    >
                      <StatusIcon className="h-2.5 w-2.5 shrink-0" />
                      {label}
                    </span>
                  </div>
                </div>

                {/* Mastery bar */}
                <div className="px-4 pb-3">
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground mb-1 tabular-nums">
                    <span>{t('deckList.mastery')}</span>
                    <span>{mastery}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        MASTERY_BAR[d.health_status],
                      )}
                      style={{ width: `${mastery}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border bg-muted/40 px-4 py-2 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-medium text-muted-foreground min-w-0 inline-flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-2.5 w-2.5" />
                      {t('deckList.cardsCount', { count: d.total_cards })}
                    </span>
                    {d.untouched_count > 0 && (
                      <span className="text-primary font-semibold">
                        · {t('deckList.newCards', { count: d.untouched_count })}
                      </span>
                    )}
                    {d.due_count > 0 && (
                      <span className="text-warning font-semibold">
                        · {t('deckList.dueCards', { count: d.due_count })}
                      </span>
                    )}
                    {d.leech_count > 0 && (
                      <span className="text-error font-semibold">
                        · {t('deckList.leech', { count: d.leech_count })}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPickDeck(d)}
                    disabled={d.total_cards === 0}
                    className="shrink-0"
                  >
                    {t('deckList.start')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
