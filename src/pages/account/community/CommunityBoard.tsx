import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpNarrowWide,
  Award,
  CheckCircle2,
  Medal,
  MessageSquare,
  Plus,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useAuthStore } from '@/stores/authStore';
import { getLeaderboard, getTopics } from '@/lib/account/api';
import {
  DEFAULT_SORT,
  PAGE_SIZE,
  STATUS_TABS,
  authorLabel,
  pinnedTopics,
  visibleTopics,
} from '@/lib/account/community';
import type { CommunityTopic } from '@/lib/account/types';
import { useRemote } from '@/hooks/useRemote';
import { cn } from '@/lib/utils';
import { ErrorLine, Spinner, useAccountT } from '../components/AccountBits';
import { CreateTopicDialog } from './CreateTopicDialog';
import { ProRequiredDialog } from './ProRequiredDialog';
import { TopicCard } from './TopicCard';

type Tab = 'topics' | 'leaderboard' | 'activity';

const chip = (active: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
    active
      ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/30'
      : 'border border-border bg-card text-muted-foreground hover:text-foreground',
  );

export function CommunityBoard() {
  const { t, errorText } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user_id;
  const [tab, setTab] = useState<Tab>('topics');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [pro, setPro] = useState(false);
  const [justCreated, setJustCreated] = useState<CommunityTopic | null>(null);

  const topics = useRemote(
    () =>
      getTopics({
        status: status !== 'all' ? status : undefined,
        sortBy: sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    [status, sort, page],
    tab === 'topics',
  );
  const mine = useRemote(() => getTopics({ mine: true }), [userId], !!userId && tab === 'topics');

  const setFilter = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const pinned = pinnedTopics(mine.data?.topics, page, status);
  const shown = visibleTopics(pinned, topics.data?.topics ?? []);
  const total = topics.data?.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const newTopic = () => (session ? setCreating(true) : setSignIn(true));
  const plain = status === 'all' && sort === DEFAULT_SORT;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={MessageSquare}
        title={t('community.dashboard.title')}
        subtitle={t('community.hero.description')}
        action={
          tab === 'topics' && (
            <Button variant="accent" onClick={newTopic}>
              <Plus />
              {t('community.createTopic')}
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['topics', MessageSquare],
            ['leaderboard', Trophy],
            ['activity', Activity],
          ] as const
        ).map(([id, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={chip(tab === id)}
            aria-pressed={tab === id}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`community.dashboard.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'topics' && (
        <div className="flex flex-col gap-4">
          {justCreated && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-4 py-3"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{t('community.topicSubmitted')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t('community.pendingDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJustCreated(null)}
                aria-label={t('common.close')}
                className="text-caption hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_TABS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(() => setStatus(s))}
                  className={chip(status === s)}
                  aria-pressed={status === s}
                >
                  {t(
                    `community.${s === 'all' ? 'allStatuses' : s === 'in-progress' ? 'inProgress' : s}`,
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowUpNarrowWide className="h-4 w-4 text-caption" />
              <select
                value={sort}
                onChange={(e) => setFilter(() => setSort(e.target.value))}
                className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="date">{t('community.sortByDate')}</option>
                <option value="score">{t('community.sortByScore')}</option>
                <option value="comments">{t('community.sortByComments')}</option>
              </select>
            </div>
          </div>

          <ErrorLine
            message={topics.error ? errorText(topics.error) : null}
            onRetry={() => void topics.reload()}
            retryLabel={t('subscription.retry')}
          />

          {topics.loading && shown.length === 0 ? (
            <Spinner />
          ) : shown.length === 0 && !topics.error ? (
            <Card className="border-dashed">
              <EmptyState
                icon={MessageSquare}
                title={plain ? t('community.noTopics') : t('community.noTopicsFiltered')}
                body={
                  plain ? t('community.noTopicsSubtitle') : t('community.noTopicsFilteredSubtitle')
                }
                action={
                  <Button variant="accent" onClick={newTopic}>
                    <Plus />
                    {t('community.createTopic')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {shown.map((tp) => (
                  <TopicCard key={tp.id} topic={tp} onNeedSignIn={() => setSignIn(true)} />
                ))}
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    {t('common.previous')}
                  </Button>
                  <span className="px-2 text-xs text-caption">
                    {t('common.page')} {page + 1} {t('common.of')} {pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pages - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'leaderboard' && (
        <Leaderboard signedIn={!!session} onSignIn={() => setSignIn(true)} />
      )}
      {tab === 'activity' && (
        <Card>
          <EmptyState
            icon={Activity}
            title={t('community.dashboard.activity.title')}
            body={t('community.dashboard.activity.description')}
            action={
              <Button asChild variant="accent">
                <Link to="/account/friends">{t('community.dashboard.activity.findFriends')}</Link>
              </Button>
            }
          />
        </Card>
      )}

      <CreateTopicDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(tp) => {
          setJustCreated(tp);
          setStatus('all');
          setPage(0);
          void topics.reload();
          void mine.reload();
        }}
        onProRequired={() => setPro(true)}
      />
      <ProRequiredDialog open={pro} onClose={() => setPro(false)} />
      <SignInDialog
        open={signIn}
        onOpenChange={setSignIn}
        description={t('community.loginToCreateTopic')}
      />
    </div>
  );
}

function Leaderboard({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const { t, i18n, errorText } = useAccountT();
  const lb = useRemote(() => getLeaderboard(10), [signedIn], signedIn);
  const tl = (k: string, v?: Record<string, unknown>) =>
    t(`community.dashboard.leaderboard.${k}`, v);
  if (!signedIn)
    return (
      <Card>
        <EmptyState
          icon={Trophy}
          title={tl('allTime')}
          body={t('desk.signedOut.body')}
          action={
            <Button variant="accent" onClick={onSignIn}>
              {t('desk.signedOut.button')}
            </Button>
          }
        />
      </Card>
    );
  if (lb.loading && !lb.data) return <Spinner />;
  if (lb.error)
    return (
      <ErrorLine
        message={errorText(lb.error)}
        onRetry={() => void lb.reload()}
        retryLabel={t('subscription.retry')}
      />
    );
  const users = lb.data?.users ?? [];
  const my = lb.data?.my_stats;
  const myRank = lb.data?.my_rank;
  const name = (u: (typeof users)[number]) => authorLabel(u) || t('community.anonymous');
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Trophy className="h-4 w-4 text-accent" />
            {tl('allTime')}
          </span>
          <span className="text-[11px] text-caption">{tl('byXp')}</span>
        </div>
        <div className="flex flex-col gap-1 p-4">
          {users.length === 0 ? (
            <p className="py-10 text-center text-sm text-caption">{tl('noData')}</p>
          ) : (
            users.slice(0, 5).map((u) => (
              <div
                key={u.user_id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5',
                  u.is_me ? 'border border-accent/30 bg-accent/10' : 'hover:bg-muted',
                )}
              >
                <span className="w-6 text-center text-[13px] font-extrabold text-accent">
                  {u.rank}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-extrabold text-primary-foreground">
                  {name(u).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate text-[13px] font-semibold',
                      u.is_me ? 'text-accent' : 'text-foreground',
                    )}
                  >
                    {name(u)}
                    {u.is_me ? ` ${tl('youSuffix')}` : ''}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-caption">
                    {tl('level', { level: u.level })} ·{' '}
                    {u.current_streak > 0
                      ? tl('streakDays', { count: u.current_streak })
                      : tl('noStreak')}
                  </div>
                </div>
                <span className="text-[13px] font-extrabold text-accent">
                  {u.total_xp.toLocaleString(i18n.language)} XP
                </span>
                {u.rank === 1 && <Medal className="h-[18px] w-[18px] text-accent" />}
              </div>
            ))
          )}
          {myRank && myRank > 5 && my && (
            <div className="mt-1 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5">
              <span className="w-6 text-center text-[13px] font-extrabold text-accent">
                {myRank}
              </span>
              <span className="flex-1 text-[13px] font-semibold text-accent">{tl('you')}</span>
              <span className="text-[13px] font-extrabold text-accent">
                {my.total_xp.toLocaleString(i18n.language)} XP
              </span>
            </div>
          )}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 text-sm font-bold text-foreground">
          <Award className="h-4 w-4 text-success" />
          {tl('yourStanding')}
        </div>
        <div className="px-5 pb-5 pt-3">
          {my ? (
            <dl className="flex flex-col divide-y divide-border">
              {[
                [tl('globalRank'), `#${myRank}`],
                [tl('totalXp'), my.total_xp.toLocaleString(i18n.language)],
                [tl('levelLabel'), my.level],
                [tl('streak'), tl('streakValue', { count: my.current_streak })],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-center justify-between py-2.5">
                  <dt className="text-[13px] text-muted-foreground">{k}</dt>
                  <dd className="text-sm font-extrabold text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="py-8 text-center text-sm text-caption">{tl('startLearning')}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
