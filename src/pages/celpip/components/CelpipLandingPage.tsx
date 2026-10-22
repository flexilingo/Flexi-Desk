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
import {
  useCelpipStore,
  isRankedSession,
  isResumable,
  hasSectionLeft,
  isScoringSession,
  sessionProgress,
} from '../stores/celpipStore';
import { meanOf, SECTION_META } from '../results/shared';
import { EXAM_SESSION_TTL_MS, SECTION_TYPES } from '../types';
import type { SectionType } from '../types';
import { SUPPORTED_EXAM_TYPES, examBase, formatBand, getExamProfile } from '../examProfiles';
import { ENABLED_MODULES } from '@/config/features';
import { StatCards } from './landing/StatCards';
import { CoachReportCard } from './landing/CoachReportCard';
import { SkillProfileCard } from './landing/SkillProfileCard';
import { ExamHistoryList } from './landing/ExamHistoryList';
import { ScoreProgressChart } from './landing/ScoreProgressChart';
import { StartExamDialog } from './landing/StartExamDialog';
import type { ExamPreselect } from './landing/StartExamDialog';

// How far through its sections the active exam is, as a width.
const PROGRESS_WIDTH = ['w-[12%]', 'w-[37%]', 'w-[62%]', 'w-[87%]'];

/**
 * The hub of one exam type: what it is, start/resume, stats, history and the
 * progress chart. CELPIP and the TCF family share it; `examType` picks the
 * profile (titles, clocks, band scale, whether it can be started at all).
 */
