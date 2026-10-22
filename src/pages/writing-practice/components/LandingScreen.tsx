import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  PenLine,
  Play,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/ui/page-header';
import { InlineError } from '@/components/common/InlineError';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { isAiSetupError } from '@/lib/aiSource';
import { cn } from '@/lib/utils';
import * as api from '../lib/api';
import { writingErrorText } from '../lib/errors';
import {
  computeStats,
  elapsedSeconds,
  formatScore,
  formatTime,
  isHighScore,
  mergeHistory,
  parseLimitError,
  timeRemaining,
  type HistoryItem,
} from '../lib/session';
import { useWritingAi } from '../lib/useWritingAi';
import {
  EXAM_CATEGORIES,
  type LimitInfo,
  type UsageInfo,
  type WritingExamType,
  type WritingSession,
} from '../lib/types';
import { Chip } from './bits';

const ICONS: Record<WritingExamType, LucideIcon> = {
  ielts_task1: GraduationCap,
  ielts_task2: GraduationCap,
  toefl_integrated: GraduationCap,
  toefl_independent: GraduationCap,
  celpip: GraduationCap,
  cambridge_fce: GraduationCap,
  cambridge_cae: GraduationCap,
  duolingo: GraduationCap,
  pte: GraduationCap,
  general_email: Mail,
  general_essay: FileText,
  general_letter: Mail,
  general_report: BarChart3,
};

const TIMER_KEY = 'fl_writing_timer_enabled';
const HISTORY_FETCH = 200;

function readTimerPref(): boolean {
  try {
    return localStorage.getItem(TIMER_KEY) !== 'false';
  } catch {
    return true;
  }
}

interface Loaded {
  localActive: WritingSession | null;
  cloudActive: WritingSession | null;
  history: HistoryItem[];
  totalSessions: number;
  usage: UsageInfo | null;
}

const EMPTY: Loaded = {
  localActive: null,
  cloudActive: null,
  history: [],
  totalSessions: 0,
  usage: null,
};

