import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { usePronunciationStore } from '../stores/pronunciationStore';
import { scoreColor, scoreBg } from '../types';

export function ResultsView() {
  const { activeSession, activeAttempt, attempts, goBack, setView } = usePronunciationStore();

  if (!activeSession) return null;

  const latestAttempt = activeAttempt ?? attempts[attempts.length - 1];
  const score = latestAttempt?.overallScore;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>Results</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Target text */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Target</p>
          <p className="text-xl font-semibold text-foreground">{activeSession.targetText}</p>
        </div>

        {/* Overall score */}
        {score != null && (
          <div className="flex flex-col items-center gap-2">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full ${scoreBg(score)}`}
            >
              <span className={`text-3xl font-bold ${scoreColor(score)}`}>{Math.round(score)}</span>
            </div>
            <p className="text-sm text-muted-foreground">Overall Score</p>
          </div>
        )}

        {/* Score breakdown */}
        {latestAttempt && (
          <div className="grid grid-cols-3 gap-3">
            <ScoreCard label="Phoneme" score={latestAttempt.phonemeScore} />
            <ScoreCard label="Prosody" score={latestAttempt.prosodyScore} />
            <ScoreCard label="Fluency" score={latestAttempt.fluencyScore} />
          </div>
        )}

        {/* Transcript */}
        {latestAttempt?.transcript && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">What Whisper heard:</p>
            <p className="text-sm text-foreground">{latestAttempt.transcript}</p>
          </div>
        )}

        {/* Word-level scores */}
        {latestAttempt?.wordScores && latestAttempt.wordScores.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Word Breakdown</h3>
            <div className="flex flex-wrap gap-2">
              {latestAttempt.wordScores.map((ws, i) => (
                <div
                  key={i}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${scoreBg(ws.score)} ${scoreColor(ws.score)}`}
                  title={`Expected: "${ws.expected}" | Heard: "${ws.actual}" | ${Math.round(ws.score)}%`}
                >
                  {ws.expected}
                  {ws.status === 'substitution' && (
                    <span className="text-xs opacity-70 ml-1">→ {ws.actual}</span>
                  )}
                  {ws.status === 'missing' && (
                    <span className="text-xs opacity-70 ml-1">(missed)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback */}
        {activeSession.feedback.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground">Feedback</h3>
            <ul className="space-y-1">
              {activeSession.feedback.map((fb, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  {fb}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Attempt history */}
        {attempts.length > 1 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              All Attempts ({attempts.length})
            </h3>
            <div className="space-y-1">
              {attempts.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">Attempt #{att.attemptNumber}</span>
                  {att.overallScore != null && (
                    <span className={`font-medium ${scoreColor(att.overallScore)}`}>
                      {Math.round(att.overallScore)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best score */}
        {activeSession.bestScore != null && attempts.length > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Trophy className="h-4 w-4 text-[#C58C6E]" />
            Best:{' '}
            <span className={`font-medium ${scoreColor(activeSession.bestScore)}`}>
              {Math.round(activeSession.bestScore)}%
            </span>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-center gap-3">
        <Button variant="outline" onClick={goBack}>
          Back to Sessions
        </Button>
        <Button onClick={() => setView('practice')}>
          <RotateCcw className="h-4 w-4" />
          Try Again
        </Button>
      </CardFooter>
    </Card>
  );
}

function ScoreCard({ label, score }: { label: string; score?: number }) {
  if (score == null) return null;
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <p className={`text-xl font-bold ${scoreColor(score)}`}>{Math.round(score)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
