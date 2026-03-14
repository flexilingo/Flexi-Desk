import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { FillBlankQuestion, MCQQuestion, WordOrderQuestion, MatchingQuestion } from './questions';
import type { QuizQuestion, SessionProgress } from './types';

interface QuizContainerProps {
  questions: QuizQuestion[];
  onSubmitAnswer: (
    questionId: string,
    answer: string,
    timeSpentMs: number,
    hintUsed: boolean,
  ) => Promise<{ is_correct: boolean }>;
  onComplete: () => void;
  progress: SessionProgress;
  immediateFeedback?: boolean;
  initialQuestionIndex?: number;
  initialAnsweredIds?: string[];
  initialAnswerResults?: Array<{ question_id: string; is_correct: boolean }>;
}

interface QuestionState {
  answered: boolean;
  isCorrect?: boolean;
  userAnswer?: string;
}

export function QuizContainer({
  questions,
  onSubmitAnswer,
  onComplete,
  progress,
  immediateFeedback = true,
  initialQuestionIndex = 0,
  initialAnsweredIds = [],
  initialAnswerResults = [],
}: QuizContainerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialQuestionIndex);
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>(() => {
    const states: Record<string, QuestionState> = {};
    if (initialAnswerResults.length > 0) {
      for (const ans of initialAnswerResults) {
        states[ans.question_id] = { answered: true, isCorrect: ans.is_correct };
      }
    } else {
      for (const id of initialAnsweredIds) {
        states[id] = { answered: true, isCorrect: true };
      }
    }
    return states;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQuestion = questions[currentIndex];
  const currentState = currentQuestion ? questionStates[currentQuestion.id] : null;
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleAnswer = useCallback(
    async (answer: string, timeSpentMs: number, hintUsed: boolean) => {
      if (!currentQuestion || isSubmitting) return;
      setIsSubmitting(true);

      try {
        const result = await onSubmitAnswer(currentQuestion.id, answer, timeSpentMs, hintUsed);

        setQuestionStates((prev) => ({
          ...prev,
          [currentQuestion.id]: {
            answered: true,
            isCorrect: result.is_correct,
            userAnswer: answer,
          },
        }));

        if (!immediateFeedback) {
          if (isLastQuestion) {
            onComplete();
          } else {
            setCurrentIndex((prev) => prev + 1);
          }
        }
      } catch (error) {
        console.error('Failed to submit answer:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [currentQuestion, isSubmitting, onSubmitAnswer, immediateFeedback, isLastQuestion, onComplete],
  );

  const handleNext = useCallback(() => {
    if (isLastQuestion) {
      onComplete();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [isLastQuestion, onComplete]);

  const renderQuestion = () => {
    if (!currentQuestion) return null;

    const commonProps = {
      question: currentQuestion,
      onAnswer: handleAnswer,
      showFeedback: immediateFeedback && currentState?.answered,
      isCorrect: currentState?.isCorrect,
      disabled: isSubmitting || (immediateFeedback && currentState?.answered),
    };

    switch (currentQuestion.type) {
      case 'fill_blank':
        return <FillBlankQuestion {...commonProps} />;
      case 'mcq_meaning':
      case 'mcq_grammar':
      case 'mcq_synonym':
        return <MCQQuestion {...commonProps} />;
      case 'word_order':
        return <WordOrderQuestion {...commonProps} />;
      case 'matching':
        return <MatchingQuestion {...commonProps} />;
      default:
        return <MCQQuestion {...commonProps} />;
    }
  };

  const progressPercent =
    questions.length > 0
      ? ((currentIndex + (currentState?.answered ? 1 : 0)) / questions.length) * 100
      : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="font-medium text-primary">
            {progress.current_score_percent}% correct
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question dots */}
      <div className="flex gap-1 justify-center flex-wrap">
        {questions.map((q, index) => {
          const state = questionStates[q.id];
          return (
            <div
              key={q.id}
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-all',
                index === currentIndex
                  ? 'bg-primary scale-125'
                  : state?.answered
                    ? state.isCorrect
                      ? 'bg-green-500'
                      : 'bg-red-500'
                    : 'bg-muted-foreground/30',
              )}
            />
          );
        })}
      </div>

      {/* Current question */}
      <div key={currentQuestion?.id}>{renderQuestion()}</div>

      {/* Next button */}
      {immediateFeedback && currentState?.answered && (
        <div className="flex justify-end">
          <Button onClick={handleNext} className="min-w-[120px]">
            {isLastQuestion ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Finish Quiz
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
