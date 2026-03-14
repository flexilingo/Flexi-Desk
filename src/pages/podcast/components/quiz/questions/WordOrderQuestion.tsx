import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, RotateCcw, Lightbulb } from 'lucide-react';
import type { QuizQuestion } from '../types';

interface WordOrderQuestionProps {
  question: QuizQuestion;
  onAnswer: (answer: string, timeSpentMs: number, hintUsed: boolean) => void;
  showFeedback?: boolean;
  isCorrect?: boolean;
  disabled?: boolean;
}

export function WordOrderQuestion({
  question,
  onAnswer,
  showFeedback = false,
  isCorrect,
  disabled = false,
}: WordOrderQuestionProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    setSelectedWords([]);
    setShowHint(false);
    setHintUsed(false);
  }, [question.id]);

  const jumbledWords = question.jumbled || [];

  const getAvailableWords = () => {
    const available: { word: string; count: number }[] = [];
    for (const word of jumbledWords) {
      const totalCount = jumbledWords.filter((w) => w === word).length;
      const usedCount = selectedWords.filter((w) => w === word).length;
      const remainingCount = totalCount - usedCount;
      if (remainingCount > 0) {
        const existing = available.find((a) => a.word === word);
        if (!existing) {
          available.push({ word, count: remainingCount });
        }
      }
    }
    return available;
  };

  const handleWordClick = (word: string) => {
    if (disabled || showFeedback) return;
    setSelectedWords([...selectedWords, word]);
  };

  const handleSelectedWordClick = (index: number) => {
    if (disabled || showFeedback) return;
    const newSelected = [...selectedWords];
    newSelected.splice(index, 1);
    setSelectedWords(newSelected);
  };

  const handleSubmit = () => {
    if (disabled || selectedWords.length !== jumbledWords.length) return;
    const timeSpent = Date.now() - startTime;
    const answer = selectedWords.join(' ');
    onAnswer(answer, timeSpent, hintUsed);
  };

  const availableWords = getAvailableWords();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground">
            Arrange Words in Order
          </CardTitle>
          <Badge variant="outline">{question.difficulty}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            'min-h-[80px] p-4 rounded-lg border-2 border-dashed',
            selectedWords.length > 0 ? 'border-primary/50' : 'border-muted-foreground/30',
          )}
        >
          {selectedWords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedWords.map((word, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectedWordClick(index)}
                  disabled={disabled || showFeedback}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    'bg-primary text-primary-foreground',
                    !disabled && !showFeedback && 'hover:bg-primary/80 cursor-pointer',
                  )}
                >
                  {word}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center">Click words to build the sentence</p>
          )}
        </div>

        {!showFeedback && (
          <div className="flex flex-wrap gap-2 justify-center">
            {availableWords.map(({ word, count }, index) => (
              <button
                key={`${word}-${index}`}
                onClick={() => handleWordClick(word)}
                disabled={disabled}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  'bg-muted hover:bg-muted/80 border border-border',
                  disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                {word}
                {count > 1 && <span className="ml-1 text-xs opacity-60">{count}</span>}
              </button>
            ))}
          </div>
        )}

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
                First word starts with: {question.answer?.[0]?.charAt(0)?.toUpperCase()}
              </div>
            )}
          </div>
        )}

        {showFeedback && (
          <div
            className={cn(
              'p-3 rounded-lg',
              isCorrect
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {isCorrect ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Correct!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Not quite right</span>
                </>
              )}
            </div>
            {!isCorrect && question.original && (
              <p className="text-sm">
                Correct sentence: <strong>&quot;{question.original}&quot;</strong>
              </p>
            )}
          </div>
        )}

        {!showFeedback && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedWords([])}
              disabled={disabled || selectedWords.length === 0}
              className="flex-shrink-0"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={disabled || selectedWords.length !== jumbledWords.length}
              className="flex-1"
            >
              Check Answer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
