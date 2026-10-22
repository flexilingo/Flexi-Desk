import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  RotateCcw,
  Trophy,
  Sparkles,
  BookOpen,
  LayoutGrid,
  FileQuestion,
  AlertCircle,
} from 'lucide-react';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCelpipStore, isRankedSession } from '../stores/celpipStore';
import { useAiSource } from '@/stores/aiSourceStore';
import { cloudInsightProvider, localInsightProvider } from '../hooks/insightProviders';
import { useStagedInsight } from '../hooks/useStagedInsight';
import { clbToLevel, SECTION_META, meanOf, scaleFromProfile } from '../results/shared';
import { cefrOverallIndex, examBase, getExamProfile, quebecPointsFor } from '../examProfiles';
import { QuebecPointsCard } from '../results/QuebecPointsCard';
import { ScoringInfoDialog } from '../results/ScoringInfoDialog';
import { ScoringUpdateNotice } from '../results/ScoringUpdateNotice';
import { CompletionProgressCard } from '../results/CompletionProgressCard';
import { useExamCompletionPoll } from '../hooks/useExamCompletionPoll';
import { getReviewTranscripts, type ReviewTranscripts } from '../services/celpipCloud';
import { TcfNextSteps } from '../results/TcfNextSteps';
import { errorCodeOf } from '../stores/celpipStore';
import { WordLookupProvider } from './session/WordLookup';
import { OverviewTab } from '../results/OverviewTab';
import { SkillTab } from '../results/SkillTab';
import { VocabularyTab } from '../results/VocabularyTab';
import type { InsightSkill, ListeningContent, ReadingContent, SectionResult } from '../types';

const SKILL_KEYS = ['listening', 'reading', 'writing', 'speaking'] as const;

interface CelpipResultsPageProps {
  /** Session to show. Falls back to the `:sessionId` route param when omitted. */
  sessionId?: string;
  /** Exam type from the route; the session's own `exam_type` wins once loaded. */
  examType?: string;
  /** Navigation hooks owned by the shell that mounts this page. */
  onTakeAgain?: () => void;
  onPickExam?: () => void;
}

