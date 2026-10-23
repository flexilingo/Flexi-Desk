import { useCallback, useEffect, useRef, useState } from 'react';
import { speakThrough, stop as stopSpeech } from '@/lib/speech';
import {
  firstMove,
  nextMove,
  pagePieces,
  type ListenAt,
  type ListenFacts,
  type ListenMove,
} from './listen-sequence';
import type { ReaderPagerState } from './useReaderPager';

export type ListenStatus = 'idle' | 'playing' | 'paused';

/** Why the player stopped in a way the reader can do something about. */
export type ListenInvite = 'signIn' | 'pro';

/**
 * The «Listen» player of a library book: reads the page on screen paragraph by paragraph,
 * turns to the next page by itself (Pro) and goes on until the book ends.
 *
 * One voice at a time: the player speaks through the app's voice stack, so anything else
 * that speaks — a paragraph's speaker, a tapped word — cuts it off, and the player then
 * stops rather than talking over it or picking up again later. Pause keeps the place; Resume
 * says the interrupted piece again from its start. Turning the page by hand while it plays
 * reads the new page from its top. Leaving the page stops it.
 */
export function usePageListen({
  pager,
  language,
  enabled,
  signedIn,
  pro,
}: {
  pager: ReaderPagerState;
  language: string;
  /** Off while the page cannot be read here (the sign-in gate) or for other kinds of text. */
  enabled: boolean;
  signedIn: boolean;
  pro: boolean;
}) {
  const [status, setStatus] = useState<ListenStatus>('idle');
  /** The paragraph being read (or paused on), for the soft highlight. */
  const [active, setActive] = useState<number | null>(null);
  const [invite, setInvite] = useState<ListenInvite | null>(null);
  const at = useRef<ListenAt & { page: number }>({ page: 0, paragraph: 0, chunk: 0 });
  /** Every start, pause, stop and page bumps it: a loop that sees a newer one is over. */
  const run = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  // The page-end rule and the page turn read the latest facts, not the ones the loop began with.
  const facts = useRef<ListenFacts & { next: () => void }>({
    hasNext: false,
    signedIn,
    pro,
    next: pager.next,
  });
  facts.current = { hasNext: pager.hasNext, signedIn, pro, next: pager.next };

  const ready = enabled && !pager.isLoading && !pager.error && pager.text.trim() !== '';

  const end = useCallback((move: ListenMove) => {
    run.current += 1;
    setStatus('idle');
    setActive(null);
    if (move.kind === 'stop' && (move.reason === 'signIn' || move.reason === 'pro')) {
      setInvite(move.reason);
    }
  }, []);

  // A new page (turned by the player or by hand) is read from its top; a paused player waits there.
  useEffect(() => {
    if (at.current.page === pager.page) return;
    if (statusRef.current === 'paused') {
      at.current = { page: pager.page, paragraph: 0, chunk: 0 };
      setActive(null);
    }
    setInvite(null);
  }, [pager.page]);

  // The reading loop for the page on screen.
  useEffect(() => {
    if (status !== 'playing' || !ready) return;
    if (at.current.page !== pager.page) at.current = { page: pager.page, paragraph: 0, chunk: 0 };
    const id = ++run.current;
    const page = pager.page;
    const pieces = pagePieces(pager.text);
    let move = firstMove(pieces, at.current, facts.current);
    void (async () => {
      while (run.current === id) {
        if (move.kind === 'speak') {
          const here = move.at;
          at.current = { page, ...here };
          setActive(here.paragraph);
          const outcome = await speakThrough(pieces[here.paragraph][here.chunk], language);
          if (run.current !== id) return;
          move = nextMove(pieces, here, outcome, facts.current);
        } else if (move.kind === 'turn') {
          // The next page restarts this loop once it is on screen.
          at.current = { page: page + 1, paragraph: 0, chunk: 0 };
          setActive(null);
          facts.current.next();
          return;
        } else {
          end(move);
          return;
        }
      }
    })();
  }, [status, ready, pager.page, pager.text, language, end]);

  // A page that will not load ends the reading; the page says what went wrong.
  useEffect(() => {
    if (pager.error && statusRef.current === 'playing') end({ kind: 'stop', reason: 'silent' });
  }, [pager.error, end]);

  // Leaving the page (or the book) stops the voice.
  useEffect(
    () => () => {
      if (statusRef.current !== 'idle') {
        run.current += 1;
        stopSpeech();
      }
    },
    [],
  );

  const start = useCallback(() => {
    setInvite(null);
    at.current = { page: pager.page, paragraph: 0, chunk: 0 };
    setStatus('playing');
  }, [pager.page]);

  const pause = useCallback(() => {
    run.current += 1;
    stopSpeech();
    setStatus('paused');
  }, []);

  const resume = useCallback(() => setStatus('playing'), []);

  const stop = useCallback(() => {
    run.current += 1;
    stopSpeech();
    setStatus('idle');
    setActive(null);
  }, []);

  return {
    status,
    /** The paragraph to highlight; null when nothing is being read. */
    active: status === 'idle' ? null : active,
    invite,
    dismissInvite: () => setInvite(null),
    available: ready,
    start,
    pause,
    resume,
    stop,
  };
}

export type PageListen = ReturnType<typeof usePageListen>;
