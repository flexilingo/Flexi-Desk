import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Headphones, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import * as api from '../lib/api';
import { NotReadyError, SentencesError, toSentencesError } from '../lib/api';
import { baseLocale } from '../lib/locale';
import {
  LEVELS,
  type HistoryFilter,
  type HistoryItem,
  type HistoryPage,
  type Level,
  type Meta,
  type PracticeStats,
} from '../lib/types';
import { CARD } from './cards';
import { ComingSoon } from './ComingSoon';
import { SentencesShell } from './SentencesShell';
import { SentenceText } from './SentenceText';

const FILTERS: HistoryFilter[] = ['weak', 'misheard', 'learned', 'all'];

const CHOICE = 'inline-flex h-8 items-center rounded-md px-3 text-sm font-bold transition-colors';
const ON = 'bg-primary text-primary-foreground';
const OFF = 'bg-muted text-muted-foreground hover:bg-border hover:text-foreground';

/** Where the card stands, as a dot — the only colour a row carries. */
const STATUS_DOT: Record<'learned' | 'weak' | 'seen', string> = {
  learned: 'bg-success',
  weak: 'bg-warning',
  seen: 'bg-primary',
};

export const statusOf = (item: Pick<HistoryItem, 'box'>): 'learned' | 'weak' | 'seen' =>
  item.box >= 2 ? 'learned' : item.box === 0 ? 'weak' : 'seen';

const FILTER_SET = new Set<string>(FILTERS);

/**
 * The learner's own record of sentence practice — what they got right, what they got
 * wrong, what they have learned and when each card comes back. It lists only
 * sentences this account has answered, each already revealed to it, and only their
 * surface: the sentence and its meaning, never the breakdown.
 */