export function CelpipResultsPage({
  sessionId: propSessionId,
  examType: examTypeProp,
  onTakeAgain,
  onPickExam,
}: CelpipResultsPageProps) {
  const { t, i18n } = useTranslation('celpip');
  const { t: tx } = useTranslation('exam');
  const navigate = useNavigate();
  const params = useParams<{ sessionId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const sessionId = propSessionId ?? params.sessionId ?? '';

  const rawResults = useCelpipStore((s) => s.results);
  const isResultsLoading = useCelpipStore((s) => s.isResultsLoading);
  const fetchResults = useCelpipStore((s) => s.fetchResults);
  const sessions = useCelpipStore((s) => s.sessions);
  const fetchSessions = useCelpipStore((s) => s.fetchSessions);

  const { source: aiSource, own: ownAi } = useAiSource();

  // The store's `results` is shared; ignore it until it matches this session so a
  // prior session's data never flashes here.
  const data = rawResults?.session?.id === sessionId ? rawResults : null;

  const session = data?.session;
  // Exam profile: CELPIP's CLB scale and insight exactly as before; the TCF family
  // swaps the scale (NCLC, or a CEFR letter), shows raw /699 and /20, and has
  // neither insight nor vocabulary (the backend answers EXAM_FEATURE_UNAVAILABLE).
  const profile = getExamProfile(session?.exam_type ?? examTypeProp);
  const scale = scaleFromProfile(profile);
  const base = examBase(profile.examType);
  const insightEnabled = profile.features.insight;
  const vocabEnabled = profile.features.vocab;
  const startPracticeSession = useCelpipStore((s) => s.startPracticeSession);
  const isStarting = useCelpipStore((s) => s.isStarting);
  const [retakeError, setRetakeError] = useState<string | null>(null);
  const [scoringInfoOpen, setScoringInfoOpen] = useState(false);

  useEffect(() => {
    if (sessionId) fetchResults(sessionId);
  }, [sessionId, fetchResults]);
  useEffect(() => {
    fetchSessions(profile.examType);
  }, [fetchSessions, profile.examType]);

  // A practice run is a slice of the exam — one task can be all it holds — so its
  // score is not an immigration score and must not be ranked against thresholds.
  const isPracticeRun = session?.mode === 'practice';

  // "Take again" re-sits this very practice — same parts, straight into the
  // session. Going back to the hub always dealt new, unseen parts, so a learner
  // could never redo a test that went wrong. A full mock starts from the hub.
  const takeAgain =
    onTakeAgain ??
    (async () => {
      if (!isPracticeRun) {
        navigate(base);
        return;
      }
      setRetakeError(null);
      const id = await startPracticeSession({
        exam_type: profile.examType,
        sections: {},
        retake_session_id: sessionId,
      });
      if (id) navigate(`${base}/session/${id}`);
      else {
        // The store set its error code during the call; read it fresh, not from this render.
        const code = errorCodeOf(useCelpipStore.getState().error ?? 'UNKNOWN_ERROR');
        setRetakeError(t(`errors.${code}`, { defaultValue: t('startPracticeError') }));
      }
    });
  const pickExam = onPickExam ?? (() => navigate(base));

  const sectionResults = (data?.section_results ?? []) as SectionResult[];
  const takenSections = sectionResults.map((r) => r.section_type);

  // Listening scripts arrive separately (exam-review), once Listening is scored. On a
  // locked result every part comes back with no script and `locked: true`.
  const listeningScored = sectionResults.some(
    (r) => r.section_type === 'listening' && r.status === 'scored',
  );
  const [review, setReview] = useState<ReviewTranscripts | null>(null);
  const reviewRefetchedRef = useRef(false);
  useEffect(() => {
    if (!sessionId || !listeningScored) return;
    let cancelled = false;
    getReviewTranscripts(sessionId)
      .then((r) => {
        if (!cancelled) setReview(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, listeningScored]);
  // The transcripts were read as locked while the result itself now reads in full (a
  // claim, a metering or an upgrade landed in between): read them once more.
  const reviewStale = Boolean(review?.locked && data?.speaking_media_locked === false);
  useEffect(() => {
    if (reviewRefetchedRef.current || !reviewStale || !listeningScored) return;
    reviewRefetchedRef.current = true;
    getReviewTranscripts(sessionId)
      .then(setReview)
      .catch(() => {});
  }, [reviewStale, listeningScored, sessionId]);

  // A section can still be mid-scoring after the SESSION has flipped to completed -
  // AI scoring of Writing/Speaking runs detached, so the row sits at 'scoring' with
  // a null score for a while. The poll watches the server (which self-heals and
  // finalizes on every get_results call) and never gives up; it only slows down.
  const sectionsStillScoring = sectionResults.some(
    (r) => r.clb_score === null && r.status !== 'failed' && r.status !== 'scored',
  );
  const completionPoll = useExamCompletionPoll(
    Boolean(data && (session?.status !== 'completed' || sectionsStillScoring)),
    sectionResults,
    () => void fetchResults(sessionId),
  );

  // A section's score that lands while the page is open gets a short notice - the
  // tab it arrived in may not be the one on screen.
  const scoringNow = sectionResults
    .filter((r) => r.status === 'scoring')
    .map((r) => r.section_type as string)
    .join(',');
  const scoredNow = sectionResults
    .filter((r) => r.status === 'scored')
    .map((r) => r.section_type as string)
    .join(',');
  const [prevScoring, setPrevScoring] = useState(scoringNow);
  const [justScored, setJustScored] = useState<string | null>(null);
  if (prevScoring !== scoringNow) {
    const landed = prevScoring.split(',').find((k) => k && scoredNow.split(',').includes(k));
    setPrevScoring(scoringNow);
    if (landed) setJustScored(landed);
  }
  useEffect(() => {
    if (!justScored) return;
    const id = setTimeout(() => setJustScored(null), 8000);
    return () => clearTimeout(id);
  }, [justScored]);

  const activeTab = searchParams.get('tab') || 'overview';
  // A ?tab= pointing at a section that wasn't taken falls back to overview.
  const currentTab =
    activeTab === 'overview' ||
    (activeTab === 'vocabulary' && vocabEnabled) ||
    (takenSections as string[]).includes(activeTab)
      ? activeTab
      : 'overview';

  const setTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  // The insight is written by the AI the user set up (their device or their own key).
  // FlexiLingo's cloud writes it only when the user switched that on in Settings and
  // is entitled to it; a paid plan alone never routes here.
  // The cloud has no insight for the TCF family, so TCF is always written by the user's own AI.
  const routeCloud = aiSource.kind === 'cloud' && profile.examType === 'celpip';
  const localOrigin = ownAi.kind === 'own' ? ownAi.origin : 'device';
  const provider = useMemo(() => {
    // localInsightProvider reads `results` at construction, so only build it once
    // the matching results are in; until then a (never-called) provider is a safe
    // placeholder because `enabled` stays false. It never sends anything.
    if (routeCloud || !data) return cloudInsightProvider(sessionId);
    return localInsightProvider(sessionId, data, localOrigin);
  }, [routeCloud, sessionId, data, localOrigin]);

  const enabled = Boolean(
    insightEnabled &&
    aiSource.kind !== 'checking' &&
    data &&
    session?.status === 'completed' &&
    takenSections.length > 0,
  );
  const staged = useStagedInsight(provider, enabled, currentTab);

  const sectionLabels: Record<string, string> = {
    listening: t(profile.sectionLabelKeys.listening, { ns: profile.ns }),
    reading: t(profile.sectionLabelKeys.reading, { ns: profile.ns }),
    writing: t(profile.sectionLabelKeys.writing, { ns: profile.ns }),
    speaking: t(profile.sectionLabelKeys.speaking, { ns: profile.ns }),
  };

  // Averages from prior RANKED sessions (completed, not learning-mode, scored),
  // excluding the one being viewed.
  const averages = useMemo(() => {
    const result: Record<
      'm_score' | 'listening' | 'reading' | 'writing' | 'speaking',
      number | null
    > = {
      m_score: null,
      listening: null,
      reading: null,
      writing: null,
      speaking: null,
    };
    const others = sessions.filter((s) => s.id !== sessionId && isRankedSession(s));
    if (!others.length) return result;
    result.m_score = meanOf(others.map((s) => s.m_score));
    result.listening = meanOf(others.map((s) => s.listening_score));
    result.reading = meanOf(others.map((s) => s.reading_score));
    result.writing = meanOf(others.map((s) => s.writing_score));
    result.speaking = meanOf(others.map((s) => s.speaking_score));
    return result;
  }, [sessions, sessionId]);

  const erroredSkills = SKILL_KEYS.filter(
    (k) =>
      insightEnabled && (takenSections as string[]).includes(k) && staged.skillState(k) === 'error',
  );

  // The user just finished setting up their AI: re-run what failed for lack of one.
  const previousOwnKind = useRef(ownAi.kind);
  useEffect(() => {
    if (previousOwnKind.current === 'unconfigured' && ownAi.kind === 'own' && !routeCloud) {
      erroredSkills.forEach((k) => staged.retry(k));
      if (staged.skillState('summary') === 'error') staged.retry('summary');
    }
    previousOwnKind.current = ownAi.kind;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAi.kind, routeCloud]);

  const vsAvgT = (key: 'vsAvgPositive' | 'vsAvgNegative' | 'vsAvgEqual', val?: string) =>
    key === 'vsAvgPositive'
      ? t('vsAvgPositive', { delta: val! })
      : key === 'vsAvgNegative'
        ? t('vsAvgNegative', { delta: val! })
        : t('vsAvgEqual');

  // ── Early states ────────────────────────────────────────────────────────────

  if (isResultsLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-[13px] text-muted-foreground">{t('loadingResults')}</p>
        </div>
      </div>
    );
  }

  if (!data || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8 text-center text-muted-foreground">
        {t('resultsNotFound')}
      </div>
    );
  }

  // Only a session still mid-exam (a section not submitted yet) gets the progress
  // card. Once everything is submitted the results show right away: sections already
  // scored show their score, and one still in the queue says it is being scored.
  const midExam = sectionResults.some((r) => r.status === 'pending');
  if (session.status !== 'completed' && midExam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 md:p-8">
        <CompletionProgressCard
          sectionResults={sectionResults}
          sectionLabels={sectionLabels}
          sectionStates={completionPoll.sectionStates}
          progress={completionPoll.progress}
          stalled={completionPoll.stalled}
          onRetry={completionPoll.retry}
          onResume={() => navigate(`${base}/session/${sessionId}`)}
        />
      </div>
    );
  }

  const rawExamSet = data.exam_set;
  // Put each part's script (and TCF evidence, if the content lacks it) back for review.
  const examSet =
    rawExamSet?.listening_content?.parts && review?.parts?.length
      ? {
          ...rawExamSet,
          listening_content: {
            ...rawExamSet.listening_content,
            parts: rawExamSet.listening_content.parts.map((p, i) => {
              const r = review.parts[i];
              if (!r) return p;
              const withScript = {
                ...p,
                script: (r.script ?? undefined) as ListeningContent['parts'][number]['script'],
              };
              return r.evidence && !(p as { evidence?: string }).evidence
                ? { ...withScript, evidence: r.evidence }
                : withScript;
            }),
          },
        }
      : rawExamSet;

  // TCF practice on a slice of CO/CE items. Its 100–699 score, and the NCLC or
  // CEFR level read from it, describe a whole 39-item paper — ten right answers in
  // the B2 band came out as "210 / 699, NCLC < 4". A practice slice shows how many
  // were right instead, and the level comes from the tasks (EE/EO) alone.
  const mcqPracticeCounts: Partial<Record<string, { correct: number; total: number }>> = {};
  if (isPracticeRun && profile.examType !== 'celpip') {
    for (const sec of ['listening', 'reading'] as const) {
      if (!(takenSections as string[]).includes(sec)) continue;
      const parts =
        (sec === 'listening' ? examSet?.listening_content : examSet?.reading_content)?.parts ?? [];
      const answers = (sectionResults.find((r) => r.section_type === sec)?.answers ?? {}) as Record<
        string,
        unknown
      >;
      mcqPracticeCounts[sec] = {
        correct: parts.filter(
          (p, pi) => answers[`part_${pi}_q_0`] === p.questions?.[0]?.correct_index,
        ).length,
        total: parts.length,
      };
    }
  }
  const countedSections = Object.keys(mcqPracticeCounts);
  const levelSections = (takenSections as string[]).filter((k) => !countedSections.includes(k));

  const clbOf = (k: string): number | null =>
    sectionResults.find((r) => r.section_type === k)?.clb_score ?? null;

  const rawScores: Record<string, number | null> = Object.fromEntries(
    sectionResults.map((r) => [
      r.section_type,
      countedSections.includes(r.section_type) ? null : (r.raw_score ?? null),
    ]),
  );

  // A CEFR exam (TCF Québec / TCF IRN) stores NO band: no authority publishes an
  // NCLC equivalence for those procedures, so clb_score and m_score are NULL by
  // design. The official level is derived from the raw score here, on read. Every
  // other exam reads the band the backend stored, unchanged.
  const sectionScores: Record<string, number | null> = profile.cefrIndexFromRaw
    ? Object.fromEntries(SKILL_KEYS.map((k) => [k, profile.cefrIndexFromRaw!(k, rawScores[k])]))
    : {
        // The session row is written once, when the last section is scored.
        // Until then each section's own row already carries its score.
        listening: session.listening_score ?? clbOf('listening'),
        reading: session.reading_score ?? clbOf('reading'),
        writing: session.writing_score ?? clbOf('writing'),
        speaking: session.speaking_score ?? clbOf('speaking'),
      };
  for (const k of countedSections) sectionScores[k] = null;

  // The whole sitting: the weakest skill, as everywhere else. For a CEFR exam
  // that is the lowest level of the sections actually sat.
  const levelScores = levelSections.map((k) => sectionScores[k] ?? null);
  const overallScore = profile.cefrIndexFromRaw
    ? cefrOverallIndex(levelScores)
    : countedSections.length === 0
      ? (session.m_score ?? null)
      : levelScores.length > 0 && levelScores.every((v) => v != null)
        ? Math.min(...(levelScores as number[]))
        : null;

  // TCF Québec only: the province's own points, beside the levels and never
  // instead of them. Skills that were not sat stay blank rather than scoring 0.
  const quebecTable = profile.quebecPoints;
  const quebecRows = quebecTable
    ? SKILL_KEYS.filter((k) => levelSections.includes(k)).map((k) => ({
        skill: k,
        label: sectionLabels[k] ?? k,
        level: sectionScores[k] != null ? scale.format(sectionScores[k] as number) : null,
        points: quebecPointsFor(quebecTable, k, sectionScores[k]),
      }))
    : [];
  const quebecTotal = quebecRows.reduce((sum, r) => sum + (r.points ?? 0), 0);

  // Sections still in the scoring queue — scored by the server on its own schedule.
  const scoringSkills = sectionResults
    .filter((r) => r.status === 'scoring')
    .map((r) => r.section_type as string);

  const activeResult = sectionResults.find((r) => r.section_type === currentTab);

  // `get_results` reports the authoritative total. Summing the per-section times
  // is the fallback for sessions the backend recorded without it. 0 hides the badge.
  const totalTimeSec =
    session.total_time_sec ||
    sectionResults.reduce((sum, r) => sum + (r.time_spent_sec || 0), 0) ||
    null;

  const formattedDate = (() => {
    const raw = session.completed_at ?? session.started_at ?? session.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  })();

  return (
    // Every word of the exam content, the model's feedback and the sample answers
    // is clickable here — reviewing a result is exactly when you want to look a
    // word up. Unlike the live exam there's nothing to gate, so it's always on.
    <WordLookupProvider contentLang={profile.contentLang}>
      <div className="min-h-screen p-4 sm:p-5 md:p-6 lg:p-8 bg-background">
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-4 sm:gap-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-[13px] bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-accent" />
              </span>
              <div>
                <h1 className="text-[18px] font-bold text-foreground">
                  {t(profile.resultsTitleKey, { ns: profile.ns })}
                </h1>
                {formattedDate && (
                  <p className="text-[12px] text-muted-foreground tabular-nums">{formattedDate}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => void takeAgain()}
                loading={isStarting}
              >
                {!isStarting && <RotateCcw className="w-3.5 h-3.5" />}
                {t('takeAgain')}
              </Button>
              <Button variant="default" size="md" onClick={pickExam}>
                {t('pickExam')}
              </Button>
            </div>
          </div>

          {retakeError && (
            <div className="flex items-center gap-2 rounded-[9px] border border-error/40 bg-error/10 px-3 py-2 text-[12.5px] text-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {retakeError}
            </div>
          )}

          {scoringSkills.length > 0 && (
            <div className="flex items-start gap-2 rounded-[9px] border border-success/40 bg-success/[0.08] px-3 py-2.5 text-[12.5px] text-foreground">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-success" />
              <span>
                <span className="font-semibold">
                  {tx('scoringBannerTitle', {
                    sections: scoringSkills.map((k) => sectionLabels[k] ?? k).join(', '),
                  })}
                </span>{' '}
                {completionPoll.stalled ? tx('scoringBannerSlow') : tx('scoringBannerBody')}
              </span>
            </div>
          )}

          {/* Ended with zero submitted sections — nothing to score or review */}
          {takenSections.length === 0 ? (
            <div className="bg-card border border-border rounded-[14px] shadow-sm px-8 py-14 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-[14px] bg-muted border border-border flex items-center justify-center">
                <FileQuestion className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-[15px] font-bold text-foreground">{t('emptyResultTitle')}</p>
              <p className="text-[12.5px] text-muted-foreground max-w-md leading-relaxed">
                {t('emptyResultMessage')}
              </p>
              <Button
                variant="default"
                size="md"
                onClick={() => void takeAgain()}
                loading={isStarting}
                className="mt-2"
              >
                {!isStarting && <RotateCcw className="w-3.5 h-3.5" />}
                {t('takeAgain')}
              </Button>
            </div>
          ) : (
            <>
              {/* Tab strip: Overview | taken skills | Vocabulary */}
              <div className="bg-card border border-border rounded-[14px] shadow-sm">
                <div className="flex border-b border-border overflow-x-auto px-2">
                  <button
                    onClick={() => setTab('overview')}
                    className={`inline-flex items-center gap-2 px-3 py-3 -mb-px border-b-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                      currentTab === 'overview'
                        ? 'text-foreground border-foreground'
                        : 'text-muted-foreground border-transparent hover:text-foreground'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {t('overviewTab')}
                  </button>
                  {(takenSections as string[]).map((sectionType) => {
                    const meta = SECTION_META[sectionType as (typeof SKILL_KEYS)[number]];
                    const isActive = currentTab === sectionType;
                    const Icon = meta.icon;
                    const insightState = insightEnabled
                      ? staged.skillState(sectionType as InsightSkill)
                      : 'unavailable';
                    return (
                      <button
                        key={sectionType}
                        onClick={() => setTab(sectionType)}
                        className={`inline-flex items-center gap-2 px-3 py-3 -mb-px border-b-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                          isActive
                            ? `${meta.color} border-current`
                            : 'text-muted-foreground border-transparent hover:text-foreground'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {sectionLabels[sectionType] ?? sectionType}
                        {/* Insight readiness indicator */}
                        {insightState === 'generating' || insightState === 'pending' ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : insightState === 'ready' ? (
                          <Sparkles className={`w-3 h-3 ${meta.color}`} />
                        ) : insightState === 'error' ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-error" />
                        ) : null}
                      </button>
                    );
                  })}
                  {vocabEnabled && (
                    <button
                      onClick={() => setTab('vocabulary')}
                      className={`inline-flex items-center gap-2 px-3 py-3 -mb-px border-b-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                        currentTab === 'vocabulary'
                          ? 'text-accent border-accent'
                          : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      {t('results.vocabulary.tabLabel')}
                    </button>
                  )}
                </div>
              </div>

              {/* Panel */}
              {currentTab === 'overview' && (
                <ScoringUpdateNotice
                  examType={profile.examType}
                  onHowScored={() => setScoringInfoOpen(true)}
                />
              )}
              {currentTab === 'overview' && (
                <OverviewTab
                  mScore={overallScore}
                  mScoreAvg={profile.cefrIndexFromRaw ? null : averages.m_score}
                  totalTimeSec={totalTimeSec}
                  levelLabel={
                    overallScore == null
                      ? null // a practice slice with only CO/CE shows its count in the ring
                      : profile.cefrIndexFromRaw
                        ? // No immigration wording: a CEFR level is a level, and what
                          // it unlocks differs per procedure.
                          `${scale.bandLabel} ${scale.format(overallScore)}`
                        : isPracticeRun && profile.examType !== 'celpip'
                          ? null
                          : `${scale.bandLabel} ${scale.format(overallScore)} — ${clbToLevel(overallScore, t)}`
                  }
                  takenSections={takenSections}
                  sectionScores={sectionScores}
                  sectionAvgs={averages}
                  sectionLabels={sectionLabels}
                  onOpenSkill={setTab}
                  insight={staged.insight}
                  insightOrigin={staged.origin}
                  summaryState={staged.skillState('summary')}
                  progress={staged.progress}
                  limitReached={staged.limitReached}
                  erroredSkills={erroredSkills}
                  onRetryFailed={() => {
                    erroredSkills.forEach((k) => staged.retry(k));
                    staged.retry('summary');
                  }}
                  onRetrySummary={() => staged.retry('summary')}
                  insightWait={{
                    startedAt: staged.startedAt,
                    stopped: staged.stopped,
                    onCancel: staged.cancel,
                  }}
                  vsAvgT={vsAvgT}
                  scale={scale}
                  rawScores={rawScores}
                  correctCounts={mcqPracticeCounts}
                  correctLabel={tx('results.correct')}
                  insightEnabled={insightEnabled}
                  note={profile.estimateNoteKey ? tx(profile.estimateNoteKey) : undefined}
                  overallLabel={
                    isPracticeRun && profile.examType !== 'celpip'
                      ? tx('practiceScoreLabel')
                      : tx(profile.overallLabelKey, { defaultValue: t('mScoreLabel') })
                  }
                  pendingSkills={scoringSkills}
                  onScoringInfo={() => setScoringInfoOpen(true)}
                  scoringInfoLabel={tx('scoringInfo.open')}
                  quebecPoints={
                    quebecTable && quebecRows.length > 0 ? (
                      <QuebecPointsCard
                        rows={quebecRows}
                        total={quebecTotal}
                        max={quebecTable.max}
                        source={tx(quebecTable.sourceKey)}
                      />
                    ) : undefined
                  }
                  nextSteps={
                    data.tcf_explanations || data.tcf_model_answers ? (
                      <TcfNextSteps
                        takenSections={takenSections}
                        pendingSkills={scoringSkills}
                        sectionLabels={sectionLabels}
                        sectionResults={sectionResults}
                        listeningContent={
                          examSet?.listening_content as ListeningContent | null | undefined
                        }
                        readingContent={
                          examSet?.reading_content as ReadingContent | null | undefined
                        }
                        explanations={data.tcf_explanations}
                        modelAnswers={data.tcf_model_answers}
                        speakingTasks={data.speaking_tasks}
                        taskLabel={t('task')}
                        scale={scale}
                        onOpenSkill={setTab}
                        access={data.tcf_access}
                      />
                    ) : data.celpip_model_answers ? (
                      <TcfNextSteps
                        exam="celpip"
                        takenSections={takenSections}
                        pendingSkills={scoringSkills}
                        sectionLabels={sectionLabels}
                        sectionResults={sectionResults}
                        listeningContent={
                          examSet?.listening_content as ListeningContent | null | undefined
                        }
                        readingContent={
                          examSet?.reading_content as ReadingContent | null | undefined
                        }
                        explanations={data.celpip_explanations}
                        modelAnswers={data.celpip_model_answers}
                        speakingTasks={data.speaking_tasks}
                        taskLabel={t('task')}
                        scale={scale}
                        onOpenSkill={setTab}
                        access={data.celpip_access}
                      />
                    ) : undefined
                  }
                />
              )}
              <ScoringInfoDialog
                profile={profile}
                open={scoringInfoOpen}
                onOpenChange={setScoringInfoOpen}
              />

              {activeResult && SKILL_KEYS.includes(currentTab as (typeof SKILL_KEYS)[number]) && (
                <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 sm:p-6">
                  <SkillTab
                    skill={currentTab as (typeof SKILL_KEYS)[number]}
                    label={sectionLabels[currentTab] ?? currentTab}
                    score={sectionScores[currentTab]}
                    avg={
                      profile.cefrIndexFromRaw
                        ? null
                        : (averages[currentTab as keyof typeof averages] ?? null)
                    }
                    scale={scale}
                    slice={countedSections.includes(currentTab)}
                    pending={scoringSkills.includes(currentTab)}
                    insightEnabled={insightEnabled}
                    sessionId={sessionId}
                    insightOrigin={staged.origin}
                    speakingTasks={data.speaking_tasks}
                    mediaLocked={data.speaking_media_locked}
                    modelAnswers={data.speaking_model_answers}
                    tcfExplanations={data.tcf_explanations}
                    tcfModelAnswers={data.tcf_model_answers}
                    tcfAccess={data.tcf_access}
                    celpipModelAnswers={data.celpip_model_answers}
                    celpipExplanations={data.celpip_explanations}
                    listeningAudio={data.listening_audio}
                    reviewLocked={Boolean(
                      currentTab === 'listening'
                        ? data.review_locked?.listening ||
                            data.tcf_access?.listening_audio_locked ||
                            review?.locked
                        : currentTab === 'reading'
                          ? data.review_locked?.reading
                          : false,
                    )}
                    result={activeResult}
                    mcqContent={
                      currentTab === 'listening'
                        ? (examSet?.listening_content as ListeningContent | null)
                        : currentTab === 'reading'
                          ? (examSet?.reading_content as ReadingContent | null)
                          : null
                    }
                    insightState={staged.skillState(currentTab as InsightSkill)}
                    insight={staged.insight}
                    onRetryInsight={() => staged.retry(currentTab as InsightSkill)}
                    insightWait={{
                      startedAt: staged.runningSkill === currentTab ? staged.startedAt : null,
                      stopKind: staged.stopKind(currentTab as InsightSkill),
                      onCancel: staged.cancel,
                    }}
                    yourAnswerLabel={t('results.yourAnswer')}
                    taskLabel={t('task')}
                    vsAvgT={vsAvgT}
                  />
                </div>
              )}

              {currentTab === 'vocabulary' && vocabEnabled && (
                <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 sm:p-6">
                  <VocabularyTab sessionId={sessionId} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {justScored && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto inline-flex h-11 items-center gap-2.5 rounded-full bg-primary pe-2 ps-4 text-[13px] font-semibold text-primary-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {tx('scoreReadyNotice', { section: sectionLabels[justScored] ?? justScored })}
            {currentTab !== justScored ? (
              <button
                type="button"
                onClick={() => {
                  setTab(justScored);
                  setJustScored(null);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-white/15 px-3 hover:bg-white/25"
              >
                {tx('scoreReadyView')}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            ) : (
              <span className="w-2" />
            )}
          </div>
        </div>
      )}
    </WordLookupProvider>
  );
}
