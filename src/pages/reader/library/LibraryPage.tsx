import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { getReaderDocuments } from '../services/readerService';
import {
  getLibraryCatalog,
  getLibraryShelf,
  type LibraryBook,
  type LibraryFacets,
  type LibrarySeriesCard,
} from '../services/libraryService';
import { buildReadingQueue } from '../lib/queue';
import { useReaderErrorText } from '../lib/use-error-text';
import type { ReaderDocument } from '../types';
import { ReaderShell } from '../components/ReaderShell';
import { ReaderQueueRow } from '../components/ReaderQueueRow';
import { bookReadPath } from './format';
import { seriesSupported, subscribeSeriesSupport } from './library-capability';
import { LibraryBrowser } from './LibraryBrowser';
import {
  fromSearchParams,
  knownLanguage,
  toSearchParams,
  type LibraryFilters,
} from './library-filter';

/**
 * The whole library, on its own page — every language's books together, the language one
 * more filter (All by default, like the podcasts page), each card naming its language.
 *
 * The same shelf as the public site — covers, level pills, series, search — except that a
 * book opens straight into the reader and the books already on the reader's list carry a
 * tick. Opening a book is what adds it to the list (the bookmark saves it), so there is no
 * separate "+" to learn.
 *
 * The reader's own files live on the reading home, not here: this page is the catalogue and
 * offers no upload of its own (the header's Add button is the home's). It does carry the
 * latest one, with the way to the rest — a reader who came to "Library" for the book they
 * had just added used to find nothing, and added it again.
 *
 * The catalogue is public, so it works signed out; only the shelf ticks need an account.
 * The filters live in the URL query so a filtered page survives Back; an old `?lang=fr`
 * link opens with French picked.
 */
export function LibraryPage() {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;
  // Series tiles exist only once the backend has proved it serves series; until then (and
  // against an older backend) this is the website's current library, nothing more.
  const withSeries = useSyncExternalStore(subscribeSeriesSupport, seriesSupported);

  const [params, setParams] = useSearchParams();
  const urlFilters = useMemo(() => fromSearchParams(params), [params]);

  const [catalog, setCatalog] = useState<{
    books: LibraryBook[];
    facets: LibraryFacets;
    series: LibrarySeriesCard[];
  } | null>(null);
  const [shelf, setShelf] = useState<Map<string, number>>(new Map());
  const [documents, setDocuments] = useState<ReaderDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Every language in one answer: the language is a filter over it, not another request.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    getLibraryCatalog({})
      .then(
        (r) =>
          !cancelled &&
          setCatalog({ books: r.books, facets: r.facets, series: r.series_list ?? [] }),
      )
      .catch((cause) => !cancelled && setError(errorText(cause)));
    return () => {
      cancelled = true;
    };
  }, [attempt, errorText]);

  useEffect(() => {
    if (!signedIn) {
      setShelf(new Map());
      return;
    }
    let cancelled = false;
    getLibraryShelf()
      .then((r) => !cancelled && setShelf(new Map(r.items.map((i) => [i.book_id, i.last_page]))))
      .catch(() => {
        // The ticks are a courtesy; the catalogue works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    getReaderDocuments()
      .then((r) => setDocuments(r.items))
      .catch(() => setDocuments([]));
  }, []);

  const latest = useMemo(() => buildReadingQueue(documents, undefined)[0], [documents]);
  const onShelf = useMemo(() => new Set(shelf.keys()), [shelf]);

  // A `?lang=` the library does not have (an old link, a typo) is no filter at all.
  const languages = catalog?.facets.languages;
  const filters = useMemo(
    () =>
      languages
        ? { ...urlFilters, language: knownLanguage(urlFilters.language, languages) }
        : urlFilters,
    [urlFilters, languages],
  );
  const onFiltersChange = useCallback(
    (next: LibraryFilters) => setParams(toSearchParams(next), { replace: true }),
    [setParams],
  );

  return (
    <ReaderShell>
      {latest && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground">{t('library.heading')}</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/reader">{t('library.more')}</Link>
            </Button>
          </div>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            <ReaderQueueRow item={latest} menu={[]} />
          </ul>
        </section>
      )}

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            {tDesk('home.retry')}
          </Button>
        </div>
      ) : !catalog || authLoading ? (
        <div
          data-testid="library-loading"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        <LibraryBrowser
          books={catalog.books}
          facets={catalog.facets}
          filters={filters}
          onFiltersChange={onFiltersChange}
          bookHref={(book) => bookReadPath(book.id, shelf.get(book.id))}
          onShelf={onShelf}
          seriesCards={withSeries ? catalog.series.filter((s) => s.episode_count >= 2) : []}
        />
      )}
    </ReaderShell>
  );
}
