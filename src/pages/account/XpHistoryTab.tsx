import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  List,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/stores/authStore';
import { getXpHistory } from '@/lib/account/api';
import {
  XP_PAGE_SIZE,
  groupLogs,
  hasGoalBonus,
  localXpToSummaries,
  xpSummary,
} from '@/lib/account/xp';
import type { XPDailySummary, XPLogItem, XPSource } from '@/lib/account/types';
import { useRemote } from '@/hooks/useRemote';
import { ErrorLine, SourceBadge, Spinner, useAccountT } from './components/AccountBits';

const SOURCE: Record<XPSource, { label: string; tone: string }> = {
  words_reviewed: { label: 'wordsReviewed', tone: 'bg-accent/10 text-accent' },
  correct_answers: { label: 'correctAnswers', tone: 'bg-success/15 text-success' },
  streak_bonus: { label: 'streakBonus', tone: 'bg-warning/15 text-warning' },
  daily_goal_bonus: { label: 'dailyGoalBonus', tone: 'bg-accent/10 text-accent' },
  time_bonus: { label: 'timeBonus', tone: 'bg-primary/10 text-primary' },
  achievement: { label: 'achievement', tone: 'bg-warning/15 text-warning' },
  content_complete: { label: 'contentComplete', tone: 'bg-success/15 text-success' },
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}

