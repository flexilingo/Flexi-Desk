import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  BarChart3,
  FileText,
  Clock,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWritingStore } from '../stores/writingStore';
import {
  TASK_TYPE_LABELS,
  ERROR_TYPE_LABELS,
  SEVERITY_COLORS,
  formatElapsed,
  scoreColor,
  scoreBg,
} from '../types';
import type { WritingCorrection, CorrectionErrorType } from '../types';

export function ResultsView() {
  const { activeSession, corrections, goBack } = useWritingStore();

  if (!activeSession) return null;

  // Group corrections by type
  const correctionsByType = corrections.reduce<Record<string, WritingCorrection[]>>((acc, c) => {
    if (!acc[c.errorType]) acc[c.errorType] = [];
    acc[c.errorType].push(c);
    return acc;
  }, {});

  const severityCounts = corrections.reduce(
    (acc, c) => {
      acc[c.severity] = (acc[c.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      {/* Header card */}
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
                  {TASK_TYPE_LABELS[activeSession.taskType]}
                </Badge>
                <span>{activeSession.language.toUpperCase()}</span>
                <span>{activeSession.wordCount} words</span>
                {activeSession.elapsedSeconds > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatElapsed(activeSession.elapsedSeconds)}
                  </span>
                )}
              </div>
            </div>
            {activeSession.bandScore && (
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground">Band</span>
                <span className="text-2xl font-bold text-foreground">
                  {activeSession.bandScore}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Score breakdown */}
      {activeSession.overallScore != null && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Score Breakdown</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              <ScoreCard label="Overall" score={activeSession.overallScore} large />
              {activeSession.grammarScore != null && (
                <ScoreCard label="Grammar" score={activeSession.grammarScore} />
              )}
              {activeSession.vocabularyScore != null && (
                <ScoreCard label="Vocabulary" score={activeSession.vocabularyScore} />
              )}
              {activeSession.coherenceScore != null && (
                <ScoreCard label="Coherence" score={activeSession.coherenceScore} />
              )}
              {activeSession.taskScore != null && (
                <ScoreCard label="Task" score={activeSession.taskScore} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback */}
      {activeSession.feedbackJson && activeSession.feedbackJson !== '{}' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Feedback</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <FeedbackDisplay json={activeSession.feedbackJson} />
          </CardContent>
        </Card>
      )}

      {/* Corrections */}
      {corrections.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Corrections ({corrections.length})</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {severityCounts.critical && (
                  <div className="flex items-center gap-1 text-xs text-error">
                    <XCircle className="h-3.5 w-3.5" />
                    {severityCounts.critical} critical
                  </div>
                )}
                {severityCounts.major && (
                  <div className="flex items-center gap-1 text-xs text-[#C58C6E]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {severityCounts.major} major
                  </div>
                )}
                {severityCounts.minor && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {severityCounts.minor} minor
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(correctionsByType).map(([type, items]) => (
              <div key={type} className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">
                  {ERROR_TYPE_LABELS[type as CorrectionErrorType] ?? type}
                  <span className="ml-1 text-muted-foreground">({items.length})</span>
                </h4>
                <div className="space-y-2">
                  {items.map((c) => (
                    <CorrectionCard key={c.id} correction={c} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Corrected text comparison */}
      {activeSession.correctedText && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corrected Text</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {activeSession.correctedText}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreCard({ label, score, large }: { label: string; score: number; large?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-lg p-3 ${scoreBg(score)}`}>
      <span className={`font-bold ${large ? 'text-2xl' : 'text-lg'} ${scoreColor(score)}`}>
        {score.toFixed(0)}%
      </span>
      <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}

function CorrectionCard({ correction }: { correction: WritingCorrection }) {
  const colors = SEVERITY_COLORS[correction.severity];

  return (
    <div className={`rounded-lg border border-border p-3 ${colors.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm line-through text-error/70">{correction.originalSpan}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-sm font-medium text-[#8BB7A3]">{correction.correctedSpan}</span>
          </div>
          {correction.explanation && (
            <p className="text-xs text-muted-foreground">{correction.explanation}</p>
          )}
        </div>
        <Badge variant="secondary" className={`text-xs ${colors.text}`}>
          {correction.severity}
        </Badge>
      </div>
    </div>
  );
}

function FeedbackDisplay({ json }: { json: string }) {
  try {
    const data = JSON.parse(json);
    if (typeof data === 'string') {
      return <p className="text-sm text-foreground whitespace-pre-wrap">{data}</p>;
    }
    if (typeof data === 'object' && data !== null) {
      return (
        <div className="space-y-3">
          {Object.entries(data).map(([key, value]) => (
            <div key={key}>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">
                {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </p>
              <p className="text-sm text-foreground">{String(value)}</p>
            </div>
          ))}
        </div>
      );
    }
  } catch {
    // Not valid JSON, display as-is
  }
  return <p className="text-sm text-foreground">{json}</p>;
}
