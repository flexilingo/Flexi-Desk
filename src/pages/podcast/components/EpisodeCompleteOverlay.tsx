import type { NlpAnalysis } from '../types';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface EpisodeCompleteOverlayProps {
  analysis: NlpAnalysis | null | undefined;
  wordsClicked: number;
  wordsAddedToDeck: number;
  activeTimeSpent: number; // ms
  onReplay: () => void;
  onOpenVocab: () => void;
  onDismiss: () => void;
  onStartQuiz?: () => void;
}

export function EpisodeCompleteOverlay({
  analysis,
  wordsClicked,
  wordsAddedToDeck,
  activeTimeSpent,
  onReplay,
  onOpenVocab,
  onDismiss,
  onStartQuiz,
}: EpisodeCompleteOverlayProps) {
  const overallCefr = analysis?.cefrLevel;

  return (
    <div className="absolute inset-0 z-[105] flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors text-lg"
        >
          ✕
        </button>

        {/* Header */}
        <div className="pt-7 pb-4 px-6 text-center border-b border-border bg-primary/5">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-lg font-bold text-foreground">Episode Complete</h2>
          <p className="text-xs text-muted-foreground mt-1">Great listening session!</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <div className="flex flex-col items-center py-4 px-2 gap-0.5">
            <span className="text-xl font-bold text-foreground">{wordsClicked}</span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Words Explored
            </span>
          </div>
          <div className="flex flex-col items-center py-4 px-2 gap-0.5">
            <span className="text-xl font-bold text-primary">{wordsAddedToDeck}</span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Added to Deck
            </span>
          </div>
          <div className="flex flex-col items-center py-4 px-2 gap-0.5">
            <span className="text-xl font-bold text-foreground">{formatTime(activeTimeSpent)}</span>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">
              Study Time
            </span>
          </div>
        </div>

        {/* Episode info */}
        {overallCefr && (
          <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">This episode</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              {overallCefr} Level
            </span>
            {analysis?.totalWords && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {analysis.totalWords} words
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="p-4 flex flex-col gap-2">
          {onStartQuiz && (
            <button
              type="button"
              onClick={onStartQuiz}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Take Quiz
            </button>
          )}
          {wordsAddedToDeck > 0 && (
            <button
              type="button"
              onClick={onOpenVocab}
              className="w-full py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
            >
              Review Saved Words
            </button>
          )}
          <button
            type="button"
            onClick={onReplay}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Replay Episode
          </button>
        </div>
      </div>
    </div>
  );
}
