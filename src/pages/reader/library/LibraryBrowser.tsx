import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CefrLevel, LibraryBook, LibraryFacets } from '../services/libraryService';
import { BookCover } from './BookCover';
import { coverFor, readingMinutes } from './format';
import {
  EMPTY_FILTERS,
  availableFacets,
  filterBooks,
  hasActiveFilters,
  pageOf,
  pageWindow,
  type BookKind,
  type LibraryFilters,
} from './library-filter';

/** The sentinel for "no filter": Radix Select does not allow an empty value. */
const ALL = '__all__';
const SEARCH_DEBOUNCE_MS = 300;

/** The language's own name for itself — "Français", "English". */
function nativeName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    /* unknown code */
  }
  return code.toUpperCase();
}

const LEVEL_ACTIVE: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1/20 text-cefr-a1',
  A2: 'bg-cefr-a2/20 text-cefr-a2',
  B1: 'bg-cefr-b1/20 text-cefr-b1',
  B2: 'bg-cefr-b2/20 text-cefr-b2',
  C1: 'bg-cefr-c1/20 text-cefr-c1',
  C2: 'bg-cefr-c2/20 text-cefr-c2',
};

/**
 * The library for one language: the filter bar on top, the shelf below.
 *
 * Every filter works in place on the books already loaded. The filters live in the
 * parent (so the URL can hold them); this component only draws them and turns the search
 * box into a debounced `query`. Language is the exception: another language is another
 * request, so the parent handles `onLanguageChange`.
 */
