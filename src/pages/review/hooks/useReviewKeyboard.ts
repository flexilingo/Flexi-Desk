import { useEffect } from 'react';
import { useReviewStore } from '../stores/reviewStore';

export function useReviewKeyboard() {
  const isFlipped = useReviewStore((s) => s.isFlipped);
  const flipCard = useReviewStore((s) => s.flipCard);
  const rateCard = useReviewStore((s) => s.rateCard);
  const isRating = useReviewStore((s) => s.isRating);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (!isFlipped) flipCard();
        return;
      }

      if (!isFlipped || isRating) return;

      switch (e.key) {
        case '1':
          rateCard('again');
          break;
        case '2':
          rateCard('again');
          break;
        case '3':
          rateCard('hard');
          break;
        case '4':
          rateCard('good');
          break;
        case '5':
          rateCard('easy');
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, flipCard, rateCard, isRating]);
}
