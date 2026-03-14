import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Pause,
  Play,
  Send,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useExamStore } from '../stores/examStore';
import { EXAM_TYPE_LABELS, QUESTION_TYPE_LABELS, formatExamElapsed } from '../types';

export function ExamView() {
  const {
    activeSession,
    questions,
    currentQuestionIndex,
    setCurrentQuestion,
    answerQuestion,
    startExam,
    pauseExam,
    completeExam,
    updateElapsed,
    goBack,
  } = useExamStore();

  const [answer, setAnswer] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const elapsedRef = useRef(activeSession?.elapsedSeconds ?? 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartRef = useRef(Date.now());

  const currentQuestion = questions[currentQuestionIndex];
  const isActive = activeSession?.status === 'in_progress';
  const options: string[] = currentQuestion ? JSON.parse(currentQuestion.optionsJson || '[]') : [];

  // Timer
  useEffect(() => {
    if (!activeSession || !isActive) return;
    elapsedRef.current = activeSession.elapsedSeconds;

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      if (elapsedRef.current % 30 === 0) {
        updateElapsed(elapsedRef.current);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      updateElapsed(elapsedRef.current);
    };
  }, [activeSession?.id, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset answer when question changes
  useEffect(() => {
    setAnswer(currentQuestion?.userAnswer ?? '');
    questionStartRef.current = Date.now();
  }, [currentQuestionIndex, currentQuestion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeSession) return null;

  const timeExpired = activeSession.timeLimitMin
    ? elapsedRef.current >= activeSession.timeLimitMin * 60
    : false;

  const answeredCount = questions.filter((q) => q.userAnswer != null).length;

  const handleAnswer = async () => {
    if (!currentQuestion || !answer.trim()) return;
    setIsAnswering(true);
    const timeSpent = Math.floor((Date.now() - questionStartRef.current) / 1000);
    await answerQuestion(currentQuestion.id, answer.trim(), timeSpent);
    setIsAnswering(false);

    // Auto-advance to next unanswered
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestion(currentQuestionIndex + 1);
    }
  };

  const handleComplete = async () => {
    // Calculate score from answered questions
    const scored = questions.filter((q) => q.score != null);
    const totalScore = scored.reduce((sum, q) => sum + (q.score ?? 0), 0);
    const maxScore = scored.reduce((sum, q) => sum + q.maxScore, 0);
    const overall = maxScore > 0 ? (totalScore / maxScore) * 100 : undefined;

    await completeExam({ elapsed: elapsedRef.current, overallScore: overall });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <CardTitle className="truncate">{activeSession.title}</CardTitle>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <Badge variant="secondary" className="text-xs">
                  {EXAM_TYPE_LABELS[activeSession.examType]}
                </Badge>
                <span>
                  {answeredCount}/{questions.length} answered
                </span>
              </div>
            </div>

            <div
              className={`flex items-center gap-1.5 text-sm ${timeExpired ? 'text-error' : 'text-muted-foreground'}`}
            >
              <Clock className="h-4 w-4" />
              <span className="font-mono tabular-nums">
                {formatExamElapsed(elapsedRef.current)}
              </span>
              {activeSession.timeLimitMin && <span>/ {activeSession.timeLimitMin}m</span>}
            </div>

            <div className="flex gap-2">
              {activeSession.status === 'not_started' && (
                <Button size="sm" onClick={startExam}>
                  <Play className="h-4 w-4" />
                  Start
                </Button>
              )}
              {isActive && (
                <>
                  <Button variant="outline" size="sm" onClick={() => pauseExam(elapsedRef.current)}>
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                  <Button size="sm" onClick={handleComplete}>
                    <Send className="h-4 w-4" />
                    Finish
                  </Button>
                </>
              )}
              {activeSession.status === 'paused' && (
                <Button size="sm" onClick={startExam}>
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Time expired warning */}
      {timeExpired && (
        <div className="flex items-center gap-2 rounded-lg border border-[#C58C6E]/30 bg-[#C58C6E]/5 px-4 py-2">
          <AlertCircle className="h-4 w-4 text-[#C58C6E]" />
          <p className="text-sm text-[#C58C6E]">Time limit reached. Submit your exam.</p>
        </div>
      )}

      {/* Question navigation */}
      {questions.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrentQuestion(i)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-medium transition-colors
                ${i === currentQuestionIndex ? 'bg-primary text-primary-foreground' : ''}
                ${q.userAnswer != null && i !== currentQuestionIndex ? 'bg-[#8BB7A3]/20 text-[#8BB7A3]' : ''}
                ${q.userAnswer == null && i !== currentQuestionIndex ? 'bg-muted text-muted-foreground hover:bg-muted/80' : ''}
              `}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Current question */}
      {currentQuestion && isActive && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Q{currentQuestionIndex + 1}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {QUESTION_TYPE_LABELS[currentQuestion.questionType]}
                </Badge>
              </div>
              {currentQuestion.userAnswer != null && (
                <CheckCircle2 className="h-4 w-4 text-[#8BB7A3]" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Context */}
            {currentQuestion.contextText && (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {currentQuestion.contextText}
                </p>
              </div>
            )}

            {/* Prompt */}
            <p className="text-sm font-medium text-foreground">{currentQuestion.prompt}</p>

            {/* Answer input based on question type */}
            {options.length > 0 ? (
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setAnswer(opt)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors
                      ${answer === opt ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:bg-muted/50 text-foreground'}
                    `}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>
            ) : currentQuestion.questionType === 'essay' ? (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Write your answer..."
                className="min-h-[200px] w-full rounded-lg border border-border bg-background p-4 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            ) : (
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleAnswer()}
              />
            )}

            {/* Navigation & submit */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentQuestion(Math.max(0, currentQuestionIndex - 1))}
                disabled={currentQuestionIndex === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>

              <Button size="sm" onClick={handleAnswer} disabled={!answer.trim() || isAnswering}>
                {isAnswering ? 'Saving...' : 'Submit Answer'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentQuestion(Math.min(questions.length - 1, currentQuestionIndex + 1))
                }
                disabled={currentQuestionIndex >= questions.length - 1}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No questions yet */}
      {questions.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No questions loaded. Add questions to begin the exam.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
