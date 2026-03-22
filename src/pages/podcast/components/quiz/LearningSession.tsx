import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Brain,
  Loader2,
  AlertCircle,
  Clock,
  RotateCcw,
  BookOpen,
  GraduationCap,
  Award,
} from 'lucide-react';
import { supabaseCall } from '@/lib/supabase';
import { QuizContainer } from './QuizContainer';
import { SessionSummary } from './SessionSummary';
import type {
  LearningModeType,
  QuizQuestion,
  SessionProgress,
  SessionSummary as SessionSummaryType,
  MilestoneProgress,
  CreateSessionResponse,
  SubmitAnswerResponse,
  CompleteSessionResponse,
  ActiveSessionResponse,
} from './types';

type SessionPhase = 'setup' | 'quiz' | 'summary';

interface LearningSessionProps {
  contentId: string;
  contentTitle?: string;
  onClose: () => void;
}

const MODE_OPTIONS: {
  id: LearningModeType;
  name: string;
  description: string;
  icon: typeof BookOpen;
  cefrRange: string;
}[] = [
  {
    id: 'general',
    name: 'General English',
    description: 'Practice vocabulary, grammar, and comprehension',
    icon: BookOpen,
    cefrRange: 'A1 - C2',
  },
  {
    id: 'ielts',
    name: 'IELTS Prep',
    description: 'Academic English for IELTS exam',
    icon: GraduationCap,
    cefrRange: 'B1 - C2',
  },
  {
    id: 'celpip',
    name: 'CELPIP Prep',
    description: 'Canadian English proficiency test',
    icon: Award,
    cefrRange: 'B1 - C1',
  },
];