export function LandingScreen() {
  const { t, i18n } = useTranslation('writingPractice');
  const navigate = useNavigate();
  const { route, cloud, checking, own, refresh } = useWritingAi();

  const [data, setData] = useState<Loaded>(EMPTY);
  const [selected, setSelected] = useState<WritingExamType | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [limitInfo, setLimitInfo] = useState<LimitInfo | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(readTimerPref);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(TIMER_KEY, String(timerEnabled));
    } catch {
      /* private mode: the toggle just is not remembered */
    }
  }, [timerEnabled]);

  const load = useCallback(async () => {
    if (checking) return;
    const [localHist, localActive] = await Promise.all([
      api
        .getHistory('local', HISTORY_FETCH)
        .catch(() => ({ sessions: [], total: 0, all_total: 0 })),
      api.getActive('local').catch(() => null),
    ]);
    let cloudHist = { sessions: [] as WritingSession[], total: 0 };
    let cloudActive: WritingSession | null = null;
    let usage: UsageInfo | null = null;
    if (cloud) {
      [cloudHist, cloudActive, usage] = await Promise.all([
        api.getHistory('cloud', HISTORY_FETCH).catch(() => cloudHist),
        api.getActive('cloud').catch(() => null),
        api.checkUsage().catch(() => null),
      ]);
    }
    setData({
      localActive,
      cloudActive,
      history: mergeHistory(localHist.sessions, cloudHist.sessions),
      totalSessions: (localHist.all_total ?? 0) + cloudHist.total + (cloudActive ? 1 : 0),
      usage,
    });
  }, [checking, cloud]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = data.localActive ?? data.cloudActive;
  const activeRoute = data.localActive ? 'local' : 'cloud';

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeId]);

  const stats = useMemo(
    () => computeStats(data.history, data.totalSessions),
    [data.history, data.totalSessions],
  );

  const start = useCallback(
    async (examType: WritingExamType) => {
      if (active) {
        setError(t('activeSession.existsMessage'));
        return;
      }
      setError(null);
      setLimitInfo(null);
      setSetupNeeded(false);
      setSelected(examType);
      setStarting(true);
      try {
        const created = await api.startSession(route, examType, timerEnabled);
        navigate(`/writing-practice/${created.session_id}`);
      } catch (err) {
        const limit = route === 'cloud' ? parseLimitError(err) : null;
        if (limit) {
          setLimitInfo(limit);
        } else if (isAiSetupError(err)) {
          setSetupNeeded(true);
        } else {
          setError(writingErrorText(t, err));
        }
        setStarting(false);
        setSelected(null);
        void load();
      }
    },
    [active, route, timerEnabled, navigate, load, t],
  );

  const onAiReady = useCallback(() => {
    setSetupNeeded(false);
    void refresh();
  }, [refresh]);

  const { usage } = data;
  const showUsage = cloud && usage && !usage.isUnlimited;
  const showStats = stats.graded_sessions > 0;
  const recent = data.history.slice(0, 5);
  const elapsed = active ? elapsedSeconds(active.started_at, now) : 0;
  const left = active ? timeRemaining(active.started_at, active.time_limit_seconds, now) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:gap-5 sm:p-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        {t('back')}
      </button>

      <PageHeader
        icon={PenLine}
        title={t('title')}
        subtitle={t('subtitle')}
        className="mb-0"
        action={
          <label className="inline-flex cursor-pointer select-none items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Timer className="h-3 w-3" />
              {t('timerToggle')}
            </span>
            <Switch
              checked={timerEnabled}
              onCheckedChange={setTimerEnabled}
              aria-label={t('timerToggle')}
            />
          </label>
        }
      />

      {active && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-accent/25 bg-card p-4">
          <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12">
                <PenLine className="h-4 w-4 text-accent" />
              </div>
              <div className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-success" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-foreground">{t('activeSession.title')}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Chip tone="primary">{t(`examTypes.${active.exam_type}`)}</Chip>
                {cloud && <Chip tone="muted">{t(`origin.${activeRoute}`)}</Chip>}
                <span className="truncate text-[11.5px] text-muted-foreground">
                  {active.prompt?.topic}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {active.timer_enabled && left !== null ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-mono text-[13px] font-bold tabular-nums',
                  left <= 60 ? 'text-error' : left <= 300 ? 'text-warning' : 'text-success',
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                {formatTime(left)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[13px] tabular-nums text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(elapsed)}
              </span>
            )}
            <Button variant="accent" onClick={() => navigate(`/writing-practice/${active.id}`)}>
              <Play className="fill-current" />
              {t('activeSession.resume')}
            </Button>
          </div>
        </div>
      )}

      {(showUsage || showStats) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {showUsage && usage && (
            <StatCard
              icon={Zap}
              value={usage.remaining != null ? String(usage.remaining) : '--'}
              label={
                usage.remaining != null && usage.remaining > 0
                  ? t('usage.remaining', { count: usage.remaining })
                  : t('usage.limitReached')
              }
              tone="primary"
            />
          )}
          {showStats && (
            <>
              <StatCard
                icon={PenLine}
                value={String(stats.total_sessions)}
                label={t('stats.totalSessions')}
                tone="muted"
              />
              {stats.best_criteria && (
                <StatCard
                  icon={Trophy}
                  value={stats.best_criteria.replace(/_/g, ' ')}
                  label={t('stats.bestCriteria')}
                  tone="success"
                  valueIsText
                />
              )}
              {stats.weakest_criteria && (
                <StatCard
                  icon={Target}
                  value={stats.weakest_criteria.replace(/_/g, ' ')}
                  label={t('stats.weakestCriteria')}
                  tone="warning"
                  valueIsText
                />
              )}
            </>
          )}
        </div>
      )}

      {limitInfo && <LimitBanner info={limitInfo} />}

      {setupNeeded && (
        <AiSetupCard
          reason={own.kind === 'unconfigured' ? own.reason : undefined}
          onReady={onAiReady}
        />
      )}

      {!limitInfo && !setupNeeded && error && (
        <InlineError message={error} onDismiss={() => setError(null)} />
      )}

      {EXAM_CATEGORIES.map((category) => (
        <div key={category.key} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[10px] font-bold uppercase tracking-[.12em] text-accent/70">
            {t(`categories.${category.key}`)}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {category.types.map((type) => (
              <ExamTypeCard
                key={type}
                icon={ICONS[type]}
                name={t(`examTypes.${type}`)}
                description={t(`examDescriptions.${type}`)}
                isLoading={starting && selected === type}
                isDisabled={starting || checking}
                onClick={() => void start(type)}
              />
            ))}
          </div>
        </div>
      ))}

      <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground/70">
        {t('disclaimer')}
      </p>

      {recent.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border bg-accent/[0.04] px-4 py-3.5 sm:px-5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Trophy className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold leading-tight tracking-tight text-foreground">
                {t('history.title')}
              </h2>
              <p className="text-[11.5px] tabular-nums text-muted-foreground">{recent.length}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recent.map((s) => (
              <HistoryRow
                key={s.id}
                session={s}
                showOrigin={cloud}
                locale={i18n.language}
                examLabel={t(`examTypes.${s.exam_type}`)}
                wordsLabel={t('history.wordsWritten')}
                originLabel={t(`origin.${s.route}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LimitBanner({ info }: { info: LimitInfo }) {
  const { t } = useTranslation('writingPractice');
  const daily = info.limitType === 'daily';
  const hasDaily = info.dailyLimit != null && info.dailyLimit > 0;
  const descKey = daily
    ? 'limitUsedAllDaily'
    : hasDaily
      ? 'limitUsedAllMonthly'
      : 'limitUsedAllMonthlyNoDaily';
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] p-4"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15">
        <AlertTriangle className="h-4 w-4 text-warning" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="mb-0.5 text-[13.5px] font-bold text-warning">
          {t(daily ? 'usage.dailyLimitReached' : 'usage.monthlyLimitReached')}
        </h4>
        <p className="mb-1.5 text-xs leading-relaxed text-warning/80">
          {t(`usage.${descKey}`, {
            monthlyLimit: info.monthlyLimit ?? 0,
            dailyLimit: info.dailyLimit ?? 0,
          })}
        </p>
        <p className="text-[11.5px] text-warning/70">
          {t(daily ? 'usage.limitResetDaily' : 'usage.limitResetMonthly')}
        </p>
      </div>
    </div>
  );
}

const STAT_TONE = {
  primary: 'bg-accent/10 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  muted: 'bg-primary-light/10 text-primary-light',
} as const;

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
  valueIsText = false,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  tone: keyof typeof STAT_TONE;
  valueIsText?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          STAT_TONE[tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'font-extrabold leading-tight tabular-nums text-foreground',
            valueIsText ? 'truncate text-sm capitalize' : 'text-xl',
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ExamTypeCard({
  icon: Icon,
  name,
  description,
  isLoading,
  isDisabled,
  onClick,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  isLoading: boolean;
  isDisabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="group rounded-xl border border-border bg-card p-4 text-start transition-all duration-200 hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent/[0.08] transition-all duration-200 group-hover:scale-105 group-hover:bg-accent/15">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          ) : (
            <Icon className="h-4 w-4 text-accent" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-tight text-foreground transition-colors group-hover:text-accent">
            {name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-all group-hover:text-accent rtl:rotate-180" />
      </div>
    </button>
  );
}

function HistoryRow({
  session,
  showOrigin,
  locale,
  examLabel,
  wordsLabel,
  originLabel,
}: {
  session: HistoryItem;
  showOrigin: boolean;
  locale: string;
  examLabel: string;
  wordsLabel: string;
  originLabel: string;
}) {
  const graded = session.status === 'graded';
  const score = session.overall_score;
  return (
    <Link
      to={`/writing-practice/${session.id}`}
      className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-accent/[0.04] sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', graded ? 'bg-success' : 'bg-accent/70')}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {session.prompt?.topic || examLabel}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Chip tone="primary">{examLabel}</Chip>
            {showOrigin && <Chip tone="muted">{originLabel}</Chip>}
            {session.graded_at && (
              <span className="text-[11px] text-muted-foreground">
                {new Date(session.graded_at).toLocaleDateString(locale)}
              </span>
            )}
            {session.word_count > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {session.word_count} {wordsLabel.toLowerCase()}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {score != null && (
          <span
            className={cn(
              'inline-flex items-center rounded-lg px-2.5 py-1 text-[13px] font-bold tabular-nums',
              isHighScore(score, session.exam_type)
                ? 'bg-success/15 text-success'
                : 'bg-warning/15 text-warning',
            )}
          >
            {formatScore(score, session.exam_type)}
          </span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-all group-hover:text-accent rtl:rotate-180" />
      </div>
    </Link>
  );
}
