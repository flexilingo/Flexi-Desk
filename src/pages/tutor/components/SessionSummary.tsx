import { Trophy, Clock, MessageSquare, AlertCircle, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from './ScoreRing';
import type { SessionSummary as SessionSummaryType, CorrectionType } from '../types';

interface SessionSummaryProps {
  summary: SessionSummaryType;
  onStartNew: () => void;
  onSaveAllVocab?: () => void;
}

const borderColorByType: Record<CorrectionType, string> = {
  grammar: 'border-l-primary',
  spelling: 'border-l-[#C58C6E]',
  word_choice: 'border-l-[#8BB7A3]',
  word_order: 'border-l-muted',
};

export function SessionSummary({ summary, onStartNew, onSaveAllVocab }: SessionSummaryProps) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#8BB7A3]/20">
          <Trophy className="h-6 w-6 text-[#8BB7A3]" />
        </div>
        <CardTitle className="text-xl">Session Complete!</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Score Rings */}
        <div className="flex items-center justify-center gap-6">
          <ScoreRing score={summary.grammarScore} label="Grammar" />
          <ScoreRing score={summary.vocabScore} label="Vocabulary" />
          <ScoreRing score={summary.fluencyScore} label="Fluency" />
          <ScoreRing score={summary.overallScore} label="Overall" size={96} />
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {summary.durationMinutes} min
          </span>
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {summary.messageCount} messages
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            {summary.corrections.length} fixes
          </span>
        </div>

        {/* Corrections Section */}
        {summary.corrections.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
              Corrections ({summary.corrections.length})
            </h4>
            <div className="space-y-2">
              {summary.corrections.map((correction, index) => (
                <div
                  key={index}
                  className={`border-l-4 ${borderColorByType[correction.type]} rounded bg-muted/30 p-3 space-y-1`}
                >
                  <p className="text-sm text-muted-foreground line-through">
                    ❌ {correction.original}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    ✅ {correction.corrected}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    💡 {correction.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Words Section */}
        {summary.newWords.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
              <BookOpen className="h-4 w-4" />
              New Words ({summary.newWords.length})
            </h4>
            <div className="space-y-2">
              {summary.newWords.map((vocab, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm text-foreground">
                    <span className="font-medium">{vocab.word}</span>
                    <span className="text-muted-foreground"> — {vocab.translation}</span>
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {vocab.cefr}
                  </Badge>
                </div>
              ))}
            </div>

            {onSaveAllVocab && (
              <Button variant="outline" className="w-full" onClick={onSaveAllVocab}>
                Save All to Deck
              </Button>
            )}
          </div>
        )}

        {/* Start New Button */}
        <Button className="w-full" onClick={onStartNew}>
          Start New Conversation
        </Button>
      </CardContent>
    </Card>
  );
}
