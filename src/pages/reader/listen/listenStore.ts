import { create } from 'zustand';
import { adjustSpeech, prefetchSpeech, speakThrough, stop as stopSpeech } from '@/lib/speech';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useAuthStore } from '@/stores/authStore';
import { isPaidTier, useSubscriptionStore } from '@/stores/subscriptionStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { getLibraryPage, getPublicLibraryPage, type LibraryPage } from '../services/libraryService';
import { isLoginGated } from '../library/series';
import {
  afterSentence,
  clampSentence,
  firstMove,
  listenPlaceKey,
  nextRate,
  pageSentences,
  parseListenPlace,
  stepNext,
  stepPrev,
  type ListenFacts,
  type ListenMove,
  type ListenPlace,
  type ListenRate,
  type PageSentence,
} from '../text/listen-sequence';

/**
 * The «Listen» player of a library book — a source of the app's one player bar, beside the
 * podcast, the video and the textbook recording (see `MiniPlayer`): starting it stops whatever
 * else the bar held, and a podcast starting closes it.
 *
 * It reads sentence by sentence through the app's voice stack (the paragraph speakers' voice),
 * the next sentence fetched ahead when the cloud voice is speaking. It holds its own page — the
 * text, fetched through the library service — so it goes on when the reader leaves the book,
 * and the reader follows it (and it follows the reader) while both are on the same book.
 *
 * One voice at a time: anything else that speaks (a word being said) cuts the sentence off, and
 * the player pauses there rather than talking over it.
 */

export interface ListenSource {
  bookId: string;
  title: string;
  /** "The Tuesday Class · Season 2 · Episode 3", or the author. */
  subtitle: string;
  language: string;
  coverPath: string | null;
  /** A later season: signed out, only page 1 can be read. */
  requiresLogin: boolean;
}

export type ListenStatus = 'loading' | 'playing' | 'paused';

/** Reading stopped at the end of a page: going on needs an account, or Pro. */
export type ListenInvite = 'signIn' | 'pro';

interface ListenState {
  source: ListenSource | null;
  page: number;
  pageCount: number;
  hasNext: boolean;
  sentences: PageSentence[];
  /** The sentence being read (or paused on). */
  index: number;
  /** Which piece of that sentence the voice is saying (a very long sentence is said in pieces). */
  piece: number;
  status: ListenStatus;
  rate: ListenRate;
  volume: number;
  /** Say the same sentence again and again until switched off. */
  repeat: boolean;
  /** Stopped at the end of a page for an account, or for Pro. */
  invite: ListenInvite | null;
  /** No voice could say the sentence, or the page would not load. */
  problem: 'silent' | 'page' | null;
  /** The book whose reader page is open right now (its text is on screen), if any. */
  readerOpen: string | null;

  /** Opens the bar on a book at a page and sentence and starts reading. */
  start: (
    source: ListenSource,
    at: { page: number; sentence: number; text?: string; hasNext?: boolean; pageCount?: number },
  ) => void;
  playPause: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  /** Read from this sentence of the page. */
  jump: (index: number) => void;
  toggleRepeat: () => void;
  cycleRate: () => void;
  setVolume: (volume: number) => void;
  /** The reader turned the page by hand: read that page from its top (still paused if paused). */
  follow: (at: { page: number; text: string; hasNext: boolean; pageCount: number }) => void;
  dismissInvite: () => void;
  close: () => void;
  /** A book's reader page opened (its id) or closed (null). */
  setReaderOpen: (bookId: string | null) => void;
}

/** Every start, pause, page and close bumps it: a reading that sees a newer one is over. */
let run = 0;
/** When the sentence being read began, for Previous (again, or the one before). */
let startedAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DELAY_MS = 800;

