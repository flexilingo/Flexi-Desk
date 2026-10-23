import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  CheckCircle2,
  Clock,
  Crown,
  FileText,
  Headphones,
  Layers,
  Lock,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import {
  addToLibraryShelf,
  getLibraryBook,
  getLibraryPage,
  getLibrarySeries,
  getLibraryShelf,
  getPublicLibraryPage,
  setLibraryPosition,
  type LibraryBookDetail,
} from '../services/libraryService';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { errorCodeOf, useReaderErrorText } from '../lib/use-error-text';
import { ReaderFrame } from '../text/ReaderFrame';
import { ReaderTextScreen } from '../text/ReaderTextScreen';
import type { ListenInvite, ListenSource } from '../listen/listenStore';
import { listenSourceOf } from '../listen/listen-source';
import { FREE_LISTEN_EPISODES } from '../listen/listen-access';
import { openUrl } from '@tauri-apps/plugin-opener';
import { subscriptionUrl } from '@/components/layout/sidebarConfig';
import { useReaderPager } from '../text/useReaderPager';
import { bookReadPath, coverFor, languageName, readingMinutes, seriesReadPath } from './format';
import { BookCover, LevelBadge } from './BookCover';
import { ClampedSummary } from './ClampedSummary';
import { ReadMark } from './LibraryCards';
import { LibraryFitCard } from './LibraryFitCard';
import { episodePlace } from './series-fit';
import {
  EMPTY_PROGRESS,
  orderNoteSettingKey,
  progressFromShelf,
  showOrderNote,
  type SeriesProgress,
} from './series-progress';
import type { LibraryShelfItem } from '../services/libraryService';
import { seriesSupported, subscribeSeriesSupport } from './library-capability';
import {
  hasSeasons,
  isLoginGated,
  nextByOrder,
  neighbours,
  readingOrder,
  seasonOf,
  seasonTitle,
} from './series';
import { bookPageSettingKey, parseBookmark } from './bookmark';

/** The bold part of a fit line (the translations' `<b>`). */
const bold = <b className="font-semibold text-foreground" />;

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <ReaderFrame>
      <div className="min-h-0 flex-1 p-6">
        <div className="mx-auto max-w-[68ch]">{children}</div>
      </div>
    </ReaderFrame>
  );
}

/**
 * A library book, read in the reader's own frame — the same toolbar and the same
 * full-height page a PDF gets. Only the source of the pages and the bookmark differ, plus
 * what a book has and a file does not: a chapter heading, the next episode and a licence.
 *
 * Laid out like the website's episode page: on a wide reading area this season's episodes
 * on the left, the book in the middle under a compact header (and the gentle order note),
 * "is this right for you?" with the previous / next episode on the right. A narrower area
 * folds the columns under the book.
 *
 * Signed in: pages come from `page`, the book goes on the shelf once (quietly) and the
 * bookmark is the shelf's. Signed out: the book is public, so pages come from `public-page`
 * and the reader's place is kept in the local settings instead.
 */
