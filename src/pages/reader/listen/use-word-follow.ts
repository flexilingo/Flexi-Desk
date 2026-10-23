import { useEffect } from 'react';
import { getSpeechProgress } from '@/lib/speech';
import { SPOKEN_WORD_CLASSES, spokenWordIndex } from '../text/word-follow';
import { useListenStore } from './listenStore';

/** About twelve times a second: smooth to the eye, nothing to the machine. */
export const WORD_FOLLOW_TICK_MS = 80;

/**
 * The places that show the sentence being read with its words as spans: the page (only while
 * the bar reads that very page — its sentence carries `data-listen-active`) and the bar's own
 * line. The n-th word span of each is the n-th word the voice says.
 */
const PLACES: Array<[host: string, word: string]> = [
  ['[data-listen-active]', '[data-flexi-word]'],
  ['[data-listen-line]', '[data-listen-word]'],
];

/**
 * While the bar plays, marks the word being said — a class on the word's own span, added and
 * taken away straight on the page: no re-render per tick, nothing moves. A voice that cannot say
 * where it is (the system voice) leaves just the sentence marked.
 */
export function useWordFollow(playing: boolean) {
  useEffect(() => {
    if (!playing) return;
    let marked: Element[] = [];
    const mark = (next: Element[]) => {
      for (const el of marked) if (!next.includes(el)) el.classList.remove(...SPOKEN_WORD_CLASSES);
      for (const el of next) if (!marked.includes(el)) el.classList.add(...SPOKEN_WORD_CLASSES);
      marked = next;
    };
    const tick = () => {
      const s = useListenStore.getState();
      const sentence = s.sentences[s.index];
      const at = sentence ? spokenWordIndex(sentence.pieces, s.piece, getSpeechProgress()) : null;
      if (at === null) {
        mark([]);
        return;
      }
      const next: Element[] = [];
      for (const [host, word] of PLACES) {
        const el = document.querySelector(host)?.querySelectorAll(word)[at];
        if (el) next.push(el);
      }
      mark(next);
    };
    tick();
    const timer = setInterval(tick, WORD_FOLLOW_TICK_MS);
    return () => {
      clearInterval(timer);
      mark([]);
    };
  }, [playing]);
}
