import { Trophy, Clock, MessageSquare, AlertCircle, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { CorrectionItem } from './CorrectionItem';
import { ScoreRing } from './ScoreRing';
import type { SessionSummary as SessionSummaryType } from '../types';

interface SessionSummaryProps {
  summary: SessionSummaryType;
  onStartNew: () => void;
  onSaveAllVocab?: () => void;
}

export function SessionSummary({ summary, onStartNew, onSaveAllVocab }: SessionSummaryProps) {
  const { t } = useTranslation('tutor');
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
          <Trophy className="h-6 w-6 text-success" />
        </div>
        <CardTitle className="text-xl">{t('summary.title')}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Score Rings */}
        <div className="flex items-center justify-center gap-6">
          <ScoreRing score={summary.grammarScore} label={t('scores.grammar')} />
          <ScoreRing score={summary.vocabScore} label={t('scores.vocabulary')} />
          <ScoreRing score={summary.fluencyScore} label={t('scores.fluency')} />
          <ScoreRing score={summary.overallScore} label={t('scores.overall')} size={96} />
        </div>

        {/* Stats Row */}
        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {t('detail.minutes', { count: summary.durationMinutes })}
          </span>
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            {t('detail.messages', { count: summary.messageCount })}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            {t('detail.fixes', { count: summary.corrections.length })}
          </span>
        </div>

        {/* Corrections Section */}
        {summary.corrections.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
              {t('corrections.title', { count: summary.corrections.length })}
            </h4>
            <div className="space-y-2">
              {summary.corrections.map((correction, index) => (
                <CorrectionItem key={index} correction={correction} />
              ))}
            </div>
          </div>
        )}

        {/* New Words Section */}
        {summary.newWords.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
              <BookOpen className="h-4 w-4" />
              {t('words.title', { count: summary.newWords.length })}
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
              <Button variant="outline" onClick={onSaveAllVocab}>
                {t('words.saveAll')}
              </Button>
            )}
          </div>
        )}

        {/* Start New Button */}
        <div className="flex justify-center">
          <Button onClick={onStartNew}>{t('summary.startNew')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
