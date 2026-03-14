import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Lightbulb, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import type { QuizQuestion } from '../types';

interface FillBlankQuestionProps {
  question: QuizQuestion;
  onAnswer: (answer: string, timeSpentMs: number, hintUsed: boolean) => void;
  showFeedback?: boolean;
  isCorrect?: boolean;
  disabled?: boolean;
}

export function FillBlankQuestion({
  question,
  onAnswer,
  showFeedback = false,
  isCorrect,
  disabled = false,
}: FillBlankQuestionProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [startTime] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUserAnswer('');
    setShowHint(false);
    setHintUsed(false);
    inputRef.current?.focus();
  }, [question.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAnswer.trim() || disabled) return;
    const timeSpent = Date.now() - startTime;
    onAnswer(userAnswer.trim(), timeSpent, hintUsed);
  };

  const handleShowHint = () => {
    setShowHint(true);
    setHintUsed(true);
  };

  const renderSentence = () => {
    const sentence = question.sentence || '';
    const parts = sentence.split('_____');

    return (
      <p className="text-lg leading-relaxed">
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 && (
              <span
                className={cn(
                  'inline-block min-w-[80px] mx-1 px-2 py-0.5 rounded border-b-2',
                  showFeedback
                    ? isCorrect
                      ? 'bg-green-100 border-green-500 text-green-700'
                      : 'bg-red-100 border-red-500 text-red-700'
                    : 'bg-primary/10 border-primary',
                )}
              >
                {showFeedback ? (isCorrect ? userAnswer : question.answer) : userAnswer || '______'}
              </span>
            )}
          </React.Fragment>
        ))}
      </p>
    );
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground">
            Fill in the Blank
          </CardTitle>
          <Badge variant="outline">{question.difficulty}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/30 rounded-lg">{renderSentence()}</div>

        {question.hint && (
          <div className="flex items-center gap-2">
            {!showHint ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShowHint}
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
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              ref={inputRef}
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type your answer..."
              disabled={disabled}
              className="flex-1"
              autoComplete="off"
              autoCapitalize="off"
            />
            <Button type="submit" disabled={!userAnswer.trim() || disabled}>
              Check
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
