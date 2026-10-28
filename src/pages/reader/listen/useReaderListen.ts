import { useEffect, useRef, useState } from 'react';
import type { ReaderPagerState } from '../text/useReaderPager';
import { pageSentences, sentenceOfParagraph, type ListenPlace } from '../text/listen-sequence';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { listenStart } from './listen-access';
import {
  getListenPlace,
  listenAccessFacts,
  useListenStore,
  type ListenSource,
} from './listenStore';

/**
 * A reader page and the «Listen» player, kept together while both are on the same book: the
 * reader turns to the page the player is reading, the player reads the page the reader turned
 * to, the sentence being read is the one marked in the text, and the toolbar offers to continue
 * where listening was left in this book.
 */
export function useReaderListen({
  source,
  pager,
  enabled,
}: {
  /** The book on this page; null where there is no player (other kinds of text). */
  source: ListenSource | null;
  pager: ReaderPagerState;
  /** Off while the page cannot be read here (the sign-in gate). */
  enabled: boolean;
}) {
  const bookId = source?.bookId ?? null;
  const active = useListenStore((s) => !!bookId && s.source?.bookId === bookId);
  const page = useListenStore((s) => s.page);
  const sentences = useListenStore((s) => s.sentences);
  const index = useListenStore((s) => s.index);
  const status = useListenStore((s) => s.status);
  const invite = useListenStore((s) => s.invite);
  const ready = enabled && !!source && !pager.isLoading && !pager.error && pager.text.trim() !== '';
  // The access rule, re-read whenever the session or the plan changes (the voice is read fresh).
  useAuthStore((s) => `${s.isLoading}:${!!s.session}`);
  useSubscriptionStore((s) => `${s.hasResolved}:${s.subscription?.tier ?? ''}`);
  const access = source ? listenStart(listenAccessFacts(source)) : 'wait';

  // Where listening was left in this book — asked again whenever the bar closes on it.
  const [place, setPlace] = useState<ListenPlace | null>(null);
  useEffect(() => {
    if (!bookId || active) return;
    let live = true;
    void getListenPlace(bookId).then((p) => live && setPlace(p));
    return () => {
      live = false;
    };
  }, [bookId, active]);

  // The bar knows this book's text is on screen (it then leaves out its own sentence line).
  useEffect(() => {
    if (!bookId) return;
    const store = useListenStore.getState();
    store.setReaderOpen(bookId);
    return () => {
      if (useListenStore.getState().readerOpen === bookId) store.setReaderOpen(null);
    };
  }, [bookId]);

  const latest = useRef({ pager, source, ready });
  latest.current = { pager, source, ready };

  // The player moved to another page (it turned it, or it was opened on a remembered one): the
  // reader goes there too.
  const playerPage = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      playerPage.current = null;
      return;
    }
    const moved = playerPage.current !== page;
    playerPage.current = page;
    const { pager: p } = latest.current;
    if (moved && p.page !== page) p.goTo(page);
  }, [active, page]);

  // The reader turned the page by hand: the player reads that page (from its top).
  const readerPage = useRef(pager.page);
  useEffect(() => {
    const turned = readerPage.current !== pager.page;
    readerPage.current = pager.page;
    const { pager: p, ready: r } = latest.current;
    if (!turned || !active || !r) return;
    const player = useListenStore.getState();
    if (player.page !== p.page) {
      player.follow({
        page: p.page,
        text: p.text,
        hasNext: p.hasNext,
        pageCount: p.total,
        audio: p.audio,
      });
    }
  }, [pager.page, active]);

  const here = active && page === pager.page;
  const current = here ? sentences[index] : undefined;

  /** Starts the bar on this book at a sentence (of the page on screen, unless another page is named). */
  const start = (sentence: number, at: number = pager.page) => {
    const { source: s, pager: p, ready: r } = latest.current;
    if (!s) return;
    const store = useListenStore.getState();
    if (at === p.page && r) {
      store.start(s, {
        page: at,
        sentence,
        text: p.text,
        hasNext: p.hasNext,
        pageCount: p.total,
        audio: p.audio,
      });
    } else {
      store.start(s, { page: at, sentence });
    }
  };

  return {
    /** The bar is reading (or paused on) this book. */
    active,
    /** Where the bar is in this book: the sentence of the page it reads. */
    position: active && sentences.length ? { n: index + 1, total: sentences.length, page } : null,
    /** The page on screen can be read aloud. */
    ready,
    /** The player on this book: play, locked until the reader signs up, or not known yet. */
    access,
    status,
    /** The sentence marked in the text: on this page, while the bar is on this book. */
    activeSentence: current ? { paragraph: current.paragraph, sentence: current.sentence } : null,
    /** The paragraph whose «play from here» shows as playing. */
    activeParagraph: current ? current.paragraph : null,
    /** Stopped at the end of this page for an account or Pro. */
    invite: here ? invite : null,
    /** A remembered place worth continuing from (anything past the very start). */
    place: place && (place.page > 1 || place.sentence > 0) ? place : null,
    start,
    continueFromPlace: () => place && start(place.sentence, place.page),
    /** «Play from here» on a paragraph of the page on screen. */
    playFromParagraph: (paragraph: number) => {
      const store = useListenStore.getState();
      if (here) {
        store.jump(sentenceOfParagraph(store.sentences, paragraph));
        return;
      }
      start(sentenceOfParagraph(pageSentences(latest.current.pager.text), paragraph));
    },
    playPause: () => useListenStore.getState().playPause(),
    dismissInvite: () => useListenStore.getState().dismissInvite(),
  };
}

export type ReaderListen = ReturnType<typeof useReaderListen>;
