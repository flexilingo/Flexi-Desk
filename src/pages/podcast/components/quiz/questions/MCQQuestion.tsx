import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import type { QuizQuestion } from '../types';

interface MCQQuestionProps {
  question: QuizQuestion;
  onAnswer: (answer: string, timeSpentMs: number, hintUsed: boolean) => void;
  showFeedback?: boolean;
  isCorrect?: boolean;
  disabled?: boolean;
}

export function MCQQuestion({
  question,
  onAnswer,
  showFeedback = false,
  isCorrect,
  disabled = false,
}: MCQQuestionProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    setSelectedOption(null);
    setShowHint(false);
    setHintUsed(false);
  }, [question.id]);

  const handleSelect = (option: string) => {
    if (disabled || showFeedback) return;
    setSelectedOption(option);
  };

  const handleSubmit = () => {
    if (!selectedOption || disabled) return;
    const timeSpent = Date.now() - startTime;
    onAnswer(selectedOption, timeSpent, hintUsed);
  };

  const getQuestionTitle = () => {
    switch (question.type) {
      case 'mcq_synonym':
        return 'Choose the Synonym';
      case 'mcq_grammar':
        return `Grammar: ${question.grammar_point || 'Verb Form'}`;
      case 'mcq_meaning':
      default:
        return 'Choose the Correct Answer';
    }
  };

  const renderQuestion = () => {
    if (question.question) {
      return <p className="text-lg">{question.question}</p>;
    }

    if (question.sentence) {
      const parts = question.sentence.split('_____');
      return (
        <p className="text-lg">
          {parts.map((part, index) => (
            <React.Fragment key={index}>
              {part}
              {index < parts.length - 1 && (
                <span className="inline-block min-w-[60px] px-2 py-0.5 mx-1 bg-primary/10 rounded border-b-2 border-primary">
                  {showFeedback ? (
                    <span className={cn(isCorrect ? 'text-green-700' : 'text-red-700')}>
                      {selectedOption}
                    </span>
                  ) : (
                    '______'
                  )}
                </span>
              )}
            </React.Fragment>
          ))}
        </p>
      );
    }

    return null;
  };

  const getOptionState = (option: string) => {
    if (!showFeedback) {
      return selectedOption === option ? 'selected' : 'default';
    }
    if (option === question.answer) return 'correct';
    if (option === selectedOption && !isCorrect) return 'incorrect';
    return 'default';
  };

  const optionStyles = {
    default: 'border-border hover:border-primary/50 hover:bg-muted/50',
    selected: 'border-primary bg-primary/10',
    correct: 'border-green-500 bg-green-100 dark:bg-green-900/20',
    incorrect: 'border-red-500 bg-red-100 dark:bg-red-900/20',
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground">
            {getQuestionTitle()}
          </CardTitle>
          <Badge variant="outline">{question.difficulty}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/30 rounded-lg">{renderQuestion()}</div>

        {question.type === 'mcq_synonym' && question.context_sentence && (
          <div className="text-sm text-muted-foreground italic px-2">
            Context: &quot;{question.context_sentence}&quot;
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {question.options?.map((option, index) => {
            const state = getOptionState(option);
            return (
              <button
                key={index}
                onClick={() => handleSelect(option)}
                disabled={disabled || showFeedback}
                className={cn(
                  'p-3 rounded-lg border-2 text-left transition-all',
                  'flex items-center gap-2',
                  optionStyles[state],
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium',
                    state === 'selected' && 'border-primary bg-primary text-primary-foreground',
                    state === 'correct' && 'border-green-500 bg-green-500 text-white',
                    state === 'incorrect' && 'border-red-500 bg-red-500 text-white',
                    state === 'default' && 'border-muted-foreground/30',
                  )}
                >
                  {state === 'correct' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : state === 'incorrect' ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    String.fromCharCode(65 + index)
                  )}
                </span>
                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>

        {question.hint && !showFeedback && (
          <div className="flex items-center gap-2">
            {!showHint ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowHint(true);
                  setHintUsed(true);
                }}
                disabled={disabled}
                className="text-muted-foreground"
              >
                <Lightbulb className="h-4 w-4 mr-1" />
                Show Hint
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-3 py-1.5 rounded-md">
                <Lightbulb className="h-4 w-4" />
                {question.hint}
              </div>
            )}
          </div>
        )}

        {showFeedback && (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              isCorrect
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
            )}
          >
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Correct!</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5" />
                <span>
                  Correct answer: <strong>{question.answer}</strong>
                </span>
              </>
            )}
          </div>
        )}

        {!showFeedback && (
          <Button onClick={handleSubmit} disabled={!selectedOption || disabled} className="w-full">
            Submit Answer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
