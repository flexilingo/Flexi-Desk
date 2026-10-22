import { speak, stop } from '@/lib/speech';
import { voiceFor } from '@/components/WordDialog/pronounce';

/**
 * Reads study text aloud through the shared voice stack, in the learner's chosen
 * voice for that language (the region picked in Pronunciation settings: fr-CA,
 * en-GB ...) and, for English, the American or British accent. Resolves when the
 * sound ENDS — the run loop and the card both depend on that.
 */
export function speakStudy(
  text: string,
  language: string,
  accent: 'us' | 'uk' = 'us',
): Promise<void> {
  if (!text?.trim()) return Promise.resolve();
  return speak(text, voiceFor(language) ?? language, { accent });
}

export { stop as stopStudySpeech };
