import { tokenize } from '@/components/lookup/tokenize';
import type { SpeechProgress } from '@/lib/speech';

/**
 * Following the voice word by word, as pure functions.
 *
 * A device voice says where it is (its word boundaries: exact). A cloud clip does not, so the
 * word is estimated from how far into the clip the sound is: each word weighs its letters + 2,
 * and the pause after it a little more (a comma ≈ 3, the end of a sentence ≈ 5); the clip's
 * played fraction is laid over those weights. A fraction of the clip follows the speed by
 * itself. The system voice tells nothing — the sentence is marked, no word.
 *
 * Words are the page's own: the word tokens of `tokenize`, the same spans the text shows.
 */

/** One word of a text: where it starts, and how long it takes to say compared with the others. */
export interface SpokenWord {
  start: number;
  weight: number;
}

const COMMA = /[,;:،؛，；：]/;
const STOP = /[.!?。！？…؟]/;

/** The words of a text with their weights (letters + 2, plus the pause after them). */
export function spokenWords(text: string): SpokenWord[] {
  const out: SpokenWord[] = [];
  let at = 0;
  for (const token of tokenize(text)) {
    if (token.word) {
      const letters = token.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
      out.push({ start: at, weight: letters + 2 });
    } else if (out.length) {
      const last = out[out.length - 1];
      if (STOP.test(token.text)) last.weight += 5;
      else if (COMMA.test(token.text)) last.weight += 3;
    }
    at += token.text.length;
  }
  return out;
}

/** The word being said `fraction` (0–1) of the way through, on the cumulative weights; -1 for none. */
export function wordAtFraction(weights: number[], fraction: number): number {
  if (!weights.length) return -1;
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) return 0;
  const target = Math.min(Math.max(Number.isFinite(fraction) ? fraction : 0, 0), 1) * total;
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    if (target < sum) return i;
  }
  return weights.length - 1;
}

/** The word at a character offset — where a device voice says it is; -1 for none. */
export function wordAtChar(words: SpokenWord[], charIndex: number): number {
  let found = words.length ? 0 : -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= charIndex) found = i;
    else break;
  }
  return found;
}

const wordCount = (texts: string[]) => texts.reduce((n, t) => n + spokenWords(t).length, 0);

/**
 * Which word of a sentence is being said: the words of the pieces before the one being said,
 * plus the word the voice is on within it. Null when the voice is not saying this piece (another
 * voice, nothing yet) or cannot tell (the system voice).
 */
export function spokenWordIndex(
  pieces: string[],
  piece: number,
  progress: SpeechProgress | null,
): number | null {
  const text = pieces[piece]?.trim();
  if (!progress || !text || progress.text !== text) return null;
  const before = wordCount(pieces.slice(0, piece));

  if (progress.engine === 'device') {
    const at = wordAtChar(spokenWords(progress.text), progress.charIndex);
    return at < 0 ? null : before + at;
  }
  if (progress.engine === 'cloud') {
    const chunk = progress.chunks[progress.chunkIndex];
    if (chunk === undefined) return null;
    const at = wordAtFraction(
      spokenWords(chunk).map((w) => w.weight),
      progress.fraction,
    );
    return at < 0 ? null : before + wordCount(progress.chunks.slice(0, progress.chunkIndex)) + at;
  }
  return null;
}

/**
 * What marks the word being said: an olive tint on the word itself (nothing moves) — the site's
 * and the phone's `olive-500/30` with `olive-700` text, here in the theme's olive so the dark
 * theme keeps it legible. Terra stays for the one action on the page.
 */
export const SPOKEN_WORD_CLASSES = ['bg-primary-light/30', 'text-primary'];

/**
 * What marks the sentence being said — only when the voice cannot say where its words are (the
 * system voice). With a word marked, a tinted sentence around it would be a highlight inside a
 * highlight.
 */
export const SPOKEN_SENTENCE_CLASSES = ['bg-primary/[0.11]'];