export function CelpipLandingPage({ examType = 'celpip' }: { examType?: string }) {
  const { t, i18n } = useTranslation('celpip');
  const { t: tx } = useTranslation('exam');
  const navigate = useNavigate();
  const profile = getExamProfile(examType);
  const base = examBase(profile.examType);
  const short = profile.sectionShortLabels;
  const fullDuration = t(profile.durationShortKey, { ns: profile.ns });
  const comingSoon = profile.hubStatus === 'comingSoon';
  const bandFmt = (n: number) => formatBand(profile, n);

  const { sessions, isSessionsLoading, fetchSessions } = useCelpipStore();

  const session = useAuthStore((s) => s.session);
  const isAuthLoading = useAuthStore((s) => s.isLoading);
  const isSignedIn = !!session;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [preselect, setPreselect] = useState<ExamPreselect | undefined>(undefined);
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    if (isSignedIn) fetchSessions(profile.examType);
  }, [fetchSessions, isSignedIn, profile.examType]);

  // The store holds one exam type's sessions at a time; ignore a stale list.
  const ownSessions = useMemo(
    () => sessions.filter((s) => (s.exam_type ?? profile.examType) === profile.examType),
    [sessions, profile.examType],
  );

  const openDialog = (sel?: ExamPreselect) => {
    setPreselect(sel);
    setDialogOpen(true);
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });

  // Only an unfinished, still-in-TTL session with a section left is resumable
  // (learning never expires). One whose sections are all submitted is being
  // scored and must not hide Start.
  const activeSession = useMemo(
    () => ownSessions.find((s) => isResumable(s, EXAM_SESSION_TTL_MS) && hasSectionLeft(s)),
    [ownSessions],
  );
  const scoringSessions = useMemo(() => ownSessions.filter(isScoringSession), [ownSessions]);

  // Completed rows drive the history list; ranked rows drive stats + the chart.
  const completedSessions = useMemo(
    () => ownSessions.filter((s) => s.status === 'completed'),
    [ownSessions],
  );
  const rankedSessions = useMemo(() => ownSessions.filter(isRankedSession), [ownSessions]);

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
          <h1 className="text-2xl font-bold text-foreground">
            {t(profile.titleKey, { ns: profile.ns })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(profile.hubDescriptionKey, { ns: profile.ns })}
          </p>
        </div>
      </div>

      {/* The exams of this module: CELPIP and the TCF family share this hub. */}
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {SUPPORTED_EXAM_TYPES.filter((x) => x === 'celpip' || ENABLED_MODULES.tcf).map((x) => {
          const other = getExamProfile(x);
          const active = x === profile.examType;
          return (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => navigate(examBase(x))}
              className={`inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {t(other.titleKey, { ns: other.ns })}
              {other.hubStatus === 'comingSoon' && (
                <span className="rounded-full bg-muted px-1.5 py-[1px] text-[10px] font-bold text-muted-foreground">
                  {t('comingSoon')}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hero — the single entry point for starting a session */}
      <section className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[15px] font-extrabold tracking-tight text-foreground">
            {t('heroTitle')}
          </h2>
          <p className="max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            {comingSoon ? t('comingSoon') : t('examDescription')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
            {/* The dialog below now opens on PRACTICE, so the clock belongs to
                the full exam — a flat "~3 hours" prices a one-section practice
                run at three hours. */}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t('heroFullDuration', { duration: fullDuration })}
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>4 {t('sections')}:</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-success">
                <Headphones className="h-3 w-3" /> {short.listening}
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-accent">
                <BookOpen className="h-3 w-3" /> {short.reading}
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
                <PenLine className="h-3 w-3" /> {short.writing}
              </span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-warning">
                <Mic className="h-3 w-3" /> {short.speaking}
              </span>
            </span>
          </div>
        </div>
        {comingSoon ? (
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-[12px] font-semibold text-muted-foreground">
            {t('comingSoon')}
          </span>
        ) : !isSignedIn ? (
          <Button onClick={() => setSignInOpen(true)} disabled={isAuthLoading}>
            <LogIn className="h-3.5 w-3.5" />
            {t('signInToStart', 'Sign in to start')}
          </Button>
        ) : activeSession ? (
          <Button onClick={() => navigate(`${base}/session/${activeSession.id}`)}>
            <Play className="h-3.5 w-3.5" />
            {t('resumeExam')}
          </Button>
        ) : (
          <Button onClick={() => openDialog()}>
            <Play className="h-3.5 w-3.5" />
            {t('startCta')}
          </Button>
        )}
      </section>

      {/* Practise one section, or one task of it: opens the dialog on that
          section with every choice ticked, and the first tap picks just one. */}
      {isSignedIn && !comingSoon && profile.features.practice && !activeSession && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-muted-foreground">
            {t('choosePracticeSections')}
          </span>
          {SECTION_TYPES.map((key: SectionType) => {
            const Icon = SECTION_META[key].icon;
            return (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => openDialog({ section: key })}
              >
                <Icon className={`h-3.5 w-3.5 ${SECTION_META[key].color}`} />
                {t(profile.sectionLabelKeys[key], { ns: profile.ns })}
              </Button>
            );
          })}
        </div>
      )}

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
              {t('currentSectionProgress', sessionProgress(activeSession))}
              {' · '}
              {formatDate(activeSession.created_at)}
            </p>
            <div className="mt-2 h-1.5 max-w-[260px] overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full bg-warning ${
                  PROGRESS_WIDTH[
                    Math.min(3, Math.max(0, sessionProgress(activeSession).current - 1))
                  ] ?? 'w-0'
                }`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Finished, still being scored — the results page shows what is ready */}
      {scoringSessions.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/[0.08] px-4 py-3"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-success" />
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
            {tx('examBeingScored', { date: formatDate(s.started_at ?? s.created_at) })}
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(`${base}/results/${s.id}`)}>
            {t('viewResults')}
          </Button>
        </div>
      ))}

      {/* Coach report - above the fold on purpose: the one thing on this page written about THIS learner. */}
      {isSignedIn && !comingSoon && profile.features.coach && (
        <CoachReportCard examType={profile.examType} sessions={ownSessions} />
      )}

      {/* Summary stats */}
      {isSignedIn && (
        <StatCards
          total={stats.total}
          best={stats.best}
          avg={stats.avg}
          lastLabel={stats.lastLabel}
          bandMax={profile.band.kind === 'level' ? 12 : profile.band.max}
          formatBand={profile.examType === 'celpip' ? undefined : bandFmt}
        />
      )}

      {/* What practice is worth: per-skill, coverage-weighted, the overall a ceiling (≤) while a skill is unmeasured. */}
      {isSignedIn && !comingSoon && profile.examType === 'celpip' && (
        <SkillProfileCard sessions={ownSessions} />
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
            <ScoreProgressChart
              sessions={rankedSessions}
              bandMax={profile.band.kind === 'level' ? 12 : profile.band.max}
              className="px-4 py-4 sm:px-5"
            />
          </section>

          <div className="xl:order-1">
            <ExamHistoryList
              sessions={completedSessions}
              onView={(id) => navigate(`${base}/results/${id}`)}
              short={profile.examType === 'celpip' ? undefined : short}
              formatBand={profile.examType === 'celpip' ? undefined : bandFmt}
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

      <StartExamDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        examType={profile.examType}
        preselect={preselect}
      />

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description={t(
          'signInDialogHint',
          'Sign in to start exams and keep your scores on your account.',
        )}
        onSignedIn={() => fetchSessions(profile.examType)}
      />
    </div>
  );
}