export function HistoryScreen({ lang }: { lang: string }) {
  const { t, i18n } = useTranslation('sentences');
  const navigate = useNavigate();
  const locale = baseLocale(i18n.language);
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [signInOpen, setSignInOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  const tabParam = params.get('tab') ?? '';
  const filter: HistoryFilter = FILTER_SET.has(tabParam) ? (tabParam as HistoryFilter) : 'weak';
  const pageParam = Number(params.get('p'));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const levelParam = params.get('level') ?? '';
  const pathParam = params.get('path') ?? '';

  const [meta, setMeta] = useState<{ meta: Meta; explain: string } | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setNotReady(false);
    setMetaError(null);
    api
      .getMeta(lang, locale, {})
      .then((m) => alive && setMeta(m))
      .catch((err) => {
        if (!alive) return;
        const e = toSentencesError(err);
        if (e instanceof NotReadyError) setNotReady(true);
        else setMetaError(e.code);
      });
    return () => {
      alive = false;
    };
  }, [session, lang, locale, reloadKey]);

  const levels = (meta?.meta.levels ?? []) as Level[];
  const level: Level =
    levelParam &&
    (LEVELS as readonly string[]).includes(levelParam) &&
    levels.includes(levelParam as Level)
      ? (levelParam as Level)
      : (levels[0] ?? 'A1');

  // Each practice path keeps its own history; which paths there are is the settings panel's path row.
  const pathRow = meta?.meta.sections.find((x) => x.track) ?? null;
  const paths = pathRow?.options.filter((o) => !o.disabled) ?? [];
  const path = paths.some((o) => o.value === pathParam) ? pathParam : '';
  const track = path || 'general';
  const pathPicks: Record<string, string> = pathRow && path ? { [pathRow.key]: path } : {};

  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    let alive = true;
    setLoading(true);
    setFailed(null);
    Promise.all([
      api.getHistory(lang, meta.explain, level, filter, page, track),
      api.getStats(lang, level, track).catch(() => null),
    ])
      .then(([h, st]) => {
        if (!alive) return;
        setHistory(h);
        setStats(st);
      })
      .catch((err) => {
        if (!alive) return;
        const e = toSentencesError(err);
        if (e instanceof NotReadyError) setNotReady(true);
        else setFailed(e instanceof SentencesError ? e.code : 'UNKNOWN_ERROR');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [meta, lang, level, filter, page, track, reloadKey]);

  const to = (q: { level?: Level; tab?: HistoryFilter; p?: number; path?: string }) => {
    const nextPath = q.path ?? path;
    const next = new URLSearchParams({
      level: q.level ?? level,
      tab: q.tab ?? filter,
      ...(nextPath ? { path: nextPath } : {}),
      ...(q.p && q.p > 1 ? { p: String(q.p) } : {}),
    });
    setParams(next, { replace: true });
  };

  const pages = history ? Math.max(1, Math.ceil(history.count / history.pageSize)) : 1;
  const dueText = useMemo(
    () => (item: HistoryItem) => {
      if (!item.due_at) return null;
      const ms = Date.parse(item.due_at) - Date.now();
      if (ms <= 0) return t('history.dueNow');
      if (ms < 86_400_000) return t('history.dueMinutes');
      return t('history.dueDays', { days: Math.round(ms / 86_400_000) });
    },
    [t],
  );

  const errorText = (code: string) =>
    i18n.exists(`sentences:errors.${code}`) ? t(`errors.${code}`) : t('errors.UNKNOWN_ERROR');

  const header = { title: t('history.title'), subtitle: t('history.subtitle') };

  if (!session) {
    return (
      <SentencesShell {...header}>
        {authLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div className={`${CARD} mx-auto max-w-xl text-center`} data-testid="sign-in-card">
            <p className="text-lg font-bold text-foreground">{t('desk.signInTitle')}</p>
            <p className="mt-1.5 text-base text-muted-foreground">{t('desk.signInBody')}</p>
            <div className="mt-4 flex justify-center">
              <Button size="sm" onClick={() => setSignInOpen(true)}>
                <LogIn className="h-4 w-4" />
                {t('desk.signIn')}
              </Button>
            </div>
            <SignInDialog
              open={signInOpen}
              onOpenChange={setSignInOpen}
              onSignedIn={() => setSignInOpen(false)}
              description={t('desk.signInBody')}
            />
          </div>
        )}
      </SentencesShell>
    );
  }

  if (notReady) {
    return (
      <SentencesShell {...header}>
        <ComingSoon loading={false} onRetry={() => setReloadKey((k) => k + 1)} />
      </SentencesShell>
    );
  }

  if (!meta) {
    return (
      <SentencesShell {...header}>
        {metaError ? (
          <p
            className="rounded-xl border border-border bg-card p-6 text-center text-base text-accent"
            data-testid="history-error"
          >
            {errorText(metaError)}
          </p>
        ) : (
          <Skeleton className="h-64 w-full rounded-xl" />
        )}
      </SentencesShell>
    );
  }

  const toPractice = (extra: Record<string, string>) =>
    navigate(`/sentences/${lang}`, { state: { picks: { ...pathPicks, level, ...extra } } });

  return (
    <>
      <SentencesShell
        {...header}
        meta={
          stats && (
            <>
              <span>{t('stats.line', { practiced: stats.practiced, learned: stats.learned })}</span>
              {stats.streak > 0 && (
                <>
                  <span aria-hidden className="opacity-50">
                    ·
                  </span>
                  <span>{t('stats.streak', { days: stats.streak, count: stats.streak })}</span>
                </>
              )}
            </>
          )
        }
      >
        {pathRow && paths.length > 1 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5"
            data-testid="history-paths"
          >
            <span className="px-1 text-sm font-semibold text-muted-foreground">
              {pathRow.title}
            </span>
            {paths.map((o) => (
              <button
                key={o.value || 'general'}
                type="button"
                onClick={() => to({ path: o.value, p: 1 })}
                className={cn(CHOICE, o.value === path ? ON : OFF)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5"
          data-testid="history-filters"
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`tab-${f}`}
              aria-pressed={f === filter}
              onClick={() => to({ tab: f, p: 1 })}
              className={cn(CHOICE, f === filter ? ON : OFF)}
            >
              {t(`history.tabs.${f}`)}
            </button>
          ))}
          {levels.length > 1 && <span className="mx-1 h-5 w-px bg-border" />}
          {levels.length > 1 &&
            levels.map((l) => (
              <button
                key={l}
                type="button"
                data-testid={`level-${l}`}
                aria-pressed={l === level}
                onClick={() => to({ level: l, p: 1 })}
                className={cn(CHOICE, l === level ? ON : OFF)}
              >
                {l}
              </button>
            ))}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Link
              to={`/sentences/${lang}`}
              state={{ picks: { ...pathPicks, level } }}
              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('desk.historyBack')}
            </Link>
            {stats && stats.due > 0 && (
              <Button
                size="sm"
                onClick={() => toPractice({ order: 'review' })}
                data-testid="review-all"
              >
                {t('history.reviewAll', { count: stats.due })}
              </Button>
            )}
          </div>
        </div>

        {loading && !history ? (
          <Skeleton className="h-64 w-full rounded-xl" data-testid="history-loading" />
        ) : failed ? (
          <div
            className="rounded-xl border border-border bg-card p-6 text-center"
            data-testid="history-error"
          >
            <p className="text-base text-accent">{errorText(failed)}</p>
            <div className="mt-3 flex justify-center">
              <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                {t('desk.tryAgain')}
              </Button>
            </div>
          </div>
        ) : !history || history.items.length === 0 ? (
          <p
            className="rounded-xl border border-border bg-card p-6 text-center text-base text-muted-foreground"
            data-testid="history-empty"
          >
            {t(`history.empty.${filter}`)}
          </p>
        ) : (
          <ul
            className={cn(
              'divide-y divide-border overflow-hidden rounded-xl border border-border bg-card',
              loading && 'opacity-60',
            )}
            data-testid="history-list"
          >
            {history.items.map((item) => {
              const status = statusOf(item);
              const due = dueText(item);
              return (
                <li
                  key={item.id}
                  className="space-y-1.5 px-4 py-3.5 sm:px-5"
                  data-testid="history-row"
                  data-status={status}
                >
                  <p
                    dir="ltr"
                    className="text-start text-lg font-bold leading-relaxed text-foreground"
                  >
                    <SentenceText text={item.text} lang={lang} />
                  </p>
                  <p className="text-base leading-7 text-muted-foreground">{item.meaning}</p>
                  {status === 'weak' && item.last_wrong_answer && (
                    <p className="text-sm text-caption">
                      {t('history.yourAnswer')}:{' '}
                      <span
                        dir="ltr"
                        lang={lang}
                        className="text-muted-foreground line-through decoration-warning/60"
                      >
                        {item.last_wrong_answer}
                      </span>
                    </p>
                  )}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-caption">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
                      {t(`history.status.${status}`)}
                    </span>
                    <span>
                      {t('history.counts', {
                        correct: item.correct_count,
                        wrong: item.wrong_count,
                      })}
                    </span>
                    {item.last_dir === 'listen' && (
                      <span className="inline-flex items-center gap-1.5">
                        <Headphones className="h-3.5 w-3.5" />
                        {item.last_plays && item.last_plays > 1
                          ? t('history.heardTimes', { count: item.last_plays })
                          : t('history.heard')}
                      </span>
                    )}
                    {/* The ear's verdict is its own fact: a sentence can be known and still not be caught when someone says it. */}
                    {item.last_heard === false && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-warning">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        {t('history.misheard')}
                      </span>
                    )}
                    {due && <span>{due}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {history && pages > 1 && (
          <div
            className="flex items-center justify-center gap-3 text-sm"
            data-testid="history-pager"
          >
            {page > 1 && (
              <button type="button" onClick={() => to({ p: page - 1 })} className={cn(CHOICE, OFF)}>
                {t('history.prev')}
              </button>
            )}
            <span className="text-caption">
              {page} / {pages}
            </span>
            {page < pages && (
              <button type="button" onClick={() => to({ p: page + 1 })} className={cn(CHOICE, OFF)}>
                {t('history.next')}
              </button>
            )}
          </div>
        )}
      </SentencesShell>
    </>
  );
}