export function LearningSession({ contentId, contentTitle, onClose }: LearningSessionProps) {
  const [phase, setPhase] = useState<SessionPhase>('setup');
  const [selectedMode, setSelectedMode] = useState<LearningModeType>('general');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [summary, setSummary] = useState<SessionSummaryType | null>(null);
  const [milestoneProgress, setMilestoneProgress] = useState<MilestoneProgress | null>(null);
  const [xpInfo, setXpInfo] = useState<{ earned: number; total: number; level: number } | null>(
    null,
  );
  const [streakInfo, setStreakInfo] = useState<{
    currentStreak: number;
    longestStreak: number;
  } | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Resume state
  const [isCheckingActive, setIsCheckingActive] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [activeSessionData, setActiveSessionData] = useState<ActiveSessionResponse | null>(null);

  const [limitInfo, setLimitInfo] = useState<{
    limitType: 'daily' | 'monthly';
    resetsAt: string;
  } | null>(null);

  const [progress, setProgress] = useState<SessionProgress>({
    vocabulary_reviewed: 0,
    vocabulary_total: 0,
    questions_answered: 0,
    questions_total: 0,
    questions_correct: 0,
    current_score_percent: 0,
  });

  // Check for active session on mount
  useEffect(() => {
    const checkActive = async () => {
      try {
        const data = await supabaseCall<ActiveSessionResponse>(
          'GET',
          `/learning-session/active?content_id=${encodeURIComponent(contentId)}`,
        );
        setActiveSessionData(data);
        if (data.has_active && data.session) {
          setShowResumePrompt(true);
        }
      } catch {
        // No active session
      } finally {
        setIsCheckingActive(false);
      }
    };

    checkActive();
  }, [contentId]);

  const handleResumeSession = useCallback(() => {
    if (!activeSessionData?.session) return;
    const s = activeSessionData.session;
    setSessionId(s.id);
    setQuestions(s.quiz_questions || []);
    setProgress({
      vocabulary_reviewed: 0,
      vocabulary_total: 0,
      questions_answered: s.questions_answered,
      questions_total: s.total_questions,
      questions_correct: s.questions_correct,
      current_score_percent:
        s.questions_answered > 0
          ? Math.round((s.questions_correct / s.questions_answered) * 100)
          : 0,
    });
    setShowResumePrompt(false);
    setPhase('quiz');
  }, [activeSessionData]);

  const handleAbandonAndStartNew = useCallback(async () => {
    if (activeSessionData?.session?.id) {
      try {
        await supabaseCall('POST', `/learning-session/${activeSessionData.session.id}/abandon`);
      } catch {
        // Ignore
      }
    }
    setShowResumePrompt(false);
  }, [activeSessionData]);

  const handleStartSession = useCallback(async () => {
    setIsCreating(true);
    setSessionError(null);
    try {
      const result = await supabaseCall<CreateSessionResponse>('POST', '/learning-session', {
        content_type: 'podcast',
        content_id: contentId,
        content_title: contentTitle,
        learning_mode: selectedMode,
      });

      setSessionId(result.session_id);
      setQuestions(result.quiz_questions || []);
      setProgress({
        vocabulary_reviewed: 0,
        vocabulary_total: 0,
        questions_answered: 0,
        questions_total: (result.quiz_questions || []).length,
        questions_correct: 0,
        current_score_percent: 0,
      });
      setPhase('quiz');
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('DAILY_LIMIT_REACHED') || errMsg.includes('QUIZ_LIMIT_REACHED')) {
        setLimitInfo({ limitType: 'daily', resetsAt: '' });
      } else if (
        errMsg.includes('401') ||
        errMsg.includes('authorization') ||
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('Network')
      ) {
        setSessionError(
          'This feature requires an internet connection and a FlexiLingo account.',
        );
      } else {
        setSessionError(errMsg || 'Failed to start session. The content may not be analyzed yet.');
      }
    } finally {
      setIsCreating(false);
    }
  }, [contentId, contentTitle, selectedMode]);

  const handleSubmitAnswer = useCallback(
    async (questionId: string, answer: string, timeSpentMs: number, hintUsed: boolean) => {
      if (!sessionId) return { is_correct: false };

      try {
        const result = await supabaseCall<SubmitAnswerResponse>(
          'POST',
          `/learning-session/${sessionId}/answer`,
          {
            question_id: questionId,
            user_answer: answer,
            time_spent_ms: timeSpentMs,
            hint_used: hintUsed,
          },
        );

        // Update progress from response
        if (result.session_progress) {
          setProgress((prev) => ({
            ...prev,
            questions_answered: result.session_progress.questions_answered,
            questions_total: result.session_progress.questions_total,
            questions_correct: result.session_progress.questions_correct,
            current_score_percent:
              result.session_progress.questions_answered > 0
                ? Math.round(
                    (result.session_progress.questions_correct /
                      result.session_progress.questions_answered) *
                      100,
                  )
                : 0,
          }));
        }

        return { is_correct: result.is_correct };
      } catch (error) {
        console.error('Failed to submit answer:', error);
        return { is_correct: false };
      }
    },
    [sessionId],
  );

  const handleQuizComplete = useCallback(async () => {
    if (!sessionId) return;
    setIsCompleting(true);

    try {
      const result = await supabaseCall<CompleteSessionResponse>(
        'POST',
        `/learning-session/${sessionId}/complete`,
      );
      setSummary(result.session_summary);
      setMilestoneProgress(result.milestone_progress || null);
      setXpInfo(result.xp || null);
      setStreakInfo(result.streak || null);
      setPhase('summary');
    } catch (error) {
      console.error('Failed to complete session:', error);
    } finally {
      setIsCompleting(false);
    }
  }, [sessionId]);

  const handleStartNew = useCallback(() => {
    setPhase('setup');
    setSessionId(null);
    setQuestions([]);
    setSummary(null);
    setMilestoneProgress(null);
    setXpInfo(null);
    setStreakInfo(null);
    setSessionError(null);
    setLimitInfo(null);
  }, []);

  // Loading active session check
  if (isCheckingActive) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Resume prompt
  if (showResumePrompt && activeSessionData?.session) {
    const s = activeSessionData.session;
    const scorePct =
      s.questions_answered > 0 ? Math.round((s.questions_correct / s.questions_answered) * 100) : 0;

    return (
      <div className="space-y-6 text-center max-w-md mx-auto p-8">
        <div className="p-3 rounded-full bg-primary/10 w-fit mx-auto">
          <RotateCcw className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">Resume Previous Quiz?</h2>
          <p className="text-muted-foreground">
            You have an active session with{' '}
            <span className="font-semibold">{s.questions_answered}</span> of{' '}
            <span className="font-semibold">{s.total_questions}</span> questions answered
          </p>
          {s.questions_answered > 0 && (
            <p className="text-sm text-muted-foreground mt-1">Score so far: {scorePct}%</p>
          )}
        </div>
        <div className="flex gap-3 max-w-sm mx-auto">
          <Button onClick={handleResumeSession} className="flex-1" size="lg">
            <RotateCcw className="h-4 w-4 mr-2" />
            Resume Quiz
          </Button>
          <Button onClick={handleAbandonAndStartNew} variant="outline" className="flex-1" size="lg">
            Start New
          </Button>
        </div>
      </div>
    );
  }

  // Setup phase
  if (phase === 'setup') {
    return (
      <div className="space-y-6 max-w-2xl mx-auto p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Start a Learning Session</h2>
          <p className="text-muted-foreground">{contentTitle || 'Selected content'}</p>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODE_OPTIONS.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                onClick={() => !isCreating && setSelectedMode(mode.id)}
                disabled={isCreating}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all',
                  selectedMode === mode.id
                    ? 'ring-2 ring-primary border-primary'
                    : 'border-border hover:border-primary/50',
                  isCreating && 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{mode.name}</div>
                    <span className="text-xs text-muted-foreground">{mode.cefrRange}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{mode.description}</p>
              </button>
            );
          })}
        </div>

        {limitInfo && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/30">
            <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                Daily Limit Reached
              </h4>
              <p className="text-sm text-amber-600 dark:text-amber-300/80">
                You&apos;ve used all your quiz sessions for today. Come back tomorrow!
              </p>
            </div>
          </div>
        )}

        {!limitInfo && sessionError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span>{sessionError}</span>
          </div>
        )}

        <Button
          onClick={handleStartSession}
          disabled={isCreating || !!limitInfo}
          className="w-full"
          size="lg"
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Preparing session...
            </>
          ) : (
            <>
              <Brain className="h-4 w-4 mr-2" />
              Start Learning
            </>
          )}
        </Button>
      </div>
    );
  }

  // Quiz phase
  if (phase === 'quiz') {
    return (
      <div className="space-y-4 max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Quiz
          </h2>
        </div>

        {questions.length === 0 ? (
          <div className="flex items-center justify-center p-8 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/30">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-amber-600 mx-auto mb-2" />
              <p className="text-amber-800 dark:text-amber-400 font-medium">
                No questions available
              </p>
              <p className="text-amber-600 dark:text-amber-300 text-sm mt-1">
                The content may not have quiz data yet.
              </p>
            </div>
          </div>
        ) : (
          <QuizContainer
            questions={questions}
            onSubmitAnswer={handleSubmitAnswer}
            onComplete={handleQuizComplete}
            progress={progress}
            immediateFeedback
            initialQuestionIndex={activeSessionData?.resume_at_question_index || 0}
            initialAnsweredIds={activeSessionData?.answered_question_ids || []}
            initialAnswerResults={
              activeSessionData?.session?.answers?.map((a) => ({
                question_id: a.question_id,
                is_correct: a.is_correct,
              })) || []
            }
          />
        )}

        {isCompleting && (
          <div className="flex items-center justify-center gap-2 p-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Calculating results...</span>
          </div>
        )}
      </div>
    );
  }

  // Summary phase
  if (phase === 'summary' && summary) {
    return (
      <div className="p-4 overflow-y-auto max-h-full">
        <SessionSummary
          summary={summary}
          milestoneProgress={milestoneProgress}
          xpInfo={xpInfo}
          streakInfo={streakInfo}
          onStartNew={handleStartNew}
          onGoHome={onClose}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