export const useListenStore = create<ListenState>()((set, get) => {
  const facts = (): ListenFacts => {
    const s = get();
    const signedIn = !!useAuthStore.getState().session;
    return {
      hasNext: s.hasNext,
      hasPrev: s.page > 1,
      signedIn,
      pro: signedIn && isPaidTier(useSubscriptionStore.getState().subscription?.tier),
    };
  };

  const voice = () => ({ rate: get().rate, volume: get().volume, cache: true });

  /** Where the reader left off, kept per book (written a moment after the sentence changes). */
  const savePlace = (now = false) => {
    const s = get();
    if (!s.source) return;
    const key = listenPlaceKey(s.source.bookId);
    const value = JSON.stringify({ page: s.page, sentence: s.index } satisfies ListenPlace);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const write = () => void setSetting(key, value).catch(() => {});
    if (now) write();
    else saveTimer = setTimeout(write, SAVE_DELAY_MS);
  };

  const fetchPage = (source: ListenSource, page: number): Promise<LibraryPage> => {
    if (useAuthStore.getState().session) return getLibraryPage(source.bookId, page);
    if (isLoginGated({ requires_login: source.requiresLogin }, page, false)) {
      return Promise.reject({ code: 'LOGIN_REQUIRED' });
    }
    return getPublicLibraryPage(source.bookId, page);
  };

  const halt = (patch: Partial<ListenState> = {}) => {
    run += 1;
    set({ status: 'paused', ...patch });
  };

  const apply = (move: ListenMove) => {
    if (move.kind === 'speak') void speakAt(move.index);
    else if (move.kind === 'turn') void openPage(get().page + 1, 0, true);
    else if (move.kind === 'back') void openPage(get().page - 1, 'last', true);
    else
      halt({
        invite: move.reason === 'signIn' || move.reason === 'pro' ? move.reason : null,
        problem: move.reason === 'silent' ? 'silent' : null,
      });
  };

  async function speakAt(index: number) {
    const id = ++run;
    const s = get();
    const sentence = s.sentences[index];
    if (!s.source || !sentence) return;
    const language = s.source.language;
    set({ index, piece: 0, status: 'playing', invite: null, problem: null });
    startedAt = Date.now();
    savePlace();
    // The next sentence, fetched while this one is said.
    for (const piece of s.sentences[index + 1]?.pieces ?? [])
      prefetchSpeech(piece, language, voice());

    for (const [k, piece] of sentence.pieces.entries()) {
      if (k > 0) set({ piece: k });
      const outcome = await speakThrough(piece, language, voice());
      if (run !== id) return;
      if (outcome !== 'ended') {
        apply(afterSentence(index, get().sentences.length, outcome, false, facts()));
        return;
      }
    }
    apply(afterSentence(index, get().sentences.length, 'ended', get().repeat, facts()));
  }

  async function openPage(page: number, at: number | 'last', play: boolean) {
    const id = ++run;
    const source = get().source;
    if (!source) return;
    stopSpeech();
    set({ status: 'loading', invite: null, problem: null });
    try {
      const loaded = await fetchPage(source, page);
      if (run !== id || get().source?.bookId !== source.bookId) return;
      const sentences = pageSentences(loaded.content);
      set({
        page: loaded.page_number || page,
        pageCount: loaded.page_count,
        hasNext: loaded.has_next,
        sentences,
        index: clampSentence(at, sentences.length),
      });
      if (play) apply(firstMove(get().index, sentences.length, facts()));
      else halt();
    } catch (cause) {
      if (run !== id) return;
      const code = (cause as { code?: string } | null)?.code;
      halt(code === 'LOGIN_REQUIRED' ? { invite: 'signIn' } : { problem: 'page' });
    }
  }

  return {
    source: null,
    page: 1,
    pageCount: 1,
    hasNext: false,
    sentences: [],
    index: 0,
    piece: 0,
    status: 'paused',
    rate: 1,
    volume: 1,
    repeat: false,
    invite: null,
    problem: null,
    readerOpen: null,

    start: (source, at) => {
      // One player: a podcast, a video or a recording in the bar gives way.
      const player = usePlayerStore.getState();
      if (player.currentEpisode) player.stop();
      if (get().source && get().source?.bookId !== source.bookId) savePlace(true);
      set({ source, invite: null, problem: null });
      if (at.text === undefined) {
        set({ page: at.page });
        void openPage(at.page, at.sentence, true);
        return;
      }
      const sentences = pageSentences(at.text);
      set({
        page: at.page,
        pageCount: at.pageCount ?? 1,
        hasNext: at.hasNext ?? false,
        sentences,
        index: clampSentence(at.sentence, sentences.length),
      });
      apply(firstMove(get().index, sentences.length, facts()));
    },

    playPause: () => {
      const s = get();
      if (!s.source) return;
      if (s.status !== 'paused') {
        get().pause();
        return;
      }
      // Resume says the sentence again from its start; a page that never loaded is asked again.
      if (s.sentences.length && s.problem !== 'page') void speakAt(s.index);
      else void openPage(s.page, s.index, true);
    },

    pause: () => {
      halt();
      stopSpeech();
    },

    next: () => {
      const s = get();
      if (!s.source || s.status === 'loading') return;
      apply(stepNext(s.index, s.sentences.length, facts()));
    },

    prev: () => {
      const s = get();
      if (!s.source || s.status === 'loading') return;
      const heard = s.status === 'playing' ? Date.now() - startedAt : 0;
      apply(stepPrev(s.index, heard, facts()));
    },

    jump: (index) => {
      const s = get();
      if (!s.source || !s.sentences.length) return;
      void speakAt(clampSentence(index, s.sentences.length));
    },

    toggleRepeat: () => set((s) => ({ repeat: !s.repeat })),

    cycleRate: () => {
      const rate = nextRate(get().rate);
      set({ rate });
      adjustSpeech({ rate });
    },

    setVolume: (volume) => {
      set({ volume });
      adjustSpeech({ volume });
    },

    follow: ({ page, text, hasNext, pageCount }) => {
      const s = get();
      if (!s.source || page === s.page) return;
      const playing = s.status !== 'paused';
      run += 1;
      stopSpeech();
      const sentences = pageSentences(text);
      set({ page, pageCount, hasNext, sentences, index: 0, invite: null, problem: null });
      if (playing) apply(firstMove(0, sentences.length, facts()));
      else {
        set({ status: 'paused' });
        savePlace();
      }
    },

    dismissInvite: () => set({ invite: null }),

    setReaderOpen: (bookId) => set({ readerOpen: bookId }),

    close: () => {
      if (!get().source) return;
      savePlace(true);
      run += 1;
      stopSpeech();
      set({ source: null, status: 'paused', sentences: [], invite: null, problem: null });
    },
  };
});

// One player: a podcast, a video or a recording starting in the bar closes the reading.
usePlayerStore.subscribe((state, previous) => {
  if (state.currentEpisode && state.currentEpisode !== previous.currentEpisode) {
    useListenStore.getState().close();
  }
});

/** Where listening was left in this book, if anywhere. */
export async function getListenPlace(bookId: string): Promise<ListenPlace | null> {
  try {
    return parseListenPlace(await getSetting(listenPlaceKey(bookId)));
  } catch {
    return null;
  }
}
