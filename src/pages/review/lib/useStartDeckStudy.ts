import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStudyStore } from '@/pages/study/stores/studyStore';

export type StudyKind = 'due' | 'early';

/**
 * Start a Study session for one deck and open it. "early" studies ahead of schedule
 * (the website's "review ahead of schedule" / "random review").
 */
export function useStartDeckStudy() {
  const navigate = useNavigate();
  const { t } = useTranslation('decks');
  const startSession = useStudyStore((s) => s.startSession);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (deckId: string, kind: StudyKind = 'due') => {
      setError(null);
      setStarting(`${deckId}:${kind}`);
      const id = await startSession({
        deck_ids: [deckId],
        scope: 'due',
        study_ahead: kind === 'early',
      });
      setStarting(null);
      if (id) navigate(`/study/session/${id}`);
      else {
        const err = useStudyStore.getState().error;
        setError(err === 'NO_CARDS_FOR_SELECTION' ? t('study.noCards') : t('study.startFailed'));
      }
    },
    [navigate, startSession, t],
  );

  return { start, starting, error, clearError: () => setError(null) };
}
