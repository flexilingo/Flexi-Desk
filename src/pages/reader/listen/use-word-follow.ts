import { useEffect, useRef } from 'react';
import { getSpeechProgress } from '@/lib/speech';
import { SPOKEN_SENTENCE_CLASSES, SPOKEN_WORD_CLASSES, spokenWordIndex } from '../text/word-follow';
import { useListenStore } from './listenStore';

/** About twelve times a second: smooth to the eye, nothing to the machine. */
export const WORD_FOLLOW_TICK_MS = 80;

/** The sentence being read on the page — flagged only while the bar reads that very page. */
const PAGE_SENTENCE = '[data-listen-active]';

/**
 * The places that show the sentence being read with its words as spans: the page and the bar's
 * own line. The n-th word span of each is the n-th word the voice says.
 */
const PLACES: Array<[host: string, word: string]> = [
  [PAGE_SENTENCE, '[data-flexi-word]'],
  ['[data-listen-line]', '[data-listen-word]'],
];

/**
 * While the bar plays, marks the word being said — a class on the word's own span, added and
 * taken away straight on the page: no re-render per tick, nothing moves. A voice that cannot say
 * where its words are (the system voice) marks the sentence instead.
 *
 * Paused, the last word stays marked (the place the reader will come back to); between two
 * sentences, while the next one is being fetched, the last mark waits for the next. Closing the
 * bar takes every mark away.
 */
export function useWordFollow(open: boolean, playing: boolean) {
  const words = useRef<Element[]>([]);
  const sentence = useRef<Element | null>(null);

  const markWords = (next: Element[]) => {
    for (const el of words.current) {
      if (!next.includes(el)) el.classList.remove(...SPOKEN_WORD_CLASSES);
    }
    for (const el of next) {
      if (!words.current.includes(el)) el.classList.add(...SPOKEN_WORD_CLASSES);
    }
    words.current = next;
  };
  const markSentence = (next: Element | null) => {
    if (sentence.current === next) return;
    sentence.current?.classList.remove(...SPOKEN_SENTENCE_CLASSES);
    next?.classList.add(...SPOKEN_SENTENCE_CLASSES);
    sentence.current = next;
  };
  const latest = useRef({ markWords, markSentence });
  latest.current = { markWords, markSentence };

  // The bar closed (or went away): no marks left behind.
  useEffect(() => {
    if (open) return;
    latest.current.markWords([]);
    latest.current.markSentence(null);
  }, [open]);
  useEffect(
    () => () => {
      latest.current.markWords([]);
      latest.current.markSentence(null);
    },
    [],
  );

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const { markWords: setWords, markSentence: setSentence } = latest.current;
      const s = useListenStore.getState();
      const current = s.sentences[s.index];
      const progress = getSpeechProgress();
      // Nothing sounding yet (the next clip on its way), or another voice: keep what is marked.
      if (!current || !progress || progress.text !== current.pieces[s.piece]?.trim()) return;
      if (progress.engine === 'system') {
        setWords([]);
        setSentence(document.querySelector(PAGE_SENTENCE));
        return;
      }
      const at = spokenWordIndex(current.pieces, s.piece, progress);
      if (at === null) return;
      setSentence(null);
      const next: Element[] = [];
      for (const [host, word] of PLACES) {
        const el = document.querySelector(host)?.querySelectorAll(word)[at];
        if (el) next.push(el);
      }
      setWords(next);
    };
    tick();
    const timer = setInterval(tick, WORD_FOLLOW_TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);
}
