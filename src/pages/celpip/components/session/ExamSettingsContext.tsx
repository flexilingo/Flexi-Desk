import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSetting, setSetting } from '@/lib/tauri-bridge';

/**
 * User-adjustable exam text size.
 *
 * The scale multiplies the base font size of every piece of *content* text in the
 * exam — questions, options, passages, prompts, transcripts. Chrome (timers,
 * badges, section labels) stays fixed, so the layout can never break at 1.5×.
 *
 * Ported from `flexi-lingo-mobile`'s `ExamSettingsContext`, which is the only app
 * that had this: neither the web app nor this one did. Persisted to the `settings`
 * table so the choice sticks across sessions.
 */

export const FONT_SCALE_STEPS = [0.9, 1, 1.15, 1.32, 1.5] as const;
export type FontScale = (typeof FONT_SCALE_STEPS)[number];

/** Exam text felt tiny at 1.0, so mobile starts a notch larger. Same here. */
export const DEFAULT_FONT_SCALE: FontScale = 1.15;

const SETTINGS_KEY = 'celpip_exam_font_scale';

function isValidScale(v: number): v is FontScale {
  return (FONT_SCALE_STEPS as readonly number[]).includes(v);
}

interface ExamSettings {
  fontScale: number;
  setFontScale: (scale: number) => void;
}

const ExamSettingsContext = createContext<ExamSettings>({
  fontScale: DEFAULT_FONT_SCALE,
  setFontScale: () => {},
});

export function ExamSettingsProvider({ children }: { children: ReactNode }) {
  const [fontScale, setScale] = useState<number>(DEFAULT_FONT_SCALE);

  useEffect(() => {
    let cancelled = false;
    getSetting(SETTINGS_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = Number(raw);
        // A hand-edited or stale row must not put the exam at an unreadable size.
        if (isValidScale(parsed)) setScale(parsed);
      })
      .catch(() => {
        /* the default is a fine answer */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setFontScale = useCallback((scale: number) => {
    if (!isValidScale(scale)) return;
    // Apply first: resizing must feel instant. A failed write only means the
    // choice doesn't outlive this session.
    setScale(scale);
    void setSetting(SETTINGS_KEY, String(scale)).catch(() => {});
  }, []);

  return (
    <ExamSettingsContext.Provider value={{ fontScale, setFontScale }}>
      {children}
    </ExamSettingsContext.Provider>
  );
}

export function useExamSettings(): ExamSettings {
  return useContext(ExamSettingsContext);
}

export function useExamFontScale(): number {
  return useContext(ExamSettingsContext).fontScale;
}
