import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStudyStore } from '@/pages/study/stores/studyStore';

/** Starts a review session (all due cards, or one deck) and opens it; the error stays inline. */
export function useStartStudy() {
  const navigate = useNavigate();
  const { t } = useTranslation('study');
  const startSession = useStudyStore((s) => s.startSession);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const startStudy = useCallback(
    async (deckId?: string) => {
      setStarting(deckId ?? 'all');
      setStartError(null);
      const id = await startSession({ deck_ids: deckId ? [deckId] : undefined });
      if (id) {
        navigate(`/study/session/${id}`);
        return;
      }
      const code = useStudyStore.getState().error;
      const key = `errors.${code}`;
      const text = code ? t(key) : '';
      setStartError(
        !code ? t('errors.UNKNOWN_ERROR') : text === key ? t('errors.UNKNOWN_ERROR') : text,
      );
      setStarting(null);
    },
    [navigate, startSession, t],
  );

  return { startStudy, starting, startError };
}
