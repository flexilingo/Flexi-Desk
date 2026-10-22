import { createContext, useCallback, useContext } from 'react';
import { speakStudy, stopStudySpeech } from '../lib/studySpeak';

/** What the session reads aloud in: the deck's language, and the English accent the learner chose. */
export interface StudySpeechSettings {
  /** Language of the card on screen (the deck's). */
  language: string;
  accent: 'us' | 'uk';
}

export const StudySpeechContext = createContext<StudySpeechSettings>({
  language: 'en',
  accent: 'us',
});

/**
 * Speaks text through the shared voice stack: the cloud voice when signed in, else the
 * best device voice, else the OS / OpenAI voice from Rust — in the language of the deck
 * being studied (every language the stack can speak), never blindly in English.
 * Failures are non-fatal — audio is an enhancement, never a blocker for an activity.
 */
export function useSpeak() {
  const settings = useContext(StudySpeechContext);
  const speak = useCallback(
    (text: string, language?: string) => {
      if (!text?.trim()) return Promise.resolve();
      return speakStudy(text, language ?? settings.language, settings.accent);
    },
    [settings.language, settings.accent],
  );
  const stop = useCallback(() => stopStudySpeech(), []);
  return { speak, stop, language: settings.language, accent: settings.accent };
}
