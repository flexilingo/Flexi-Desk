import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/stores/authStore';
import { getDailyStats, getUserStatistics } from '@/lib/account/api';
import { dailyAccuracy, localDailyToStats } from '@/lib/account/xp';
import { useRemote } from '@/hooks/useRemote';
import { ErrorLine, SourceBadge, Spinner, useAccountT } from './components/AccountBits';

const ACCENT = '#DF804D';
const SAGE = '#8BB7A3';
const RED = '#ef4444';

const iso = (d: Date) => d.toISOString().slice(0, 10);

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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-bold text-foreground">{title}</h3>
      <div dir="ltr" className="h-64 w-full text-caption">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function StatsTab() {
  const { t, i18n, errorText } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const signedIn = !!session;
  const from = useMemo(() => iso(new Date(Date.now() - 30 * 86400000)), []);

  const stats = useRemote(() => getUserStatistics(), [session?.user_id], signedIn);
  const daily = useRemote(() => getDailyStats(from), [session?.user_id, from], signedIn);
  const local = useRemote(
    async () =>
      localDailyToStats(
        await invoke<
          {
            date: string;
            study_minutes: number;
            words_learned: number;
            reviews_completed: number;
          }[]
        >('dashboard_get_daily_stats', { fromDate: from, toDate: iso(new Date()) }),
      ),
    [from],
    !signedIn,
  );

  const rows = signedIn ? (daily.data ?? []) : (local.data ?? []);
  const short = (d: string) =>
    new Date(d).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
  const chart = rows.map((r) => ({
    date: short(r.date),
    reviews: r.cards_reviewed,
    correct: r.correct_answers,
    incorrect: r.incorrect_answers,
    accuracy: dailyAccuracy(r.correct_answers, r.incorrect_answers),
  }));
  const loading = signedIn
    ? (stats.loading && !stats.data) || (daily.loading && !daily.data)
    : local.loading && !local.data;
  const err = signedIn ? (stats.error ?? daily.error) : local.error;
  const localTotal = rows.reduce((a, r) => a + r.cards_reviewed, 0);

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={BarChart3}
        title={t('analytics.title')}
        action={<SourceBadge source={signedIn ? 'account' : 'local'} />}
      />
      {!signedIn && <p className="text-xs text-muted-foreground">{t('desk.source.localNote')}</p>}
      <ErrorLine
        message={err ? errorText(err) : null}
        onRetry={() => void (signedIn ? (stats.reload(), daily.reload()) : local.reload())}
        retryLabel={t('subscription.retry')}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {signedIn ? (
          <>
            <Stat
              label={t('analytics.stats.cardsReviewed')}
              value={stats.data?.total_cards_reviewed ?? 0}
            />
            <Stat label={t('analytics.stats.mastered')} value={stats.data?.total_mastered ?? 0} />
            <Stat
              label={t('analytics.stats.accuracyRate')}
              value={`${(stats.data?.accuracy_rate ?? 0).toFixed(1)}%`}
            />
            <Stat label={t('analytics.stats.streakDays')} value={stats.data?.streak_days ?? 0} />
          </>
        ) : (
          <Stat label={t('analytics.stats.cardsReviewed')} value={localTotal} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t('analytics.dailyReviews')}>
          <LineChart data={chart}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="reviews"
              name={t('analytics.reviews')}
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartCard>
        {signedIn && (
          <>
            <ChartCard title={t('analytics.dailyAccuracy')}>
              <LineChart data={chart}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  name={t('analytics.accuracyPercent')}
                  stroke={SAGE}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartCard>
            <ChartCard title={t('analytics.correctVsIncorrect')}>
              <BarChart data={chart} barCategoryGap="30%">
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="correct"
                  name={t('analytics.correct')}
                  fill={SAGE}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="incorrect"
                  name={t('analytics.incorrect')}
                  fill={RED}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartCard>
          </>
        )}
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-foreground">
          {t('analytics.dailyStatsLast30Days')}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border">
                {(
                  [
                    'date',
                    'reviews',
                    ...(signedIn ? ['correct', 'incorrect', 'accuracy'] : []),
                  ] as string[]
                ).map((k) => (
                  <th
                    key={k}
                    className="px-3 py-2 text-start text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {t(`analytics.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .reverse()
                .slice(0, 10)
                .map((r) => (
                  <tr key={r.date} className="border-b border-border/60">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.date).toLocaleDateString(i18n.language, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-foreground">
                      {r.cards_reviewed}
                    </td>
                    {signedIn && (
                      <>
                        <td className="px-3 py-2 text-xs font-semibold text-success">
                          {r.correct_answers}
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-error">
                          {r.incorrect_answers}
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-accent">
                          {dailyAccuracy(r.correct_answers, r.incorrect_answers).toFixed(1)}%
                        </td>
                      </>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
