import { create } from 'zustand';
import i18n from 'i18next';
import {
  adjustSpeech,
  getSpeechState,
  plannedVoice,
  prefetchSpeech,
  speakThrough,
  stop as stopSpeech,
  subscribeSpeech,
} from '@/lib/speech';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useAuthStore } from '@/stores/authStore';
import { isPaidTier, useSubscriptionStore } from '@/stores/subscriptionStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import {
  getLibraryBook,
  getLibraryPage,
  getPublicLibraryPage,
  type LibraryPage,
  type LibraryPageAudio,
} from '../services/libraryService';
import { seriesSupported } from '../library/library-capability';
import { isOpenEpisode, listenStart, type ListenAccessFacts } from './listen-access';
import { listenSourceOf, type ListenSource } from './listen-source';
import {
  heardMs,
  pageAudioTrack,
  placeAt,
  sentenceStartTime,
  type PageAudioTrack,
  type WordPlace,
} from './page-audio';
import { createPageAudio } from './page-audio-element';
import { isLoginGated } from '../library/series';
import {
  afterSentence,
  atPageEnd,
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
 *
 * A page with pre-generated narration (`audio`, several voices, real per-word timing) is played
 * from that one file instead, wherever FlexiLingo's own voice would have read it — so the access
 * rule is the cloud voice's, unchanged; with the computer's own voice the page is read the old way,
 * except on an open episode, whose file plays for everyone (signed out too), as on the website.
 * The sentences stay the page's, the file's clock moves the sentence being read, and next /
 * previous / the bar's line seek inside the same file. A file that cannot be played is read the
 * old way from the same sentence.
 */

export type { ListenSource };

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
  /** The page's pre-generated narration, when it is what plays this page; null: sentence by sentence. */
  pageAudio: PageAudioTrack | null;
  /** That file's real time and length (seconds), for the bar's line; null until it plays. */
  clock: { time: number; duration: number } | null;
  /** That file is still loading (or stalled) while it should be playing. */
  buffering: boolean;

  /** Opens the bar on a book at a page and sentence and starts reading. */
  start: (
    source: ListenSource,
    at: {
      page: number;
      sentence: number;
      text?: string;
      hasNext?: boolean;
      pageCount?: number;
      /** The page's pre-generated narration, when the text comes with it. */
      audio?: LibraryPageAudio | null;
    },
  ) => void;
  playPause: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  /** Read from this sentence of the page. */
  jump: (index: number) => void;
  /** The bar's line, on a page played from its narration file: play from this second of it. */
  seekTime: (seconds: number) => void;
  /** Keeps the sentence in step with the narration file; the word being said, or null. */
  followAudio: () => WordPlace | null;
  toggleRepeat: () => void;
  cycleRate: () => void;
  setVolume: (volume: number) => void;
  /** The reader turned the page by hand: read that page from its top (still paused if paused). */
  follow: (at: {
    page: number;
    text: string;
    hasNext: boolean;
    pageCount: number;
    audio?: LibraryPageAudio | null;
  }) => void;
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
/** The element playing a page's narration file — made the first time one plays. */
let audioEl: HTMLAudioElement | null = null;
/** The file the element holds. */
let loadedUrl: string | null = null;
/** A seek asked for before the file's length is known, applied once it is. */
let pendingSeek: number | null = null;

export const useListenStore = create<ListenState>()((set, get) => {
  const facts = (): ListenFacts => {
    const s = get();
    const next = s.source?.nextEpisode;
    return {
      ...listenAccessFacts(s.source),
      hasNext: s.hasNext,
      hasPrev: s.page > 1,
      nextEpisode: next ? { order: next.order } : null,
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
    audioEl?.pause();
    set({ status: 'paused', buffering: false, ...patch });
  };

  /** Cuts off whatever this player is saying: the voice, and the page's file. */
  const silence = () => {
    stopSpeech();
    audioEl?.pause();
  };

  /**
   * The page's narration, where FlexiLingo's own voice would read it (the access rule's cloud
   * voice) — and on an open episode for everyone, as on the website: those are free to all.
   */
  const trackFor = (
    sentences: PageSentence[],
    audio: LibraryPageAudio | null | undefined,
    source: ListenSource,
  ): PageAudioTrack | null =>
    audio && (plannedVoice(source.language) === 'cloud' || isOpenEpisode(source.seriesOrder))
      ? pageAudioTrack(sentences, audio)
      : null;

  const seekTo = (el: HTMLAudioElement, t: number) => {
    if (el.readyState >= 1) {
      pendingSeek = null;
      el.currentTime = t;
    } else {
      pendingSeek = t;
      try {
        el.currentTime = t;
      } catch {
        /* applied on loadedmetadata */
      }
    }
  };

  const element = (): HTMLAudioElement => {
    if (audioEl) return audioEl;
    const el = createPageAudio();
    audioEl = el;
    el.addEventListener('loadedmetadata', () => {
      if (pendingSeek !== null) el.currentTime = pendingSeek;
      pendingSeek = null;
    });
    el.addEventListener('timeupdate', onClock);
    el.addEventListener('durationchange', onClock);
    el.addEventListener('waiting', () => get().pageAudio && set({ buffering: true }));
    el.addEventListener('playing', () => set({ buffering: false }));
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    // One voice at a time: anything else speaking (a word, a paragraph) pauses the file there.
    subscribeSpeech(() => {
      const voice = getSpeechState();
      if ((voice.loading || voice.speaking) && !el.paused && get().pageAudio) halt();
    });
    return el;
  };

  /** Plays the page's file from a sentence's first word (or from `from` seconds). */
  function playAudioAt(index: number, from?: number) {
    const id = ++run;
    const s = get();
    const track = s.pageAudio;
    if (!s.source || !track) return;
    stopSpeech();
    const el = element();
    const t = from ?? sentenceStartTime(track, index);
    set({
      index,
      piece: 0,
      status: 'playing',
      invite: null,
      problem: null,
      buffering: loadedUrl !== track.url || el.readyState < 3,
      clock: { time: t, duration: s.clock?.duration || track.duration },
    });
    startedAt = Date.now();
    savePlace();
    if (loadedUrl !== track.url) {
      el.src = track.url;
      loadedUrl = track.url;
    }
    el.playbackRate = s.rate;
    el.volume = s.volume;
    seekTo(el, t);
    void Promise.resolve(el.play()).catch((cause: unknown) => {
      // Paused or moved on before it began; a file that fails says so through 'error'.
      if (run !== id || (cause as { name?: string } | null)?.name === 'AbortError') return;
      if (get().pageAudio === track) halt();
    });
  }

  /** The file's clock: the bar's line, and the sentence it is on (repeat holds it on one). */
  function followAudio(): WordPlace | null {
    const s = get();
    const track = s.pageAudio;
    const el = audioEl;
    // A new file reports 0 before the seek asked for lands: not a place to follow.
    if (!track || !el || loadedUrl !== track.url || s.status !== 'playing' || pendingSeek !== null)
      return null;
    const at = placeAt(track, el.currentTime);
    if (!at) return null;
    if (s.repeat && at.sentence > s.index) {
      seekTo(el, sentenceStartTime(track, s.index));
      return null;
    }
    if (at.sentence !== s.index) {
      set({ index: at.sentence, piece: 0 });
      startedAt = Date.now();
      savePlace();
    }
    return at;
  }

  function onClock() {
    const s = get();
    const track = s.pageAudio;
    const el = audioEl;
    if (!track || !el || loadedUrl !== track.url || pendingSeek !== null) return;
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : track.duration;
    if (s.clock?.time !== el.currentTime || s.clock?.duration !== duration)
      set({ clock: { time: el.currentTime, duration } });
    followAudio();
  }

  /** The file ran out: the page is read — the same page-end rule as the last sentence's. */
  function onEnded() {
    const s = get();
    if (!s.pageAudio || s.status !== 'playing') return;
    if (s.repeat) return playAudioAt(s.index);
    set({ index: Math.max(0, s.sentences.length - 1) });
    apply(atPageEnd(facts()));
  }

  /** The file cannot be played: this page is read the old way, from the same sentence. */
  function onError() {
    const s = get();
    if (!s.pageAudio || !audioEl?.error) return;
    loadedUrl = null;
    pendingSeek = null;
    set({ pageAudio: null, clock: null, buffering: false });
    if (s.status !== 'paused') void speakAt(s.index);
  }

  const apply = (move: ListenMove) => {
    if (move.kind === 'speak') void speakAt(move.index);
    else if (move.kind === 'turn') void openPage(get().page + 1, 0, true);
    else if (move.kind === 'back') void openPage(get().page - 1, 'last', true);
    else if (move.kind === 'nextEpisode') void openNextEpisode();
    else
      halt({
        invite: move.reason === 'signIn' || move.reason === 'pro' ? move.reason : null,
        problem: move.reason === 'silent' ? 'silent' : null,
      });
  };

  async function speakAt(index: number) {
    if (get().pageAudio) return playAudioAt(index);
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

  /** The book is read: on to the next episode, from its first page (the rule allowed it). */
  async function openNextEpisode() {
    const id = ++run;
    const next = get().source?.nextEpisode;
    if (!next) return halt();
    savePlace(true);
    silence();
    set({ status: 'loading', invite: null, problem: null });
    try {
      const detail = await getLibraryBook(next.bookId);
      if (run !== id) return;
      const t = i18n.getFixedT(null, 'readingLibrary');
      set({
        source: listenSourceOf(detail, seriesSupported(), (key, options) =>
          String(t(key, options)),
        ),
        page: 1,
      });
      void openPage(1, 0, true);
    } catch {
      if (run === id) halt({ problem: 'page' });
    }
  }

  async function openPage(page: number, at: number | 'last', play: boolean) {
    const id = ++run;
    const source = get().source;
    if (!source) return;
    silence();
    set({ status: 'loading', invite: null, problem: null, buffering: false });
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
        pageAudio: trackFor(sentences, loaded.audio, source),
        clock: null,
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
    pageAudio: null,
    clock: null,
    buffering: false,

    start: (source, at) => {
      // The access rule decides first: a locked book (or one whose session is still loading)
      // does not start — the page offers sign-up instead.
      if (listenStart(listenAccessFacts(source)) !== 'play') return;
      // One player: a podcast, a video or a recording in the bar gives way.
      const player = usePlayerStore.getState();
      if (player.currentEpisode) player.stop();
      if (get().source && get().source?.bookId !== source.bookId) savePlace(true);
      // The file of the page it was playing stops (this page may be read by the voice).
      audioEl?.pause();
      set({ source, invite: null, problem: null, pageAudio: null, clock: null });
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
        pageAudio: trackFor(sentences, at.audio, source),
        clock: null,
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
      // The page's file goes on from where it was paused (from the sentence's start once it ran out).
      if (s.pageAudio && s.problem !== 'page' && audioEl && loadedUrl === s.pageAudio.url) {
        if (audioEl.ended) return playAudioAt(s.index);
        const id = ++run;
        stopSpeech();
        set({ status: 'playing', invite: null, problem: null });
        void Promise.resolve(audioEl.play()).catch((cause: unknown) => {
          if (run === id && (cause as { name?: string } | null)?.name !== 'AbortError') halt();
        });
        return;
      }
      // Resume says the sentence again from its start; a page that never loaded is asked again.
      if (s.sentences.length && s.problem !== 'page') void speakAt(s.index);
      else void openPage(s.page, s.index, true);
    },

    pause: () => {
      halt();
      silence();
    },

    next: () => {
      const s = get();
      if (!s.source || s.status === 'loading') return;
      apply(stepNext(s.index, s.sentences.length, facts()));
    },

    prev: () => {
      const s = get();
      if (!s.source || s.status === 'loading') return;
      const heard =
        s.status !== 'playing'
          ? 0
          : s.pageAudio && audioEl
            ? heardMs(s.pageAudio, s.index, audioEl.currentTime)
            : Date.now() - startedAt;
      apply(stepPrev(s.index, heard, facts()));
    },

    jump: (index) => {
      const s = get();
      if (!s.source || !s.sentences.length) return;
      void speakAt(clampSentence(index, s.sentences.length));
    },

    seekTime: (seconds) => {
      const s = get();
      const track = s.pageAudio;
      if (!s.source || !track) return;
      const length = s.clock?.duration || track.duration;
      const t = Math.max(0, length > 0 ? Math.min(seconds, length) : seconds);
      playAudioAt(placeAt(track, t)?.sentence ?? s.index, t);
    },

    followAudio,

    toggleRepeat: () => set((s) => ({ repeat: !s.repeat })),

    cycleRate: () => {
      const rate = nextRate(get().rate);
      set({ rate });
      adjustSpeech({ rate });
      if (audioEl) audioEl.playbackRate = rate;
    },

    setVolume: (volume) => {
      set({ volume });
      adjustSpeech({ volume });
      if (audioEl) audioEl.volume = volume;
    },

    follow: ({ page, text, hasNext, pageCount, audio }) => {
      const s = get();
      if (!s.source || page === s.page) return;
      const playing = s.status !== 'paused';
      run += 1;
      silence();
      const sentences = pageSentences(text);
      set({
        page,
        pageCount,
        hasNext,
        sentences,
        index: 0,
        invite: null,
        problem: null,
        pageAudio: trackFor(sentences, audio, s.source),
        clock: null,
        buffering: false,
      });
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
      silence();
      set({
        source: null,
        status: 'paused',
        sentences: [],
        invite: null,
        problem: null,
        pageAudio: null,
        clock: null,
        buffering: false,
      });
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

/**
 * What the access rule needs to know right now: the voice that will speak this book, whether the
 * reader is signed in and on a paid plan (null while either is still loading), and where the book
 * sits in its series.
 */
export function listenAccessFacts(
  source: Pick<ListenSource, 'language' | 'seriesOrder'> | null,
): ListenAccessFacts {
  const auth = useAuthStore.getState();
  const signedIn = auth.isLoading ? null : !!auth.session;
  const sub = useSubscriptionStore.getState();
  const pro =
    signedIn === null
      ? null
      : !signedIn
        ? false
        : sub.hasResolved
          ? isPaidTier(sub.subscription?.tier)
          : null;
  return {
    voice: plannedVoice(source?.language) ?? 'local',
    signedIn,
    pro,
    seriesOrder: source?.seriesOrder ?? null,
  };
}
