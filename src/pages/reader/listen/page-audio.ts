import { tokenize } from '@/components/lookup/tokenize';
import type { LibraryPageAudio } from '../services/libraryService';

/**
 * A page's pre-generated, multi-voice narration, as pure functions — the website's
 * `playPreGeneratedPage` (listen-engine.ts) in the desk's terms.
 *
 * When a library page comes with `audio`, the player plays that ONE file instead of asking the
 * voice for the page sentence by sentence: the file's own per-word timing says which word is
 * being said (exact, not estimated), next / previous seek inside the same file, and the bar's
 * line follows the file's real time.
 *
 * `word_timing` is flat, in the page's reading order — one entry per WORD token of `tokenize`
 * (spaces and punctuation are tokens too, and are never counted), sentence after sentence in
 * the order `pageSentences` gives them: the n-th entry is the n-th word span on the page.
 *
 * Where the narrator says a word differently from how the page writes it («2 $» is said «deux
 * dollars»: two timed words for one written), the entries are matched back to the page's words
 * by their letters, so the words after it are not marked one off.
 */

/** Where a word of the page is: its sentence (the player's index) and its place among that sentence's words. */
export interface WordPlace {
  sentence: number;
  word: number;
}

export interface PageAudioTrack {
  url: string;
  /** The file's length as the server measured it (the element's own, once loaded, is preferred). */
  duration: number;
  /** When each timed word starts, in the file's order. */
  starts: number[];
  /** The page word each timed word is (by index into `starts`). */
  places: WordPlace[];
  /** The first timed word of each sentence of the page (index into `starts`). */
  sentenceStarts: number[];
}

/**
 * Slack when reading the time back: a seek lands exactly on a word's start, and a clock that reads
 * back a hair earlier must not put the player on the sentence before.
 */
const EPSILON_S = 0.02;

/** How far ahead a word said differently is looked past. */
const LOOKAHEAD = 3;

/** The words of a text — word tokens only (spaces and punctuation are tokens too, never words). */
export const textWords = (text: string): string[] =>
  tokenize(text)
    .filter((t) => t.word)
    .map((t) => t.text);

const letters = (word: string) =>
  word
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Which page word each timed word is. In step while the letters agree; a timed word that is not
 * the page's next one is an extra word of the one before (when the page's next word follows it
 * shortly), a page word the narrator skipped (when the timed word comes shortly after on the
 * page), or the same word said another way.
 */
export function alignWords(page: string[], timed: string[]): number[] {
  const out: number[] = [];
  const same = (i: number, j: number) =>
    i < timed.length && j < page.length && letters(timed[i]) === letters(page[j]);
  let j = 0;
  for (let i = 0; i < timed.length; i++) {
    if (j >= page.length) {
      out.push(page.length - 1);
      continue;
    }
    if (same(i, j)) {
      out.push(j++);
      continue;
    }
    let extra = false;
    for (let k = 1; k <= LOOKAHEAD && !extra; k++) extra = same(i + k, j);
    if (extra && j > 0) {
      out.push(j - 1);
      continue;
    }
    let skipped = 0;
    for (let k = 1; k <= LOOKAHEAD && !skipped; k++) if (same(i, j + k)) skipped = k;
    j += skipped;
    out.push(j++);
  }
  return out;
}

/**
 * The track of a page's pre-generated audio over its sentences, or null when there is none to
 * play (no audio, no address, or no timing) — the page is then read the old way.
 */
export function pageAudioTrack(
  sentences: ReadonlyArray<{ text: string }>,
  audio: LibraryPageAudio | null | undefined,
): PageAudioTrack | null {
  if (!audio || typeof audio.audio_url !== 'string' || !audio.audio_url) return null;
  const timing = Array.isArray(audio.word_timing) ? audio.word_timing : [];
  if (!timing.length || !sentences.length) return null;
  const words: string[] = [];
  const wordPlaces: WordPlace[] = [];
  sentences.forEach((s, sentence) =>
    textWords(s.text).forEach((w, word) => {
      words.push(w);
      wordPlaces.push({ sentence, word });
    }),
  );
  if (!words.length) return null;
  const places = alignWords(
    words,
    timing.map((w) => String(w.word ?? '')),
  ).map((j) => wordPlaces[j]);
  // A sentence starts at its first timed word; one the narrator never reached, at the last one.
  const sentenceStarts = sentences.map((_, sentence) => {
    const at = places.findIndex((p) => p.sentence >= sentence);
    return at < 0 ? places.length - 1 : at;
  });
  return {
    url: audio.audio_url,
    duration: Number.isFinite(audio.duration_s) && audio.duration_s > 0 ? audio.duration_s : 0,
    starts: timing.map((w) => (Number.isFinite(w.start_s) ? w.start_s : 0)),
    places,
    sentenceStarts,
  };
}

/** The last word whose start is at or before `t` (the timing is in order); 0 before the first. */
export function wordIndexAt(starts: number[], t: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The word being said `t` seconds into the file: its sentence and its place in it. */
export function placeAt(track: PageAudioTrack, t: number): WordPlace | null {
  if (!track.starts.length) return null;
  return track.places[wordIndexAt(track.starts, t + EPSILON_S)] ?? null;
}

/** Where a sentence begins in the file: its first timed word's start. */
export function sentenceStartTime(track: PageAudioTrack, sentence: number): number {
  if (!track.starts.length) return 0;
  const at = track.sentenceStarts[Math.max(0, Math.min(sentence, track.sentenceStarts.length - 1))];
  return track.starts[at ?? 0] ?? 0;
}

/** How far into a sentence the file is, in milliseconds (for Previous: this one again, or the one before). */
export function heardMs(track: PageAudioTrack, sentence: number, t: number): number {
  return Math.max(0, (t - sentenceStartTime(track, sentence)) * 1000);
}
