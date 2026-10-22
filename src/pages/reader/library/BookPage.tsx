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
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import {
  addToLibraryShelf,
  getLibraryBook,
  getLibraryPage,
  getLibraryShelf,
  getPublicLibraryPage,
  setLibraryPosition,
  type LibraryBookDetail,
} from '../services/libraryService';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { errorCodeOf, useReaderErrorText } from '../lib/use-error-text';
import { ReaderFrame } from '../text/ReaderFrame';
import { ReaderTextScreen } from '../text/ReaderTextScreen';
import { useReaderPager } from '../text/useReaderPager';
import { bookReadPath, languageName, seriesReadPath } from './format';
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
 * Signed in: pages come from `page`, the book goes on the shelf once (quietly) and the
 * bookmark is the shelf's. Signed out: the book is public, so pages come from `public-page`
 * and the reader's place is kept in the local settings instead.
 */
export function BookPage() {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const { t } = useTranslation('reader');
  const { t: tl, i18n } = useTranslation('readingLibrary');
  const errorText = useReaderErrorText();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;

  const [detail, setDetail] = useState<LibraryBookDetail | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const withSeries = useSyncExternalStore(subscribeSeriesSupport, seriesSupported);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [bookmark, setBookmark] = useState<{ ready: boolean; last?: number; onShelf: boolean }>({
    ready: false,
    onShelf: false,
  });

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
  const seriesList = detail?.series ?? [];
  const sameSeason = readingOrder(seriesList).filter((e) => seasonOf(e) === seasonOf(book));

  return (
    <ReaderFrame>
      <ReaderTextScreen
        title={book.title}
        subtitle={`${tl('book.by', { author: book.author })} · ${book.level} · ${languageName(book.language, i18n.language)}${episodeLabel ? ` · ${episodeLabel}` : ''}`}
        language={book.language}
        pager={pager}
        errorText={errorText(pager.error)}
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
              <Button variant="accent" className="mt-4" onClick={() => setSignInOpen(true)}>
                {tl('series.gateCta')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
              <SignInDialog
                open={signInOpen}
                onOpenChange={setSignInOpen}
                description={tl('series.gateBody')}
              />
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
            <Button asChild>
              <Link to={bookReadPath(nextEpisode.id)}>
                {withSeries && seasonOf(nextEpisode) !== seasonOf(book)
                  ? (seasonTitle(detail!, seasonOf(nextEpisode)) ??
                    tl('series.season', { n: seasonOf(nextEpisode) }))
                  : tl('book.nextEpisode')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/reader">{t('read.backToReading')}</Link>
            </Button>
          )
        }
        footer={
          <>
            {withSeries && (nav.prev || nav.next) && (
              <nav className="grid gap-3 px-1 sm:grid-cols-2" aria-label={tl('series.episodeNav')}>
                {nav.prev ? (
                  <Link
                    to={bookReadPath(nav.prev.id)}
                    className="group rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                      {tl('series.prevEpisode')}
                    </span>
                    <span
                      className="mt-1 block text-sm font-bold text-foreground group-hover:text-primary"
                      lang={book.language}
                      dir="auto"
                    >
                      {nav.prev.title}
                    </span>
                  </Link>
                ) : (
                  <span className="hidden sm:block" />
                )}
                {nav.next && (
                  <Link
                    to={bookReadPath(nav.next.id)}
                    className="group rounded-xl border border-primary/30 bg-primary/[0.08] p-4 text-end transition-colors hover:bg-primary/[0.14]"
                  >
                    <span className="flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                      {seasonOf(nav.next) !== seasonOf(book)
                        ? (seasonTitle(detail!, seasonOf(nav.next)) ??
                          tl('series.season', { n: seasonOf(nav.next) }))
                        : tl('series.nextEpisode')}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                    </span>
                    <span
                      className="mt-1 block text-sm font-bold text-foreground group-hover:text-primary"
                      lang={book.language}
                      dir="auto"
                    >
                      {nav.next.title}
                    </span>
                  </Link>
                )}
              </nav>
            )}
            {withSeries && book.series_slug && sameSeason.length > 1 && (
              <section className="px-1">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold text-foreground">
                    {seasonal
                      ? (seasonTitle(detail!, seasonOf(book)) ??
                        tl('series.season', { n: seasonOf(book) }))
                      : tl('public.moreInSeries')}
                  </h2>
                  <Link
                    to={seriesReadPath(book.language, book.series_slug)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    {tl('series.allEpisodes')}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                  </Link>
                </div>
                <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {sameSeason.map((e) => (
                    <li key={e.id}>
                      <Link
                        to={bookReadPath(e.id)}
                        aria-current={e.id === book.id ? 'page' : undefined}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted ${e.id === book.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                      >
                        <span className="w-6 shrink-0">{e.series_episode ?? e.series_order}</span>
                        <span className="min-w-0 flex-1 truncate" lang={book.language} dir="auto">
                          {e.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {book.license !== 'own' ? (
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
            ) : null}
          </>
        }
      />
    </ReaderFrame>
  );
}
