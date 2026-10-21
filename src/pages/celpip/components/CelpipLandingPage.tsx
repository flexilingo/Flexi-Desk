import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  Play,
  Clock,
  Headphones,
  BookOpen,
  PenLine,
  Mic,
  AlertCircle,
  Loader2,
  Trophy,
  TrendingUp,
  LogIn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useCelpipStore, isRankedSession, isResumable } from '../stores/celpipStore';
import { meanOf } from '../results/shared';
import { EXAM_SESSION_TTL_MS } from '../types';
import { StatCards } from './landing/StatCards';
import { ExamHistoryList } from './landing/ExamHistoryList';
import { ScoreProgressChart } from './landing/ScoreProgressChart';
import { StartExamDialog } from './landing/StartExamDialog';

/** CELPIP General is the only exam this desk client can start. */
const EXAM_TYPE = 'celpip';

// current_section (0..3) → how far through the four sections the active exam is.
const ACTIVE_PROGRESS: Record<number, string> = {
  0: 'w-[12%]',
  1: 'w-[37%]',
  2: 'w-[62%]',
  3: 'w-[87%]',
};

export function CelpipLandingPage() {
  const { t, i18n } = useTranslation('celpip');
  const navigate = useNavigate();

  const { sessions, isSessionsLoading, fetchSessions } = useCelpipStore();

  const session = useAuthStore((s) => s.session);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const isSignedIn = !!session;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    if (isSignedIn) fetchSessions(EXAM_TYPE);
  }, [fetchSessions, isSignedIn]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });

  // Only an unfinished, still-in-TTL session is resumable (learning never expires).
  const activeSession = useMemo(
    () => sessions.find((s) => isResumable(s, EXAM_SESSION_TTL_MS)),
    [sessions],
  );

  // Completed rows drive the history list; ranked rows drive stats + the chart.
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === 'completed'),
    [sessions],
  );
  const rankedSessions = useMemo(() => sessions.filter(isRankedSession), [sessions]);

  const stats = useMemo(() => {
    const scores = rankedSessions.map((s) => s.m_score as number);
    return {
      total: rankedSessions.length,
      best: scores.length ? Math.max(...scores) : null,
      avg: meanOf(scores),
      lastLabel: completedSessions[0] ? formatDate(completedSessions[0].created_at) : null,
    };
    // formatDate depends only on the (stable) locale; recompute on data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedSessions, completedSessions, i18n.language]);

  const hasHistory = completedSessions.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('celpip.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('celpip.description')}</p>
        </div>
      </div>

      {/* Hero — the single entry point for starting a session */}
      <section className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[15px] font-extrabold tracking-tight text-foreground">
            {t('heroTitle')}
          </h2>
          <p className="max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            {t('examDescription')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
            {/* The dialog below now opens on PRACTICE, so the clock belongs to
                the full exam — a flat "~3 hours" prices a one-section practice
                run at three hours. */}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t('heroFullDuration', { duration: t('duration') })}
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>4 {t('sections')}:</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-success">
                <Headphones className="h-3 w-3" /> L
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-accent">
                <BookOpen className="h-3 w-3" /> R
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
                <PenLine className="h-3 w-3" /> W
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-warning">
                <Mic className="h-3 w-3" /> S
              </span>
            </span>
          </div>
        </div>
        {!isSignedIn ? (
          <Button onClick={() => setSignInOpen(true)} disabled={isAuthLoading}>
            <LogIn className="h-3.5 w-3.5" />
            {t('signInToStart', 'Sign in to start')}
          </Button>
        ) : activeSession ? (
          <Button onClick={() => navigate(`/celpip/session/${activeSession.id}`)}>
            <Play className="h-3.5 w-3.5" />
            {t('resumeExam')}
          </Button>
        ) : (
          <Button onClick={() => setDialogOpen(true)}>
            <Play className="h-3.5 w-3.5" />
            {t('startCta')}
          </Button>
        )}
      </section>

      {/* Signed-out notice — exams run on the user's FlexiLingo account */}
      {!isSignedIn && !isAuthLoading && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
            <LogIn className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-foreground">
              {t('signInRequiredTitle', 'FlexiLingo account required')}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {t(
                'signInRequiredHint',
                'Exams are assembled and scored on your FlexiLingo account, so your history and progress follow you across devices. Sign in with your email — no password needed.',
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSignInOpen(true)}>
            <LogIn className="h-3.5 w-3.5" />
            {t('signIn', 'Sign in')}
          </Button>
        </div>
      )}

      {/* Active session banner */}
      {activeSession && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-warning/15">
            <AlertCircle className="h-4 w-4 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-foreground">{t('examInProgress')}</p>
            <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
              {t('currentSectionProgress', {
                current: activeSession.current_section + 1,
                total: 4,
              })}
              {' · '}
              {formatDate(activeSession.created_at)}
            </p>
            <div className="mt-2 h-1.5 max-w-[260px] overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-warning ${ACTIVE_PROGRESS[activeSession.current_section] ?? 'w-0'}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      {isSignedIn && (
        <StatCards
          total={stats.total}
          best={stats.best}
          avg={stats.avg}
          lastLabel={stats.lastLabel}
        />
      )}

      {/* History + progress */}
      {!isSignedIn ? null : isSessionsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : hasHistory ? (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Chart leads on mobile (order-2 on xl → right column, sticky) */}
          <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm xl:order-2 xl:sticky xl:top-6">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5 sm:px-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-[15px] font-bold leading-tight tracking-tight text-foreground">
                  {t('progressTitle')}
                </h2>
                <p className="text-[11.5px] text-muted-foreground">{t('progressSubtitle')}</p>
              </div>
            </div>
            <ScoreProgressChart sessions={rankedSessions} className="px-4 py-4 sm:px-5" />
          </section>

          <div className="xl:order-1">
            <ExamHistoryList
              sessions={completedSessions}
              onView={(id) => navigate(`/celpip/results/${id}`)}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-[1.5px] border-dashed border-border bg-card px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent/10">
            <Trophy className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-foreground">{t('historyEmptyTitle')}</p>
            <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
              {t('historyEmptyHint')}
            </p>
          </div>
        </div>
      )}

      <StartExamDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description={t(
          'signInDialogHint',
          'Sign in to start CELPIP exams and keep your scores on your account.',
        )}
        onSignedIn={() => fetchSessions(EXAM_TYPE)}
      />
    </div>
  );
}
