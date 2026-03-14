import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, RotateCcw, Link2 } from 'lucide-react';
import type { QuizQuestion } from '../types';

interface MatchingQuestionProps {
  question: QuizQuestion;
  onAnswer: (answer: string, timeSpentMs: number, hintUsed: boolean) => void;
  showFeedback?: boolean;
  isCorrect?: boolean;
  disabled?: boolean;
}

interface MatchPair {
  left: string;
  right: string;
  rightIndex: number;
}

export function MatchingQuestion({
  question,
  onAnswer,
  showFeedback = false,
  isCorrect,
  disabled = false,
}: MatchingQuestionProps) {
  const pairs = question.pairs || [];
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchPair[]>([]);
  const [startTime] = useState(Date.now());

  const [shuffledRight] = useState(() => {
    const rightWords = pairs.map((p) => p.right);
    return rightWords.sort(() => Math.random() - 0.5);
  });

  useEffect(() => {
    setSelectedLeft(null);
    setMatches([]);
  }, [question.id]);

  const handleLeftClick = (word: string) => {
    if (disabled || showFeedback) return;
    if (matches.some((m) => m.left === word)) return;
    setSelectedLeft(word);
  };

  const handleRightClick = (word: string, index: number) => {
    if (disabled || showFeedback || !selectedLeft) return;
    if (matches.some((m) => m.rightIndex === index)) return;

    const newMatches = [...matches, { left: selectedLeft, right: word, rightIndex: index }];
    setMatches(newMatches);
    setSelectedLeft(null);

    if (newMatches.length === pairs.length) {
      const timeSpent = Date.now() - startTime;
      const answer = newMatches.map((m) => `${m.left}:${m.right}`).join(',');
      onAnswer(answer, timeSpent, false);
    }
  };

  const getMatchedPairForLeft = (word: string) => matches.find((m) => m.left === word);
  const getMatchedPairForRight = (index: number) => matches.find((m) => m.rightIndex === index);
  const isCorrectMatch = (left: string, right: string) =>
    pairs.some((p) => p.left === left && p.right === right);

  const calculateScore = () => {
    let correct = 0;
    for (const match of matches) {
      if (isCorrectMatch(match.left, match.right)) correct++;
    }
    return { correct, total: pairs.length };
  };

  const score = showFeedback ? calculateScore() : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground">
            Match the Pairs
          </CardTitle>
          <Badge variant="outline">{question.difficulty}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {question.hint && <p className="text-sm text-muted-foreground italic">{question.hint}</p>}

        {pairs.length === 0 && (
          <div className="p-4 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 rounded-lg">
            <p className="font-medium">No pairs found for this question.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Word
            </div>
            {pairs.map((pair, index) => {
              const matchedPair = getMatchedPairForLeft(pair.left);
              const isMatched = !!matchedPair;
              const isSelected = selectedLeft === pair.left;
              const matchIsCorrect = matchedPair
                ? isCorrectMatch(matchedPair.left, matchedPair.right)
                : false;

              return (
                <button
                  key={`left-${index}`}
                  onClick={() => handleLeftClick(pair.left)}
                  disabled={disabled || showFeedback || isMatched}
                  className={cn(
                    'w-full px-4 py-2.5 rounded-lg text-left font-medium transition-all border-2',
                    isMatched
                      ? showFeedback
                        ? matchIsCorrect
                          ? 'bg-green-100 border-green-500 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 border-red-500 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-muted border-muted-foreground/30 opacity-60'
                      : isSelected
                        ? 'bg-primary/10 border-primary'
                        : 'bg-card border-border hover:border-primary/50',
                    (disabled || showFeedback) && 'cursor-not-allowed',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{pair.left}</span>
                    {isMatched && (
                      <Link2
                        className={cn(
                          'h-4 w-4',
                          showFeedback
                            ? matchIsCorrect
                              ? 'text-green-600'
                              : 'text-red-600'
                            : 'text-muted-foreground',
                        )}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Match
            </div>
            {shuffledRight.map((word, index) => {
              const matchedPair = getMatchedPairForRight(index);
              const isMatched = !!matchedPair;
              const matchIsCorrect = matchedPair
                ? isCorrectMatch(matchedPair.left, matchedPair.right)
                : false;

              return (
                <button
                  key={`right-${index}`}
                  onClick={() => handleRightClick(word, index)}
                  disabled={disabled || showFeedback || isMatched || !selectedLeft}
                  className={cn(
                    'w-full px-4 py-2.5 rounded-lg text-left font-medium transition-all border-2',
                    isMatched
                      ? showFeedback
                        ? matchIsCorrect
                          ? 'bg-green-100 border-green-500 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 border-red-500 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-muted border-muted-foreground/30 opacity-60'
                      : selectedLeft
                        ? 'bg-card border-border hover:border-primary cursor-pointer'
                        : 'bg-card border-border opacity-75',
                    (disabled || showFeedback) && 'cursor-not-allowed',
                  )}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>

        {matches.length > 0 && !showFeedback && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Matched:</span>
            {matches.map((match, index) => (
              <span key={index} className="text-xs bg-muted px-2 py-1 rounded">
                {match.left} → {match.right}
              </span>
            ))}
          </div>
        )}

        {showFeedback && score && (
          <div
            className={cn(
              'p-3 rounded-lg',
              isCorrect
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400',
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {isCorrect ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">All correct!</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">
                    {score.correct} of {score.total} correct
                  </span>
                </>
              )}
            </div>
            {!isCorrect && (
              <div className="text-sm space-y-1">
                <p>Correct matches:</p>
                <ul className="list-disc list-inside">
                  {pairs.map((pair, index) => (
                    <li key={index}>
                      <strong>{pair.left}</strong> → <strong>{pair.right}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!showFeedback && matches.length > 0 && matches.length < pairs.length && (
          <Button
            variant="outline"
            onClick={() => {
              setMatches([]);
              setSelectedLeft(null);
            }}
            disabled={disabled}
            className="w-full"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset Matches
          </Button>
        )}

        {!showFeedback && (
          <div className="text-center text-sm text-muted-foreground">
            {matches.length} of {pairs.length} pairs matched
            {selectedLeft && (
              <span className="ml-2 text-primary">
                (Select match for &quot;{selectedLeft}&quot;)
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
