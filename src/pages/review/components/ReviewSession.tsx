import { useEffect } from 'react';
import { ArrowLeft, Check, X, Plus, Settings, Pause, Play, Square } from 'lucide-react';
import { useReviewStore } from '../stores/reviewStore';
import { useReviewKeyboard } from '../hooks/useReviewKeyboard';
import { useAutoPlay } from '../hooks/useAutoPlay';
import { CardFlip } from './CardFlip';
import { SettingsDialog } from './SettingsDialog';
import { CardEditDialog } from './CardEditDialog';
import { DictionarySheet } from './DictionarySheet';
import { createStrategy } from '../algorithms';
import type { Rating, CardState } from '../types';

const RATINGS: { key: Rating; number: number; className: string }[] = [
  { key: 'again', number: 1, className: 'bg-[#DF804D] hover:brightness-90' },
  { key: 'again', number: 2, className: 'bg-[#C58C6E] hover:brightness-90' },
  { key: 'hard',  number: 3, className: 'bg-[#9A8A6E] hover:brightness-90' },
  { key: 'good',  number: 4, className: 'bg-[#6B8A5E] hover:brightness-90' },
  { key: 'easy',  number: 5, className: 'bg-primary hover:brightness-90' },
];

function StateBadge({ state }: { state: CardState }) {
  const config: Record<CardState, { label: string; className: string }> = {
    new: { label: 'New', className: 'bg-[#8BB7A3]/20 text-[#8BB7A3]' },
    learning: { label: 'Learning', className: 'bg-[#C58C6E]/20 text-[#C58C6E]' },
    relearning: { label: 'Relearning', className: 'bg-[#C58C6E]/20 text-[#C58C6E]' },
    review: { label: 'Review', className: 'bg-muted text-muted-foreground' },
  };
  const { label, className } = config[state] ?? config.review;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function ReviewSession() {
  const {
    session,
    currentCard,
    isFlipped,
    cardsRemaining,
    isRating,
    cardHistory,
    requeueTracker,
    remainingByType,
    reviewSettings,
    isSettingsOpen,
    isEditCardOpen,
    isAddToDeckOpen,
    isDictionaryOpen,
    dictionaryWord,
    flipCard,
    rateCard,
    completeSession,
    goToPreviousCard,
    setSettingsOpen,
    setEditCardOpen,
    setAddToDeckOpen,
    setDictionaryOpen,
    loadReviewSettings,
  } = useReviewStore();

  const {
    speak,
    isSpeaking,
    autoAdvanceCountdown,
    isAutoPlayPaused,
    handlePause,
    handleResume,
    handleDisableAutoPlay,
  } = useAutoPlay();

  useReviewKeyboard();

  // Load settings on mount
  useEffect(() => {
    loadReviewSettings();
  }, [loadReviewSettings]);

  // Auto-show translation if alwaysShowTranslation
  useEffect(() => {
    if (reviewSettings.alwaysShowTranslation && !isFlipped && currentCard) {
      flipCard();
    }
  }, [currentCard?.id, reviewSettings.alwaysShowTranslation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !currentCard) return null;

  const progress = session.totalCards > 0 ? (session.reviewedCards / session.totalCards) * 100 : 0;
  const incorrectCount = session.reviewedCards - session.correctCount;
  const showAnswer = isFlipped || reviewSettings.alwaysShowTranslation;
  const currentRequeueCount = requeueTracker[currentCard.id] ?? 0;

  // Preview intervals
  const strategy = createStrategy(session.algorithm);
  const previews = RATINGS.reduce(
    (acc, r) => {
      const result = strategy.schedule(
        {
          cardId: currentCard.id,
          boxNumber: currentCard.boxNumber,
          easinessFactor: currentCard.easinessFactor,
          repetitions: undefined,
          stability: currentCard.stability,
          difficulty: currentCard.difficulty,
          state: currentCard.state,
          intervalDays: currentCard.intervalDays,
        },
        r.key,
      );
      acc[r.key] = result.intervalDays;
      return acc;
    },
    {} as Record<Rating, number>,
  );

  function formatInterval(days: number): string {
    if (days < 1) return '<1d';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1)}y`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header area */}
      <div className="shrink-0 px-4 pt-4 pb-2 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Back/End button */}
          <button
            onClick={completeSession}
            className="bg-card hover:bg-muted border border-border p-1.5 rounded-lg shadow-sm transition-colors"
            title="End session"
          >
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Center: stats pills */}
          <div className="flex items-center gap-2">
            {/* Remaining + state badge + type breakdown */}
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg shadow-sm px-3 py-1.5">
              <span className="text-lg font-bold text-foreground">{cardsRemaining}</span>
              <StateBadge state={currentCard.state} />
              {/* Type breakdown */}
              <div className="hidden sm:flex gap-1.5 text-[10px]">
                {remainingByType.new > 0 && (
                  <span className="text-[#8BB7A3]">{remainingByType.new}N</span>
                )}
                {remainingByType.review > 0 && (
                  <span className="text-[#6B705C]">{remainingByType.review}R</span>
                )}
                {remainingByType.learning > 0 && (
                  <span className="text-[#C58C6E]">{remainingByType.learning}L</span>
                )}
              </div>
            </div>

            {/* Correct / Incorrect */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg shadow-sm px-3 py-1.5">
              <span className="flex items-center gap-0.5 text-sm font-bold text-foreground">
                {session.correctCount}
                <Check className="w-3.5 h-3.5 text-[#8BB7A3]" />
              </span>
              <span className="text-muted-foreground text-sm">/</span>
              <span className="flex items-center gap-0.5 text-sm font-bold text-foreground">
                {incorrectCount}
                <X className="w-3.5 h-3.5 text-error" />
              </span>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1">
            {showAnswer && (
              <button
                onClick={() => setAddToDeckOpen(true)}
                className="bg-card hover:bg-muted border border-border p-1.5 rounded-lg shadow-sm transition-colors"
                title="Add to Deck"
              >
                <Plus className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={goToPreviousCard}
              disabled={cardHistory.length === 0 || isRating}
              className="bg-card hover:bg-muted border border-border p-1.5 rounded-lg shadow-sm transition-colors disabled:opacity-40"
              title="Previous Card"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="bg-card hover:bg-muted border border-border p-1.5 rounded-lg shadow-sm transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Progress bar with counter */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {session.reviewedCards + 1}/{session.totalCards}
          </span>
        </div>
      </div>

      {/* Scrollable card content */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-xl">
          <CardFlip
            card={currentCard}
            isFlipped={showAnswer}
            requeueCount={currentRequeueCount}
            editModeEnabled={reviewSettings.editModeEnabled}
            onEdit={() => setEditCardOpen(true)}
            onSpeak={(text) => speak(text, reviewSettings.ttsVoice)}
            isSpeaking={isSpeaking}
            onDictionary={(word) => setDictionaryOpen(true, word)}
          />
        </div>
      </div>

      {/* Pinned bottom action area */}
      <div className="shrink-0 border-t border-border bg-card">
        {!showAnswer ? (
          /* Show Answer button */
          <div className="p-3 flex justify-center">
            <button
              onClick={flipCard}
              className="w-full max-w-sm bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-xl font-medium text-sm shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
            >
              Show Answer
            </button>
          </div>
        ) : (
          /* Rating buttons */
          <div className="p-3 space-y-2">
            <p className="text-center text-xs text-muted-foreground">
              Select your confidence level:
            </p>
            <div className="grid grid-cols-5 gap-2 mx-auto max-w-lg">
              {RATINGS.map((r) => (
                <button
                  key={r.key}
                  disabled={isRating}
                  onClick={() => rateCard(r.key)}
                  className={`flex flex-col items-center justify-center py-3 rounded-xl text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none ${r.className}`}
                >
                  {isRating ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-2xl font-bold">{r.number}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Auto-play controls */}
            {(autoAdvanceCountdown !== null || isAutoPlayPaused) && (
              <div className="flex justify-center gap-2 pt-1">
                <button
                  onClick={isAutoPlayPaused ? handleResume : handlePause}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium"
                >
                  {isAutoPlayPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {isAutoPlayPaused ? 'Resume' : `${autoAdvanceCountdown}s`}
                </button>
                <button
                  onClick={handleDisableAutoPlay}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 text-xs font-medium"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              </div>
            )}

            <p className="text-center text-[10px] text-muted-foreground/60 pt-1">
              Keyboard: Space/Enter = show/hide answer · 1-5 = select rating
            </p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SettingsDialog open={isSettingsOpen} onOpenChange={setSettingsOpen} />
      <CardEditDialog open={isEditCardOpen} onOpenChange={setEditCardOpen} card={currentCard} />
      <DictionarySheet
        open={isDictionaryOpen}
        onOpenChange={(open) => setDictionaryOpen(open)}
        word={dictionaryWord}
        sentenceContext={currentCard.exampleSentence}
      />
    </div>
  );
}
