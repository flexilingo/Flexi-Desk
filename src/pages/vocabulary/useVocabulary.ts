import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { errorCode } from '@/pages/notes/notesApi';
import { loadAccountWords, loadLocalWords } from './vocabApi';
import { mergeWords, type AccountWordRow, type LocalWordRow } from './vocabLogic';

/** The word store and the account history, loaded apart (one failing leaves the other) and merged. */
export function useVocabulary() {
  const signedIn = !!useAuthStore((s) => s.session);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState<LocalWordRow[]>([]);
  const [account, setAccount] = useState<AccountWordRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [l, a] = await Promise.allSettled([
      loadLocalWords(),
      signedIn ? loadAccountWords() : Promise.resolve([] as AccountWordRow[]),
    ]);
    if (l.status === 'fulfilled') {
      setLocal(l.value);
      setLocalError(null);
    } else {
      setLocal([]);
      setLocalError(errorCode(l.reason));
    }
    if (a.status === 'fulfilled') {
      setAccount(a.value);
      setAccountError(null);
    } else {
      setAccount([]);
      setAccountError(errorCode(a.reason));
    }
    setLoading(false);
  }, [signedIn]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const items = useMemo(() => mergeWords(local, account), [local, account]);
  return { items, loading, signedIn, localError, accountError, reload };
}
