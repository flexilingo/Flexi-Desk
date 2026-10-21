import { useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCelpipStore, isRankedSession } from '../stores/celpipStore';
import { useSubscriptionStore, isPaidTier } from '@/stores/subscriptionStore';
import { cloudInsightProvider, localInsightProvider } from '../hooks/insightProviders';
import { useStagedInsight } from '../hooks/useStagedInsight';
import { clbToLevel, SECTION_META, meanOf } from '../results/shared';
import { WordLookupProvider } from './session/WordLookup';
import { OverviewTab } from '../results/OverviewTab';
import { SkillTab } from '../results/SkillTab';
import { VocabularyTab } from '../results/VocabularyTab';
import type { InsightSkill, ListeningContent, ReadingContent, SectionResult } from '../types';

const SKILL_KEYS = ['listening', 'reading', 'writing', 'speaking'] as const;

interface CelpipResultsPageProps {
  /** Session to show. Falls back to the `:sessionId` route param when omitted. */
  sessionId?: string;
  /** Navigation hooks owned by the shell that mounts this page. */
  onTakeAgain?: () => void;
  onPickExam?: () => void;
}

export function CelpipResultsPage({
  sessionId: propSessionId,
  onTakeAgain,
  onPickExam,
}: CelpipResultsPageProps) {
  const { t, i18n } = useTranslation('celpip');
  const navigate = useNavigate();
  const params = useParams<{ sessionId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const sessionId = propSessionId ?? params.sessionId ?? '';

  // Default navigation targets the exam home; the shell can override via props.
  // The legacy `/exam` module is gone; CELPIP owns this surface now.
  const takeAgain = onTakeAgain ?? (() => navigate('/celpip'));
  const pickExam = onPickExam ?? (() => navigate('/celpip'));

  const rawResults = useCelpipStore((s) => s.results);
  const isResultsLoading = useCelpipStore((s) => s.isResultsLoading);
  const fetchResults = useCelpipStore((s) => s.fetchResults);
  const sessions = useCelpipStore((s) => s.sessions);
  const fetchSessions = useCelpipStore((s) => s.fetchSessions);

  const subscription = useSubscriptionStore((s) => s.subscription);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);

  useEffect(() => {
    if (sessionId) fetchResults(sessionId);
  }, [sessionId, fetchResults]);
  useEffect(() => {
    fetchSessions('celpip');
  }, [fetchSessions]);
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // The store's `results` is shared; ignore it until it matches this session so a
  // prior session's data never flashes here.
  const data = rawResults?.session?.id === sessionId ? rawResults : null;

  const session = data?.session;
  const sectionResults = (data?.section_results ?? []) as SectionResult[];
  const takenSections = sectionResults.map((r) => r.section_type);

  const activeTab = searchParams.get('tab') || 'overview';
  // A ?tab= pointing at a section that wasn't taken falls back to overview.
  const currentTab =
    activeTab === 'overview' ||
    activeTab === 'vocabulary' ||
    (takenSections as string[]).includes(activeTab)
      ? activeTab
      : 'overview';

  const setTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  // Pro users get FlexiLingo's insight; everyone else gets the on-device model's.
  // There is no Pro gate on generation — only the source differs.
  const isPaid = isPaidTier(subscription?.tier);
  const provider = useMemo(() => {
    // localInsightProvider reads `results` at construction, so only build it once
    // the matching results are in; until then a (never-called) cloud provider is
    // a safe placeholder because `enabled` stays false.
    if (isPaid || !data) return cloudInsightProvider(sessionId);
    return localInsightProvider(sessionId, data);
  }, [isPaid, sessionId, data]);

  const enabled = Boolean(data && session?.status === 'completed' && takenSections.length > 0);
  const staged = useStagedInsight(provider, enabled, currentTab);

  const sectionLabels: Record<string, string> = {
    listening: t('listening'),
    reading: t('reading'),
    writing: t('writing'),
    speaking: t('speaking'),
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
    (k) => (takenSections as string[]).includes(k) && staged.skillState(k) === 'error',
  );

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

  if (session.status !== 'completed') {
    return (
      <div className="min-h-screen p-6 md:p-8 flex items-center justify-center bg-background">
        <div className="bg-card border border-border rounded-[16px] shadow-sm py-12 px-8 text-center max-w-md w-full">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
          <h2 className="text-[15px] font-bold text-foreground mb-2">{t('scoringInProgress')}</h2>
          <p className="text-[12.5px] text-muted-foreground mb-4 leading-relaxed">
            {t('scoringMessage')}
          </p>
          <Button variant="outline" size="md" onClick={() => fetchResults(sessionId)}>
            {t('checkResults')}
          </Button>
        </div>
      </div>
    );
  }

  const sectionScores: Record<string, number | null> = {
    listening: session.listening_score ?? null,
    reading: session.reading_score ?? null,
    writing: session.writing_score ?? null,
    speaking: session.speaking_score ?? null,
  };

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

  const examSet = data.exam_set;

  return (
    // Every word of the exam content, the model's feedback and the sample answers
    // is clickable here — reviewing a result is exactly when you want to look a
    // word up. Unlike the live exam there's nothing to gate, so it's always on.
    <WordLookupProvider enabled>
      <div className="min-h-screen p-4 sm:p-5 md:p-6 lg:p-8 bg-background">
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-4 sm:gap-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-[13px] bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-accent" />
              </span>
              <div>
                <h1 className="text-[18px] font-bold text-foreground">{t('results.title')}</h1>
                {formattedDate && (
                  <p className="text-[12px] text-muted-foreground tabular-nums">{formattedDate}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="md" onClick={takeAgain}>
                <RotateCcw className="w-3.5 h-3.5" />
                {t('takeAgain')}
              </Button>
              <Button variant="default" size="md" onClick={pickExam}>
                {t('pickExam')}
              </Button>
            </div>
          </div>

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
              <Button variant="default" size="md" onClick={takeAgain} className="mt-2">
                <RotateCcw className="w-3.5 h-3.5" />
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
                    const insightState = staged.skillState(sectionType as InsightSkill);
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
                </div>
              </div>

              {/* Panel */}
              {currentTab === 'overview' && (
                <OverviewTab
                  mScore={session.m_score ?? null}
                  mScoreAvg={averages.m_score}
                  totalTimeSec={totalTimeSec}
                  levelLabel={
                    session.m_score != null
                      ? `CLB ${session.m_score} — ${clbToLevel(session.m_score, t)}`
                      : null
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
                  vsAvgT={vsAvgT}
                />
              )}

              {activeResult && SKILL_KEYS.includes(currentTab as (typeof SKILL_KEYS)[number]) && (
                <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 sm:p-6">
                  <SkillTab
                    skill={currentTab as (typeof SKILL_KEYS)[number]}
                    label={sectionLabels[currentTab] ?? currentTab}
                    score={sectionScores[currentTab]}
                    avg={averages[currentTab as keyof typeof averages] ?? null}
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
                    insightOrigin={staged.origin}
                    onRetryInsight={() => staged.retry(currentTab as InsightSkill)}
                    yourAnswerLabel={t('results.yourAnswer')}
                    taskLabel={t('task')}
                    vsAvgT={vsAvgT}
                  />
                </div>
              )}

              {currentTab === 'vocabulary' && (
                <div className="bg-card border border-border rounded-[14px] shadow-sm p-5 sm:p-6">
                  <VocabularyTab sessionId={sessionId} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </WordLookupProvider>
  );
}
