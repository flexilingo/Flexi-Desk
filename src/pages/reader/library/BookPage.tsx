import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
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
import { useReaderErrorText } from '../lib/use-error-text';
import { ReaderFrame } from '../text/ReaderFrame';
import { ReaderTextScreen } from '../text/ReaderTextScreen';
import { useReaderPager } from '../text/useReaderPager';
import { bookReadPath, languageName } from './format';
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

  const fetchPage = useCallback(
    (page: number) =>
      signedIn ? getLibraryPage(bookId, page) : getPublicLibraryPage(bookId, page),
    [bookId, signedIn],
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
  const nextEpisode = useMemo(
    () =>
      book?.series_order
        ? detail?.series.find((s) => s.series_order === (book.series_order ?? 0) + 1)
        : undefined,
    [book, detail],
  );

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

  return (
    <ReaderFrame>
      <ReaderTextScreen
        title={book.title}
        subtitle={`${tl('book.by', { author: book.author })} · ${book.level} · ${languageName(book.language, i18n.language)}`}
        language={book.language}
        pager={pager}
        errorText={errorText(pager.error)}
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
          nextEpisode ? (
            <Button asChild>
              <Link to={bookReadPath(nextEpisode.id)}>
                {tl('book.nextEpisode')}
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
          ) : null
        }
      />
    </ReaderFrame>
  );
}
