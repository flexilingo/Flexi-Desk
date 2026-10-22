import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
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
  pickLanguage,
  toSearchParams,
  type LibraryFilters,
} from './library-filter';

/**
 * The whole library, on its own page.
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
 * Language and filters live in the URL query so a filtered page survives Back.
 */
export function LibraryPage() {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();
  const { targetLang } = useLanguageSettings();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;
  // Series cards exist only once the backend has proved it serves series; until then (and
  // against an older backend) this is the website's current library, nothing more.
  const withSeries = useSyncExternalStore(subscribeSeriesSupport, seriesSupported);

  const [params, setParams] = useSearchParams();
  const { filters, lang: urlLang } = useMemo(() => fromSearchParams(params), [params]);

  const [all, setAll] = useState<LibraryFacets | null>(null);
  const [catalog, setCatalog] = useState<{
    lang: string;
    books: LibraryBook[];
    facets: LibraryFacets;
    series: LibrarySeriesCard[];
  } | null>(null);
  const [shelf, setShelf] = useState<Map<string, number>>(new Map());
  const [documents, setDocuments] = useState<ReaderDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Unfiltered once, for the language list, so it never narrows to one language.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    getLibraryCatalog({})
      .then((r) => !cancelled && setAll(r.facets))
      .catch((cause) => !cancelled && setError(errorText(cause)));
    return () => {
      cancelled = true;
    };
  }, [attempt, errorText]);

  const languages = all?.languages ?? [];
  const lang = all ? pickLanguage(languages, urlLang, targetLang) : undefined;

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    getLibraryCatalog({ language: lang })
      .then(
        (r) =>
          !cancelled &&
          setCatalog({ lang, books: r.books, facets: r.facets, series: r.series_list ?? [] }),
      )
      .catch((cause) => !cancelled && setError(errorText(cause)));
    return () => {
      cancelled = true;
    };
  }, [lang, attempt, errorText]);

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

  const setUrl = useCallback(
    (next: LibraryFilters, nextLang: string | null) =>
      setParams(toSearchParams(next, nextLang), { replace: true }),
    [setParams],
  );
  // A fresh reference per render would re-run the browser's debounce effect for nothing.
  const urlState = useRef({ lang: urlLang, setUrl });
  urlState.current = { lang: urlLang, setUrl };
  const onFiltersChange = useCallback(
    (next: LibraryFilters) => urlState.current.setUrl(next, urlState.current.lang ?? lang ?? null),
    [lang],
  );

  const shown = catalog && catalog.lang === lang ? catalog : null;

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
      ) : !lang || !catalog || authLoading ? (
        <div
          data-testid="library-loading"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : (
        <div className={shown ? undefined : 'opacity-60 transition-opacity'}>
          <LibraryBrowser
            books={catalog.books}
            facets={{ ...catalog.facets, languages }}
            lang={lang}
            filters={filters}
            onFiltersChange={onFiltersChange}
            bookHref={(book) => bookReadPath(book.id, shelf.get(book.id))}
            // A series belongs to one language; the level carries over.
            onLanguageChange={(code) => setUrl({ ...filters, series: '', page: 1 }, code)}
            onShelf={onShelf}
            seriesCards={
              withSeries
                ? catalog.series.filter((s) => s.language === lang && s.episode_count >= 2)
                : []
            }
          />
        </div>
      )}
    </ReaderShell>
  );
}