export function XpHistoryTab() {
  const { t, i18n, errorText } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const signedIn = !!session;
  const [page, setPage] = useState(0);
  const [grouped, setGrouped] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const account = useRemote(
    () => getXpHistory(XP_PAGE_SIZE, page * XP_PAGE_SIZE),
    [page, session?.user_id],
    signedIn,
  );
  const local = useRemote(
    async () =>
      localXpToSummaries(
        await invoke<
          { date: string; total_xp: number; breakdown?: { module: string; xp: number }[] }[]
        >('dashboard_get_xp_history', { days: 365 }),
      ),
    [],
    !signedIn,
  );

  const accountItems = account.data?.items;
  const localItems = local.data;
  const items: XPDailySummary[] = useMemo(
    () => (signedIn ? (accountItems ?? []) : (localItems ?? [])),
    [signedIn, accountItems, localItems],
  );
  const totalItems = signedIn ? (account.data?.total ?? 0) : items.length;
  const totalXp = signedIn
    ? (account.data?.total_xp ?? 0)
    : items.reduce((a, i) => a + i.total_xp, 0);
  const totalPages = signedIn ? Math.ceil(totalItems / XP_PAGE_SIZE) : 1;
  const { goalMetDays, bestDay, maxXp, chart } = useMemo(() => xpSummary(items), [items]);
  const loading = signedIn ? account.loading && !account.data : local.loading && !local.data;
  const err = signedIn ? account.error : local.error;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  const rel = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff <= 0) return t('xpHistory.today');
    if (diff === 1) return t('xpHistory.yesterday');
    if (diff < 7) return t('xpHistory.daysAgo', { count: diff });
    return fmtDate(d);
  };
  const label = (source: XPSource, d: XPLogItem['source_detail']) => {
    const base = t(`xpHistory.sources.${SOURCE[source]?.label ?? 'wordsReviewed'}`);
    if (!d) return base;
    if (source === 'words_reviewed' && d.count)
      return `${base} (${d.count} ${t('xpHistory.words')})`;
    if (source === 'correct_answers' && d.count) return `${base} (${d.count})`;
    if (source === 'streak_bonus' && d.streak)
      return `${base} (${d.streak} ${t('xpHistory.days')})`;
    if (source === 'time_bonus' && d.seconds)
      return `${base} (${Math.floor(d.seconds / 60)} ${t('xpHistory.minutes')})`;
    return base;
  };
  const toggle = (d: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Sparkles}
        title={t('xpHistory.title')}
        subtitle={t('xpHistory.description')}
        action={<SourceBadge source={signedIn ? 'account' : 'local'} />}
      />
      {!signedIn && <p className="text-xs text-muted-foreground">{t('desk.source.localNote')}</p>}
      <ErrorLine
        message={err ? errorText(err) : null}
        onRetry={() => void (signedIn ? account.reload() : local.reload())}
        retryLabel={t('subscription.retry')}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('xpHistory.totalXP')} value={totalXp.toLocaleString(i18n.language)} />
        {signedIn && <Stat label={t('xpHistory.currentLevel')} value={account.data?.level ?? 1} />}
        <Stat label={t('xpHistory.totalDays')} value={totalItems} />
        <Stat label={t('xpHistory.goalsAchieved')} value={goalMetDays} />
      </div>

      {chart.length > 1 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <h3 className="text-sm font-bold text-foreground">{t('xpHistory.chartTitle')}</h3>
          </div>
          <div dir="ltr" className="h-56 w-full text-caption">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickFormatter={(v: string) =>
                    `${new Date(v).getMonth() + 1}/${new Date(v).getDate()}`
                  }
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(v) => fmtDate(String(v))}
                  formatter={(v) => [`+${v ?? 0} XP`, t('xpHistory.dailyXP')]}
                />
                <Area
                  type="monotone"
                  dataKey="xp"
                  stroke="#DF804D"
                  strokeWidth={2}
                  fill="#DF804D"
                  fillOpacity={0.15}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {totalItems} {t('xpHistory.totalDays').toLowerCase()}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setExpanded(
                  expanded.size > 0 ? new Set() : new Set(items.map((i) => i.activity_date)),
                )
              }
            >
              <ChevronDown className={expanded.size > 0 ? 'rotate-180' : ''} />
              {expanded.size > 0 ? t('xpHistory.collapseAll') : t('xpHistory.expandAll')}
            </Button>
            <Button
              size="sm"
              variant={grouped ? 'default' : 'outline'}
              onClick={() => {
                const next = !grouped;
                setGrouped(next);
                if (next) setExpanded(new Set(items.map((i) => i.activity_date)));
              }}
            >
              {grouped ? <LayoutList /> : <List />}
              {grouped ? t('xpHistory.allEvents') : t('xpHistory.grouped')}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && !err ? (
        <Card>
          <EmptyState
            icon={Star}
            title={t('xpHistory.noHistory')}
            body={t('xpHistory.noHistoryDesc')}
            action={
              <Button asChild>
                <Link to="/">{t('xpHistory.startLearning')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const open = expanded.has(item.activity_date);
            const goal = hasGoalBonus(item);
            const pct = Math.round((item.total_xp / maxXp) * 100);
            const totals = groupLogs(item.logs);
            return (
              <Card key={item.activity_date} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(item.activity_date)}
                  aria-expanded={open}
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-start hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold text-foreground">
                        {rel(item.activity_date)}
                      </span>
                      {goal && (
                        <span className="rounded-md border border-success/40 bg-success/15 px-2 py-0.5 text-[10.5px] font-semibold text-success">
                          {t('xpHistory.goalMet')}
                        </span>
                      )}
                      {item.activity_date === bestDay && (
                        <span className="rounded-md border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10.5px] font-semibold text-warning">
                          {t('xpHistory.bestDay')}
                        </span>
                      )}
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {fmtDate(item.activity_date)}
                    </p>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {totals.map((g) => (
                        <span
                          key={g.source}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${SOURCE[g.source]?.tone ?? SOURCE.words_reviewed.tone}`}
                        >
                          {g.count > 1 && (
                            <span className="opacity-60 tabular-nums">x{g.count}</span>
                          )}
                          <span className="tabular-nums">+{g.totalXp} XP</span>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${goal ? 'bg-success' : 'bg-accent'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-9 text-end text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="min-w-[68px] rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-2 text-center">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-accent/70">
                        +XP
                      </div>
                      <div className="text-2xl font-extrabold tabular-nums text-accent">
                        {item.total_xp}
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>
                {open && (
                  <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto border-t border-border px-3 py-2.5">
                    {grouped
                      ? totals.map((g) => (
                          <div
                            key={g.source}
                            className="flex items-center gap-3 rounded-lg px-2 py-2"
                          >
                            <span className="flex-1 text-[12.5px] font-semibold text-foreground/80">
                              {t(`xpHistory.sources.${SOURCE[g.source]?.label ?? 'wordsReviewed'}`)}
                            </span>
                            {g.count > 1 && (
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                x{g.count}
                              </span>
                            )}
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold tabular-nums ${SOURCE[g.source]?.tone}`}
                            >
                              +{g.totalXp} XP
                            </span>
                          </div>
                        ))
                      : item.logs.map((l) => (
                          <div key={l.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground/80">
                              {label(l.source, l.source_detail)}
                            </span>
                            {l.source_detail?.estimated && (
                              <span className="text-[10.5px] text-muted-foreground">~</span>
                            )}
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold tabular-nums ${SOURCE[l.source]?.tone ?? SOURCE.words_reviewed.tone}`}
                            >
                              +{l.xp_amount} XP
                            </span>
                          </div>
                        ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {signedIn && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label={t('common.previous')}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="rounded-md border border-border bg-card px-3.5 py-2 text-xs font-semibold tabular-nums">
            {t('xpHistory.page', { current: page + 1, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            aria-label={t('common.next')}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      )}
    </div>
  );
}
