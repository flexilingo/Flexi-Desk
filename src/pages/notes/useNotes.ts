import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { errorCode, loadAccountNotes, loadLocalNotes } from './notesApi';
import { fromAccount, fromLocal, type UnifiedNote } from './notesLogic';

interface Part {
  notes: UnifiedNote[];
  error: string | null;
}

/**
 * Every note the user wrote, from both places, kept apart until the page merges them: a
 * failure in one place must not hide the other, and each note remembers where it lives.
 */
export function useNotes() {
  const signedIn = !!useAuthStore((s) => s.session);
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<Part>({ notes: [], error: null });
  const [account, setAccount] = useState<Part>({ notes: [], error: null });

  const reload = useCallback(async () => {
    const [d, a] = await Promise.allSettled([
      loadLocalNotes(),
      signedIn ? loadAccountNotes() : Promise.resolve(null),
    ]);
    setDevice(
      d.status === 'fulfilled'
        ? { notes: d.value.map(fromLocal), error: null }
        : { notes: [], error: errorCode(d.reason) },
    );
    if (!signedIn) setAccount({ notes: [], error: null });
    else
      setAccount(
        a.status === 'fulfilled'
          ? { notes: (a.value ?? []).map(fromAccount), error: null }
          : { notes: [], error: errorCode(a.reason) },
      );
    setLoading(false);
  }, [signedIn]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const notes = useMemo(() => [...device.notes, ...account.notes], [device.notes, account.notes]);
  return {
    notes,
    loading,
    signedIn,
    deviceError: device.error,
    accountError: account.error,
    reload,
  };
}
