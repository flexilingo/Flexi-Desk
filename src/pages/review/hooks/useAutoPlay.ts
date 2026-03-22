import { useEffect, useRef, useState, useCallback } from 'react';
import { useReviewStore } from '../stores/reviewStore';
import { useTTS } from './useTTS';

export function useAutoPlay() {
  const { speak, stop, isSpeaking } = useTTS();

  const {
    currentCard,
    isFlipped,
    isRating,
    reviewSettings,
    flipCard,
    rateCard,
    saveReviewSetting,
    cardQueue,
    queueIndex,
  } = useReviewStore();

  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [isAutoPlayPaused, setIsAutoPlayPaused] = useState(false);
  const [pausedCountdown, setPausedCountdown] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCardIdRef = useRef<string | null>(null);

  const { autoTtsEnabled, autoPronounceEnabled, autoTtsDelaySeconds, ttsVoice } = reviewSettings;

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setAutoAdvanceCountdown(null);
  }, []);

  // Start auto-advance countdown after TTS finishes
  const startCountdown = useCallback((delay: number) => {
    clearTimers();
    setAutoAdvanceCountdown(delay);
    setIsAutoPlayPaused(false);

    let remaining = delay;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setAutoAdvanceCountdown(remaining);
      if (remaining <= 0) {
        clearTimers();
        // Auto-advance: rate "good" (3) by default
        rateCard('good');
      }
    }, 1000);
  }, [clearTimers, rateCard]);

  // On card change: reset and trigger auto-play
  useEffect(() => {
    const cardId = currentCard?.id ?? null;
    if (cardId === prevCardIdRef.current) return;
    prevCardIdRef.current = cardId;

    // Cleanup
    stop();
    clearTimers();
    setIsAutoPlayPaused(false);
    setPausedCountdown(null);

    if (!currentCard || isRating) return;

    const word = currentCard.front;

    if (autoTtsEnabled) {
      // Full auto-play: speak → show answer → countdown → advance
      const timer = setTimeout(() => {
        speak(word, ttsVoice);
        // Show answer after a brief delay
        setTimeout(() => {
          flipCard();
          // Start countdown after TTS finishes
          const ttsCheckInterval = setInterval(() => {
            if (!speechSynthesis.speaking) {
              clearInterval(ttsCheckInterval);
              startCountdown(autoTtsDelaySeconds);
            }
          }, 200);
        }, 500);
      }, 100);
      timeoutRef.current = timer;
    } else if (autoPronounceEnabled) {
      // Pronounce only: speak word, don't show answer
      const timer = setTimeout(() => {
        speak(word, ttsVoice);
      }, 100);
      timeoutRef.current = timer;
    }
  }, [currentCard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      clearTimers();
    };
  }, [stop, clearTimers]);

  const handlePause = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setPausedCountdown(autoAdvanceCountdown);
    setIsAutoPlayPaused(true);
  }, [autoAdvanceCountdown]);

  const handleResume = useCallback(() => {
    const delay = pausedCountdown ?? autoTtsDelaySeconds;
    startCountdown(delay);
    setPausedCountdown(null);
  }, [pausedCountdown, autoTtsDelaySeconds, startCountdown]);

  const handleDisableAutoPlay = useCallback(async () => {
    stop();
    clearTimers();
    setIsAutoPlayPaused(false);
    await saveReviewSetting('autoTtsEnabled', false);
  }, [stop, clearTimers, saveReviewSetting]);

  return {
    speak,
    stop,
    isSpeaking,
    autoAdvanceCountdown,
    isAutoPlayPaused,
    handlePause,
    handleResume,
    handleDisableAutoPlay,
  };
}
