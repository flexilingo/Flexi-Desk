import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTOSAVE_DELAY_MS } from './session';

export type AutosaveStatus = 'idle' | 'saving' | 'saved';

/**
 * Saves the draft 3 seconds after the last keystroke (the website's rule). A save still
 * waiting when the screen closes is written straight away, so leaving never loses words.
 */
export function useAutosave(save: (text: string) => Promise<void>, delay = AUTOSAVE_DELAY_MS) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async (text: string, quiet: boolean) => {
    if (!quiet) setStatus('saving');
    try {
      await saveRef.current(text);
      if (!quiet) {
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      }
    } catch {
      if (!quiet) setStatus('idle');
    }
  }, []);

  const schedule = useCallback(
    (text: string) => {
      pending.current = text;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        pending.current = null;
        void run(text, false);
      }, delay);
    },
    [delay, run],
  );

  /** Drops the waiting save (the essay is being submitted with its text anyway). */
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) void run(pending.current, true);
    },
    [run],
  );

  return { status, schedule, cancel };
}