export function LibraryBrowser({
  books,
  facets,
  lang,
  filters,
  onFiltersChange,
  bookHref,
  onLanguageChange,
  onShelf,
}: {
  books: LibraryBook[];
  facets: LibraryFacets;
  lang: string;
  filters: LibraryFilters;
  onFiltersChange: (next: LibraryFilters) => void;
  bookHref: (book: LibraryBook) => string;
  onLanguageChange: (code: string) => void;
  onShelf: Set<string>;
}) {
  const { t } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const gridTop = useRef<HTMLParagraphElement>(null);

  // The box shows what is typed; the filter only follows after a pause.
  const [search, setSearch] = useState(filters.query);
  const latest = useRef({ filters, onFiltersChange });
  latest.current = { filters, onFiltersChange };
  // The last query this box itself committed, so its own echo does not overwrite fresh typing.
  const committed = useRef(filters.query);
  useEffect(() => {
    if (search === latest.current.filters.query) return;
    const timer = setTimeout(() => {
      committed.current = search;
      latest.current.onFiltersChange({ ...latest.current.filters, query: search, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  // Back/forward or Clear all changes the query from outside.
  useEffect(() => {
    if (filters.query === committed.current) return;
    committed.current = filters.query;
    setSearch(filters.query);
  }, [filters.query]);

  const here = availableFacets(books, facets, lang);
  const shown = filterBooks(books, filters);
  const { current, totalPages, items } = pageOf(shown, filters.page);
  const set = (patch: Partial<LibraryFilters>) =>
    onFiltersChange({ ...filters, page: 1, ...patch });

  const goToPage = (page: number) => {
    onFiltersChange({ ...filters, page });
    gridTop.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const clearAll = () => {
    committed.current = '';
    setSearch('');
    onFiltersChange(EMPTY_FILTERS);
  };

  const menu = (
    id: string,
    label: string,
    value: string,
    options: { id: string; label: string }[],
    onChange: (v: string) => void,
    allLabel?: string,
  ) => (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger aria-label={label} id={id} className="h-9 w-auto min-w-36 max-w-56 gap-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-[1_1_16rem] sm:max-w-80">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('public.searchPlaceholder')}
            aria-label={t('public.searchPlaceholder')}
            className="ps-9"
          />
        </div>

        {/* Level pills: the code on every pill, the word only on the picked one. */}
        <div
          role="group"
          aria-label={tDesk('library.level')}
          className="flex flex-wrap items-center gap-1"
        >
          {[
            { id: '', label: t('catalog.allLevels') },
            ...here.levels.map((l) => ({ id: l, label: l })),
          ].map((o) => {
            const active = filters.level === o.id;
            return (
              <button
                key={o.id || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => set({ level: o.id as CefrLevel | '' })}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                  active
                    ? cn(
                        'border-transparent',
                        o.id ? LEVEL_ACTIVE[o.id as CefrLevel] : 'bg-primary/10 text-primary',
                      )
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {o.label}
                {active && o.id && (
                  <span className="font-normal">{tDesk(`library.levelName.${o.id}`)}</span>
                )}
              </button>
            );
          })}
        </div>

        {facets.languages.length > 1 &&
          menu(
            'library-language',
            t('public.language'),
            lang,
            facets.languages.map(({ code }) => ({ id: code, label: nativeName(code) })),
            (code) => code && code !== lang && onLanguageChange(code),
          )}
        {here.kinds.length > 1 &&
          menu(
            'library-type',
            t('public.type'),
            filters.kind,
            here.kinds.map((k) => ({ id: k, label: t(`catalog.kind.${k}`) })),
            (v) => set({ kind: v as BookKind | '' }),
            t('public.allTypes'),
          )}
        {here.series.length > 0 &&
          menu(
            'library-series',
            t('public.series'),
            filters.series,
            here.series.map((s) => ({ id: s.slug, label: `${s.title} (${s.count})` })),
            (v) => set({ series: v }),
            t('catalog.allSeries'),
          )}

        {hasActiveFilters(filters, search) && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5" />
            {tDesk('library.clearAll')}
          </Button>
        )}
      </div>

      <p ref={gridTop} className="scroll-mt-4 text-xs text-muted-foreground">
        {t('public.results', { count: shown.length })}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-semibold text-foreground">{t('catalog.empty')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('public.noResults')}</p>
          {hasActiveFilters(filters, search) && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearAll}>
              {tDesk('library.clearAll')}
            </Button>
          )}
        </div>
      ) : (
        <ul
          data-testid="library-grid"
          className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
        >
          {items.map((book) => (
            <li key={book.id}>
              <Link to={bookHref(book)} className="group block">
                <div className="relative transition-transform duration-200 group-hover:-translate-y-1">
                  <BookCover
                    slug={book.slug}
                    title={book.title}
                    level={book.level}
                    series={book.series_title}
                    coverPath={coverFor(book)}
                  />
                  {onShelf.has(book.id) && (
                    <span
                      title={t('catalog.added')}
                      className="absolute start-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-card text-primary shadow-sm"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      <span className="sr-only">{t('catalog.added')}</span>
                    </span>
                  )}
                </div>
                <p
                  className="mt-2.5 line-clamp-2 text-sm font-bold leading-snug text-foreground group-hover:text-primary"
                  dir="auto"
                  lang={book.language}
                >
                  {book.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="auto">
                  {book.series_title && book.series_order
                    ? `${book.series_title} · ${t('catalog.episode', { n: book.series_order })}`
                    : book.author}
                </p>
                <p className="mt-1 text-[11.5px] font-semibold text-primary">
                  {t(`catalog.kind.${book.kind}`)} ·{' '}
                  {t('catalog.minutes', { n: readingMinutes(book.word_count) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav
          aria-label={tDesk('library.pages')}
          className="flex flex-wrap items-center justify-center gap-1 pt-2"
        >
          <Button
            variant="outline"
            size="icon"
            aria-label={tDesk('library.prevPage')}
            disabled={current <= 1}
            onClick={() => goToPage(current - 1)}
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
          {pageWindow(current, totalPages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={n}
                variant={n === current ? 'default' : 'ghost'}
                size="icon"
                aria-current={n === current ? 'page' : undefined}
                aria-label={tDesk('library.pageN', { n })}
                onClick={() => goToPage(n)}
              >
                {n}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={tDesk('library.nextPage')}
            disabled={current >= totalPages}
            onClick={() => goToPage(current + 1)}
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </nav>
      )}
    </div>
  );
}
