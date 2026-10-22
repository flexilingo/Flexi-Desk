import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookMarked, Check, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LocaleBadge } from '@/components/WordDialog/LocaleBadge';
import type {
  CefrLevel,
  LibraryBook,
  LibraryFacets,
  LibrarySeriesCard,
} from '../services/libraryService';
import { BookCover } from './BookCover';
import { coverFor, readingMinutes, seriesReadPath } from './format';
import {
  FilterClearAll,
  FilterBox,
  FilterMenu,
  FilterPills,
  FilterSearch,
  type PillOption,
} from './LibraryFilterControls';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  availableFacets,
  filterBooks,
  hasActiveFilters,
  pageOf,
  pageWindow,
  type BookKind,
  type LibraryFilters,
} from './library-filter';

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

// The level pills of the podcast and video bars: the code on every pill, the word only on the
// one picked, the level's own colour when it is active.
const LEVEL_ACTIVE: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1/20 text-cefr-a1',
  A2: 'bg-cefr-a2/20 text-cefr-a2',
  B1: 'bg-cefr-b1/20 text-cefr-b1',
  B2: 'bg-cefr-b2/20 text-cefr-b2',
  C1: 'bg-cefr-c1/20 text-cefr-c1',
  C2: 'bg-cefr-c2/20 text-cefr-c2',
};
const LEVEL_DOT: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
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
  seriesCards = [],
}: {
  books: LibraryBook[];
  facets: LibraryFacets;
  lang: string;
  filters: LibraryFilters;
  onFiltersChange: (next: LibraryFilters) => void;
  bookHref: (book: LibraryBook) => string;
  onLanguageChange: (code: string) => void;
  onShelf: Set<string>;
  /** Series with a page of their own; empty unless the backend serves series. */
  seriesCards?: LibrarySeriesCard[];
}) {
  const { t } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const { t: tv } = useTranslation('videos');
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

  const levelOptions: PillOption[] = [
    { id: '', label: tv('podcasts.filterAllLevels') },
    ...here.levels.map((l) => ({
      id: l,
      label: l,
      sublabel: tDesk(`library.levelName.${l}`),
      dotClass: LEVEL_DOT[l],
      activeClass: LEVEL_ACTIVE[l],
    })),
  ];
  const clearLabel = tv('podcasts.clearFilters');

  return (
    <div className="space-y-5">
      {seriesCards.length > 0 && (
        <section data-testid="library-series">
          <h2 className="mb-3 text-base font-bold text-foreground">{t('series.listHeading')}</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {seriesCards.map((s) => (
              <li key={`${s.language}/${s.slug}`}>
                <Link
                  to={seriesReadPath(s.language, s.slug)}
                  className="group flex h-full gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:-translate-y-0.5 hover:bg-muted hover:shadow-md"
                >
                  <div className="w-20 shrink-0">
                    <BookCover
                      slug={s.slug}
                      title={s.title}
                      level={s.levels[0] ?? 'B1'}
                      series={null}
                      coverPath={s.cover_path}
                      size="sm"
                      showLevel={false}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-base font-bold leading-snug text-foreground group-hover:text-primary"
                      lang={s.language}
                      dir="auto"
                    >
                      {s.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-primary">
                      {s.levels.length > 1
                        ? `${s.levels[0]}–${s.levels[s.levels.length - 1]}`
                        : s.levels[0]}{' '}
                      · {t('series.episodes', { count: s.episode_count })}
                      {s.season_count > 1 ? (
                        <> · {t('series.seasons', { count: s.season_count })}</>
                      ) : null}
                    </p>
                    {s.summary && (
                      <p
                        className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-muted-foreground"
                        lang={s.language}
                        dir="auto"
                      >
                        {s.summary}
                      </p>
                    )}
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      {t('series.open')}
                      <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder={t('public.searchPlaceholder')}
          className="min-w-48 flex-[1_1_16rem] sm:max-w-80 sm:flex-none lg:w-72"
        />
        <FilterPills
          value={filters.level}
          options={levelOptions}
          groupLabel={tDesk('library.level')}
          onChange={(id) => set({ level: id as CefrLevel | '' })}
        />
        <FilterBox>
          {facets.languages.length > 1 && (
            <FilterMenu
              label={nativeName(lang)}
              value=""
              allLabel={nativeName(lang)}
              clearLabel={clearLabel}
              icon={<LocaleBadge code={lang} size={18} />}
              options={facets.languages
                .filter(({ code }) => code !== lang)
                .map(({ code }) => ({
                  id: code,
                  label: nativeName(code),
                  icon: <LocaleBadge code={code} size={18} />,
                }))}
              onChange={(code) => code && code !== lang && onLanguageChange(code)}
            />
          )}
          {here.kinds.length > 1 && (
            <FilterMenu
              label={t('public.type')}
              value={filters.kind}
              allLabel={t('public.allTypes')}
              clearLabel={clearLabel}
              icon={<BookMarked className="h-3.5 w-3.5 opacity-70" />}
              options={here.kinds.map((k) => ({ id: k, label: t(`catalog.kind.${k}`) }))}
              onChange={(v) => set({ kind: v as BookKind | '' })}
            />
          )}
          {here.series.length > 0 && (
            <FilterMenu
              label={t('public.series')}
              value={filters.series}
              allLabel={t('catalog.allSeries')}
              clearLabel={clearLabel}
              icon={<Layers className="h-3.5 w-3.5 opacity-70" />}
              options={here.series.map((s) => ({ id: s.slug, label: `${s.title} (${s.count})` }))}
              onChange={(v) => set({ series: v })}
            />
          )}
        </FilterBox>
        {hasActiveFilters(filters, search) && (
          <FilterClearAll label={tv('podcasts.clearAllFilters')} onClear={clearAll} />
        )}
      </div>

      <p ref={gridTop} className="scroll-mt-4 text-[13px] text-muted-foreground">
        {t('public.results', { count: shown.length })}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-foreground">{t('catalog.empty')}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{t('public.noResults')}</p>
        </div>
      ) : (
        <ul
          data-testid="library-grid"
          className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 md:grid-cols-4 xl:grid-cols-6"
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
                      className="absolute start-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-card/95 text-primary shadow-sm"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      <span className="sr-only">{t('catalog.added')}</span>
                    </span>
                  )}
                </div>
                <p
                  className="mt-2.5 line-clamp-2 text-[14px] font-bold leading-snug text-foreground group-hover:text-primary"
                  dir="auto"
                  lang={book.language}
                >
                  {book.title}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground" dir="auto">
                  {book.series_title && book.series_order
                    ? `${book.series_title} · ${
                        book.series_season != null
                          ? t('series.seasonEpisode', { season: book.series_season, n: book.series_episode ?? book.series_order })
                          : t('catalog.episode', { n: book.series_order })
                      }`
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
          className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row"
        >
          <p className="order-2 text-[12px] text-muted-foreground sm:order-1">
            {t('pagination.showing', {
              start: (current - 1) * PAGE_SIZE + 1,
              end: Math.min(current * PAGE_SIZE, shown.length),
              total: shown.length,
            })}
          </p>
          <div className="order-1 flex items-center gap-1 sm:order-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={tDesk('library.prevPage')}
              disabled={current <= 1}
              onClick={() => goToPage(current - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              <span className="hidden sm:inline">{t('pagination.previous')}</span>
            </Button>
            <div className="mx-1 flex items-center gap-1">
              {pageWindow(current, totalPages).map((n, i) =>
                n === null ? (
                  <span
                    key={`gap-${i}`}
                    aria-hidden
                    className="flex h-8 w-5 items-center justify-center text-[12px] text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    aria-current={n === current ? 'page' : undefined}
                    aria-label={tDesk('library.pageN', { n })}
                    onClick={() => goToPage(n)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-[13px] transition-colors',
                      n === current
                        ? 'bg-primary font-bold text-primary-foreground shadow-sm'
                        : 'border border-border bg-card font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {n}
                  </button>
                ),
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={tDesk('library.nextPage')}
              disabled={current >= totalPages}
              onClick={() => goToPage(current + 1)}
            >
              <span className="hidden sm:inline">{t('pagination.next')}</span>
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