export function BookPage() {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const { t } = useTranslation('reader');
  const { t: tl, i18n } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;

  const [detail, setDetail] = useState<LibraryBookDetail | null>(null);
  // What the sign-in was asked for: reading on past the gate, or listening on.
  const [signInFor, setSignInFor] = useState<'gate' | 'listen' | null>(null);
  const withSeries = useSyncExternalStore(subscribeSeriesSupport, seriesSupported);
  // Listening on, page after page, is Pro (a paid plan or a trial): the player reads the app's own
  // plan state, so make sure it is known.
  const subResolved = useSubscriptionStore((s) => s.hasResolved);
  const subLoading = useSubscriptionStore((s) => s.isLoading);
  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  useEffect(() => {
    if (signedIn && !subResolved && !subLoading) void fetchSubscription();
  }, [signedIn, subResolved, subLoading, fetchSubscription]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [bookmark, setBookmark] = useState<{ ready: boolean; last?: number; onShelf: boolean }>({
    ready: false,
    onShelf: false,
  });
  // The shelf as it was when the book opened — for "was the episode before this one opened?".
  const [shelfItems, setShelfItems] = useState<LibraryShelfItem[] | null>(null);
  const [noteClosed, setNoteClosed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoadError(null);
    getLibraryBook(bookId)
      .then((d) => !cancelled && setDetail(d))
      .catch((cause) => !cancelled && setLoadError(cause ?? 'BOOK_NOT_FOUND'));
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Where the reader stopped: the shelf's page when signed in, the local setting when not.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setBookmark({ ready: false, onShelf: false });
    const done = (last: number | undefined, onShelf: boolean) =>
      !cancelled && setBookmark({ ready: true, last, onShelf });
    if (signedIn) {
      getLibraryShelf()
        .then((r) => {
          const item = r.items.find((i) => i.book_id === bookId);
          if (!cancelled) setShelfItems(r.items);
          done(item?.last_page, !!item);
        })
        // A shelf that will not load costs the resume point, never the book.
        .catch(() => done(undefined, true));
    } else {
      getSetting(bookPageSettingKey(bookId))
        .then((raw) => done(parseBookmark(raw), false))
        .catch(() => done(undefined, false));
    }
    return () => {
      cancelled = true;
    };
  }, [bookId, signedIn, authLoading]);

  // The note stays closed for the whole series once the reader closes it.
  const orderNoteKey = detail?.book.series_slug
    ? orderNoteSettingKey(detail.book.language, detail.book.series_slug)
    : null;
  useEffect(() => {
    if (!orderNoteKey) return;
    let cancelled = false;
    setNoteClosed(null);
    getSetting(orderNoteKey)
      .then((raw) => !cancelled && setNoteClosed(raw === '1'))
      .catch(() => !cancelled && setNoteClosed(false));
    return () => {
      cancelled = true;
    };
  }, [orderNoteKey]);

  // Each episode's length for the season list — the series answer has it, the book answer
  // does not. Once per series, not per episode; without it the list simply has no minutes.
  const seriesLanguage = detail?.book.language ?? null;
  const seriesSlug = withSeries ? (detail?.book.series_slug ?? null) : null;
  const seriesKey = seriesLanguage && seriesSlug ? `${seriesLanguage}/${seriesSlug}` : null;
  const [episodeWords, setEpisodeWords] = useState<{
    key: string;
    byId: Map<string, number>;
  } | null>(null);
  const wordsAskedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!seriesKey || !seriesLanguage || !seriesSlug || wordsAskedFor.current === seriesKey) return;
    wordsAskedFor.current = seriesKey;
    getLibrarySeries(seriesLanguage, seriesSlug)
      .then((d) =>
        setEpisodeWords({
          key: seriesKey,
          byId: new Map(d.seasons.flatMap((s) => s.episodes).map((e) => [e.id, e.word_count])),
        }),
      )
      .catch(() => {
        // A courtesy: the list works without minutes, and the next visit asks again.
        wordsAskedFor.current = null;
      });
  }, [seriesKey, seriesLanguage, seriesSlug]);

  // Opening a book is starting it: it goes on the shelf once, quietly, so it is waiting under
  // "My reading" next time.
  const added = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !detail || !bookmark.ready || bookmark.onShelf || added.current === bookId)
      return;
    added.current = bookId;
    addToLibraryShelf({ book_id: detail.book.id }).catch(() => {});
  }, [signedIn, detail, bookmark, bookId]);

  // A later season keeps page 1 open; the rest needs a free account. Refused here, before any
  // request, so a signed-out reader sees the invitation instead of an error.
  const requiresLogin = detail?.book.requires_login === true;
  const fetchPage = useCallback(
    (page: number) =>
      signedIn
        ? getLibraryPage(bookId, page)
        : isLoginGated({ requires_login: requiresLogin }, page, false)
          ? Promise.reject({ code: 'LOGIN_REQUIRED' })
          : getPublicLibraryPage(bookId, page),
    [bookId, signedIn, requiresLogin],
  );
  const savePosition = useCallback(
    (page: number) =>
      signedIn
        ? setLibraryPosition({ book_id: bookId, page })
        : setSetting(bookPageSettingKey(bookId), String(page)),
    [bookId, signedIn],
  );

  const pager = useReaderPager({
    id: bookId,
    fetchPage,
    savePosition,
    serverLastPage: bookmark.last,
    isReady: !!detail && bookmark.ready && !authLoading,
  });

  const book = detail?.book;
  // Without series seasons (an older backend) this is the website's previous behaviour: the
  // next episode is order + 1, and there is no previous link.
  const nav = useMemo(() => {
    if (!book || !detail) return { prev: null, next: null };
    if (!withSeries) return { prev: null, next: nextByOrder(detail.series, book.series_order) };
    return neighbours(detail.series, book.id);
  }, [book, detail, withSeries]);
  const nextEpisode = nav.next ?? undefined;
  const gated =
    !!book &&
    !signedIn &&
    (isLoginGated(book, pager.page, false) || errorCodeOf(pager.error) === 'LOGIN_REQUIRED');

  if (loadError) {
    return (
      <Placeholder>
        <p
          role="alert"
          className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {errorText(loadError)}
        </p>
      </Placeholder>
    );
  }

  if (!book) {
    return (
      <Placeholder>
        <div data-testid="book-loading" className="h-64 animate-pulse rounded-xl bg-card" />
      </Placeholder>
    );
  }

  const atEnd = !pager.hasNext && !pager.isLoading && !pager.error;
  const seasonal = withSeries && hasSeasons(detail?.series ?? []);
  const episodeLabel =
    withSeries && book.series_order
      ? seasonal
        ? tl('series.seasonEpisode', {
            season: seasonOf(book),
            n: book.series_episode ?? book.series_order,
          })
        : tl('catalog.episode', { n: book.series_order })
      : null;
  const isEpisode = !!(book.series_title && episodeLabel);
  const seriesList = detail?.series ?? [];
  // An episode opened out of order gets a quiet note: the story starts at episode 1. Never a
  // lock — someone practising one exam task opens that episode directly. Signed in only: the
  // shelf is what knows which episodes were opened.
  const progress: SeriesProgress =
    withSeries && book.series_slug && shelfItems
      ? progressFromShelf(shelfItems, book.language, book.series_slug)
      : EMPTY_PROGRESS;
  const firstEpisode = readingOrder(seriesList)[0];
  const orderNote =
    withSeries &&
    signedIn &&
    !!shelfItems &&
    noteClosed === false &&
    !!book.series_slug &&
    !!firstEpisode &&
    firstEpisode.id !== book.id &&
    showOrderNote(book.series_order, progress);
  const sameSeason = readingOrder(seriesList).filter((e) => seasonOf(e) === seasonOf(book));
  const num = new Intl.NumberFormat(i18n.language);
  const minutesOf = (words: number) => tl('catalog.minutes', { n: readingMinutes(words) });
  const words = episodeWords?.key === seriesKey ? episodeWords.byId : null;
  const seriesHref =
    withSeries && book.series_slug ? seriesReadPath(book.language, book.series_slug) : null;

  // ── The compact header over the reader: cover, where it sits, title, the facts, summary ──
  const header = (
    <header>
      <div className="flex items-start gap-4">
        <div className="w-[72px] shrink-0">
          <BookCover
            slug={book.slug}
            title={book.title}
            level={book.level}
            series={book.series_title}
            coverPath={coverFor(book)}
            size="sm"
            alt={tl('public.coverAlt', { title: book.title })}
            showLevel={false}
          />
        </div>
        <div className="min-w-0">
          <nav
            aria-label={tl('public.breadcrumb')}
            className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground"
          >
            <Link to={`/reader/library?lang=${book.language}`} className="hover:text-primary">
              {tl('book.backToLibrary')}
            </Link>
            {isEpisode && (
              <>
                <span aria-hidden>/</span>
                {seriesHref ? (
                  <Link to={seriesHref} className="font-semibold text-primary hover:underline">
                    <bdi lang={book.language}>{book.series_title}</bdi>
                  </Link>
                ) : (
                  <span className="font-semibold text-primary">
                    <bdi lang={book.language}>{book.series_title}</bdi>
                  </span>
                )}
              </>
            )}
          </nav>
          <h1 className="mt-1 text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-foreground @3xl:text-[26px]">
            <bdi lang={book.language} dir="auto">
              {book.title}
            </bdi>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <LevelBadge level={book.level} />
              {tDesk(`library.levelName.${book.level}`)}
            </span>
            {isEpisode ? (
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-caption" />
                {episodeLabel}
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1">
                  <BookMarked className="h-3.5 w-3.5 text-caption" />
                  {tl(`catalog.kind.${book.kind}`)}
                </span>
                <span>
                  <bdi>{tl('book.by', { author: book.author })}</bdi>
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1 tabular-nums">
              <FileText className="h-3.5 w-3.5 text-caption" />
              {tl('catalog.pages', { n: book.page_count })}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5 text-caption" />
              {minutesOf(book.word_count)}
            </span>
          </div>
        </div>
      </div>
      {book.summary && <ClampedSummary text={book.summary} lang={book.language} className="mt-4" />}
    </header>
  );

  const orderNoteBlock =
    orderNote && episodeLabel ? (
      <div className="flex items-start gap-3 rounded-[9px] border border-primary/30 bg-primary/[0.08] px-4 py-3">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
          {tl('series.orderNote', { label: episodeLabel })}{' '}
          <Link
            to={bookReadPath(firstEpisode!.id)}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            {tl('series.orderNoteLink')}
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            setNoteClosed(true);
            if (orderNoteKey) setSetting(orderNoteKey, '1').catch(() => {});
          }}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={tl('series.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  // ── "Is this episode (book) right for you?" from what the page knows ──
  const place = isEpisode ? episodePlace(seriesList, book.id) : null;
  const points: ReactNode[] = [
    <Trans
      t={tl}
      i18nKey="public.fitLength"
      count={book.page_count}
      values={{ minutes: num.format(readingMinutes(book.word_count)) }}
      components={{ b: bold }}
    />,
  ];
  if (place) {
    points.push(
      place.season != null ? (
        <Trans
          t={tl}
          i18nKey="public.fitEpisodeOfSeason"
          values={{
            n: num.format(place.n),
            total: num.format(place.total),
            season: num.format(place.season),
          }}
          components={{ b: bold }}
        />
      ) : (
        <Trans
          t={tl}
          i18nKey="public.fitEpisodeOf"
          values={{ n: num.format(place.n), total: num.format(place.total) }}
          components={{ b: bold }}
        />
      ),
    );
  }
  // Signed in, every page is open; signed out, a later season keeps page 1 open.
  points.push(
    book.requires_login && !signedIn ? (
      <Trans t={tl} i18nKey="public.fitLogin" components={{ b: bold }} />
    ) : (
      <Trans t={tl} i18nKey="public.fitFree" components={{ b: bold }} />
    ),
  );
  const fitCard = (
    <LibraryFitCard
      title={isEpisode ? tl('public.fitTitleEpisode') : tl('public.fitTitleBook')}
      level={book.level}
      levelName={tDesk(`library.levelName.${book.level}`)}
      levelHint={tl(`public.levelHint.${book.level}`)}
      shares={null}
      points={points}
      compact
    />
  );

  // ── Previous / next episode, across season borders ──
  const nextLabel = (e: { series_season?: number | null }) =>
    seasonOf(e) !== seasonOf(book)
      ? (seasonTitle(detail!, seasonOf(e)) ?? tl('series.season', { n: seasonOf(e) }))
      : tl('series.nextEpisode');
  const episodeNav =
    withSeries && (nav.prev || nav.next) ? (
      <nav
        aria-label={tl('series.episodeNav')}
        className="divide-y divide-border overflow-hidden rounded-[9px] border border-border bg-card shadow-xs"
      >
        {nav.prev && (
          <Link
            to={bookReadPath(nav.prev.id)}
            className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-caption rtl:rotate-180" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-caption">
                {tl('series.prevEpisode')}
              </span>
              <span
                className="line-clamp-1 text-[13.5px] font-bold text-foreground group-hover:text-primary"
                lang={book.language}
                dir="auto"
              >
                {nav.prev.title}
              </span>
            </span>
          </Link>
        )}
        {nav.next && (
          <Link
            to={bookReadPath(nav.next.id)}
            className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary">
                {nextLabel(nav.next)}
              </span>
              <span
                className="line-clamp-1 text-[13.5px] font-bold text-foreground group-hover:text-primary"
                lang={book.language}
                dir="auto"
              >
                {nav.next.title}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary rtl:rotate-180" />
          </Link>
        )}
      </nav>
    ) : null;

  // ── This season's episodes, a table of contents (the series page has all of them) ──
  const hasSeasonList = isEpisode && !!seriesHref && sameSeason.length > 1;
  const seasonList = (sticky: boolean) =>
    hasSeasonList ? (
      <section
        className={cn(
          'flex flex-col overflow-hidden rounded-[9px] border border-border bg-card shadow-xs',
          sticky && 'max-h-[calc(100vh-10rem)]',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-bold text-foreground">
            {seasonal
              ? `${tl('series.season', { n: seasonOf(book) })} · ${tl('series.episodeNav')}`
              : tl('series.episodeNav')}
          </h2>
          <Link
            to={seriesHref!}
            className="shrink-0 text-[12px] font-semibold text-primary hover:underline"
          >
            {tl('series.allEpisodes')}
          </Link>
        </div>
        <ol className={cn('py-1', sticky && 'overflow-y-auto')}>
          {sameSeason.map((e) => {
            const current = e.id === book.id;
            const count = words?.get(e.id);
            const row = (
              <>
                <span className="w-6 shrink-0 text-end text-[12px] font-semibold tabular-nums text-caption">
                  {num.format(e.series_episode ?? e.series_order)}
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    current ? 'font-bold text-primary' : 'text-foreground group-hover:text-primary',
                  )}
                  lang={book.language}
                  dir="auto"
                  title={e.title}
                >
                  {e.title}
                </span>
                {count != null && (
                  <span className="shrink-0 text-[11px] tabular-nums text-caption">
                    {minutesOf(count)}
                  </span>
                )}
                {progress.finished.has(e.series_order) && (
                  <ReadMark label={tl('series.readMark')} />
                )}
              </>
            );
            return (
              <li key={e.id}>
                {current ? (
                  <div
                    aria-current="page"
                    className="flex items-center gap-2.5 border-s-[3px] border-primary bg-primary/[0.08] py-2 pe-4 ps-[13px]"
                  >
                    {row}
                  </div>
                ) : (
                  <Link
                    to={bookReadPath(e.id)}
                    className="group flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-muted"
                  >
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    ) : null;

  const licence =
    book.license !== 'own' ? (
      <p className="px-1 pb-2 text-xs text-muted-foreground" dir="auto">
        {tl(`book.license.${book.license}`)}
        {book.attribution ? ` · ${book.attribution}` : ''}
        {book.source_url && (
          <>
            {' · '}
            <a
              href={book.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              {tl('book.source')}
            </a>
          </>
        )}
      </p>
    ) : null;

  // Three columns when the reader has the room (this season | the book | fit and next), two
  // below that (the season list moves under the book), one in a narrow window. The widths
  // are the reading area's own, not the window's: the app's sidebar and the grammar panel
  // take their share.
  const around = (card: ReactNode) => (
    <div
      className={cn(
        'mx-auto grid items-start gap-6 @3xl:grid-cols-[minmax(0,1fr)_264px]',
        hasSeasonList
          ? 'max-w-[78rem] @5xl:grid-cols-[232px_minmax(0,1fr)_264px]'
          : 'max-w-[64rem]',
      )}
    >
      {hasSeasonList && (
        <aside className="hidden @5xl:sticky @5xl:top-0 @5xl:block">{seasonList(true)}</aside>
      )}
      <div className="min-w-0">
        {/* The book at a reading measure: prose is unreadable at full width. */}
        <div className="mx-auto w-full max-w-[68ch] space-y-5">
          {header}
          {orderNoteBlock}
          {card}
          {episodeNav && <div className="@3xl:hidden">{episodeNav}</div>}
          {hasSeasonList && <div className="@5xl:hidden">{seasonList(false)}</div>}
          {licence}
        </div>
      </div>
      <aside className="space-y-5 @3xl:sticky @3xl:top-0">
        {fitCard}
        {episodeNav && <div className="hidden @3xl:block">{episodeNav}</div>}
      </aside>
    </div>
  );

  // The book as the player bar shows it.
  const listenSource: ListenSource = listenSourceOf(detail!, withSeries, (key, options) =>
    String(tl(key, options)),
  );
  const freeEpisodes = { n: FREE_LISTEN_EPISODES };

  // Where «Listen» stopped at the end of a page or an episode: an account first, then Pro (the
  // site's pricing, as everywhere else in the app). The speaker after each paragraph stays free.
  const listenInvite = (kind: ListenInvite, dismiss: () => void) => (
    <div className="relative rounded-xl border border-primary/30 bg-primary/[0.08] p-5">
      <button
        type="button"
        onClick={dismiss}
        className="absolute end-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={tl('series.close')}
      >
        <X className="h-4 w-4" />
      </button>
      <p className="flex items-center gap-2 pe-8 text-base font-bold text-foreground">
        {kind === 'pro' ? (
          <Crown className="h-4 w-4 shrink-0 text-accent" />
        ) : (
          <Headphones className="h-4 w-4 shrink-0 text-primary" />
        )}
        {kind === 'pro' ? tl('listen.proTitle') : tl('listen.signInTitle')}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {kind === 'pro'
          ? tl('listen.proBody', freeEpisodes)
          : tl('listen.signInBody', freeEpisodes)}
      </p>
      {kind === 'pro' ? (
        <Button
          variant="accent"
          className="mt-4"
          onClick={() => void openUrl(subscriptionUrl(i18n.language))}
        >
          <Crown className="h-4 w-4" />
          {tl('listen.proCta')}
        </Button>
      ) : (
        <Button variant="accent" className="mt-4" onClick={() => setSignInFor('listen')}>
          {tl('listen.signInCta')}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      )}
    </div>
  );

  return (
    <ReaderFrame>
      <ReaderTextScreen
        speakLabel={tl('book.readAloud')}
        title={book.title}
        subtitle={`${tl('book.by', { author: book.author })} · ${book.level} · ${languageName(book.language, i18n.language)}${episodeLabel ? ` · ${episodeLabel}` : ''}`}
        language={book.language}
        pager={pager}
        errorText={errorText(pager.error)}
        around={around}
        listen={{
          source: listenSource,
          playLabel: tl('listen.playFromHere'),
          invite: listenInvite,
          signUp: () => setSignInFor('listen'),
        }}
        gate={
          gated ? (
            <div className="rounded-xl border border-primary/30 bg-primary/[0.08] p-5">
              <p className="flex items-center gap-2 text-base font-bold text-foreground">
                <Lock className="h-4 w-4 text-primary" />
                {tl('series.gateTitle')}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {tl('series.gateBody')}
              </p>
              <Button variant="accent" className="mt-4" onClick={() => setSignInFor('gate')}>
                {tl('series.gateCta')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </div>
          ) : undefined
        }
        pageAbove={
          pager.chapterTitle ? (
            <h2 className="mb-4 text-lg font-bold text-foreground" dir="auto" lang={book.language}>
              {pager.chapterTitle}
            </h2>
          ) : null
        }
        // The end of a book is a moment, not one more page: it says so, names what comes next,
        // and the dead Next button gives its place to it.
        pageBelow={
          atEnd ? (
            <p className="mt-8 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t('read.finished')}
              {nextEpisode && (
                <span className="font-normal text-muted-foreground">
                  · {tl('book.nextEpisode')}: <bdi>{nextEpisode.title}</bdi>
                </span>
              )}
            </p>
          ) : null
        }
        pageEnd={
          gated ? undefined : nextEpisode ? (
            // The website's primary «Next episode: title» in place of a dead Next.
            <Button asChild variant="accent" className="min-w-0 max-w-[65%]">
              <Link to={bookReadPath(nextEpisode.id)}>
                <span className="truncate">
                  {tl('series.nextEpisode')}: <bdi lang={book.language}>{nextEpisode.title}</bdi>
                </span>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/reader">{t('read.backToReading')}</Link>
            </Button>
          )
        }
      />
      <SignInDialog
        open={signInFor !== null}
        onOpenChange={(open) => !open && setSignInFor(null)}
        description={
          signInFor === 'listen' ? tl('listen.signInBody', freeEpisodes) : tl('series.gateBody')
        }
      />
    </ReaderFrame>
  );
}
