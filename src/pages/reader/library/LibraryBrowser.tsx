import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMarked, Check, ChevronLeft, ChevronRight, Globe, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LocaleBadge } from '@/components/WordDialog/LocaleBadge';
import type {
  CefrLevel,
  LibraryBook,
  LibraryFacets,
  LibrarySeriesCard,
} from '../services/libraryService';
import { coverFor, readingMinutes, seriesReadPath } from './format';
import { BOOK_GRID, BookCard, SeriesTile } from './LibraryCards';
import { seriesTile } from './series-fit';
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

/** The language's own name for itself — "Français", "English". Kept: every card asks. */
const NATIVE_NAMES = new Map<string, string>();
function nativeName(code: string): string {
  const known = NATIVE_NAMES.get(code);
  if (known) return known;
  let name = code.toUpperCase();
  try {
    const own = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (own) name = own.charAt(0).toLocaleUpperCase(code) + own.slice(1);
  } catch {
    /* unknown code */
  }
  NATIVE_NAMES.set(code, name);
  return name;
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
 * The library for one language, as the website's redesign lays it out: the filter bar on top,
 * the shelf of book cards below, and the series as picture tiles under the shelf.
 *
 * Every language's books are on one shelf; the language is one more filter (All by default)
 * and every card and tile names its language. Every filter works in place on the books
 * already loaded. The filters live in the parent (so the URL can hold them); this component
 * only draws them and turns the search box into a debounced `query`.
 */
export function LibraryBrowser({
  books,
  facets,
  filters,
  onFiltersChange,
  bookHref,
  onShelf,
  seriesCards = [],
}: {
  /** Every language's books. */
  books: LibraryBook[];
  facets: LibraryFacets;
  filters: LibraryFilters;
  onFiltersChange: (next: LibraryFilters) => void;
  bookHref: (book: LibraryBook) => string;
  onShelf: Set<string>;
  /** Series with a page of their own; empty unless the backend serves series. */
  seriesCards?: LibrarySeriesCard[];
}) {
  const { t, i18n } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const { t: tv } = useTranslation('videos');
  const gridTop = useRef<HTMLDivElement>(null);

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

  const here = availableFacets(books, facets, filters.language);
  const shown = filterBooks(books, filters);
  const { current, totalPages, items } = pageOf(shown, filters.page);
  // A series tile needs a picture: the series' own cover, else its first episode's.
  const tiles = seriesCards
    .filter((card) => !filters.language || card.language === filters.language)
    .map((card) => ({ card, ...seriesTile(card, books) }))
    .filter((x): x is typeof x & { cover: string } => !!x.cover)
    .sort((a, b) => b.card.episode_count - a.card.episode_count);
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
              label={t('catalog.allLanguages')}
              value={filters.language}
              allLabel={t('catalog.allLanguages')}
              clearLabel={clearLabel}
              icon={<Globe className="h-3.5 w-3.5 opacity-70" />}
              options={facets.languages.map(({ code, count }) => ({
                id: code,
                label: nativeName(code),
                count,
                icon: <LocaleBadge code={code} size={18} />,
              }))}
              // A series belongs to one language; the level carries over.
              onChange={(code) => set({ language: code, series: '' })}
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

      {/* The count the podcast catalogue opens its grid with: the number large, the word small. */}
      <div
        ref={gridTop}
        className="flex scroll-mt-4 items-baseline gap-2 border-b border-border pb-2.5"
      >
        <span className="text-[22px] font-extrabold leading-none tracking-tight text-foreground tabular-nums">
          {new Intl.NumberFormat(i18n.language).format(shown.length)}
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">
          {t('public.booksLabel', { count: shown.length })}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-[9px] border border-border bg-card px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-foreground">{t('catalog.empty')}</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{t('public.noResults')}</p>
        </div>
      ) : (
        <ul data-testid="library-grid" className={BOOK_GRID}>
          {items.map((book) => (
            <BookCard
              key={book.id}
              to={bookHref(book)}
              slug={book.slug}
              title={book.title}
              level={book.level}
              language={book.language}
              series={book.series_title}
              coverPath={coverFor(book)}
              subtitle={
                book.series_title && book.series_order
                  ? `${book.series_title} · ${
                      book.series_season != null
                        ? t('series.seasonEpisode', {
                            season: book.series_season,
                            n: book.series_episode ?? book.series_order,
                          })
                        : t('catalog.episode', { n: book.series_order })
                    }`
                  : book.author
              }
              minutes={t('catalog.minutes', { n: readingMinutes(book.word_count) })}
              languageLabel={nativeName(book.language)}
              corner={
                onShelf.has(book.id) ? (
                  <span
                    title={t('catalog.added')}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-card/95 text-primary shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    <span className="sr-only">{t('catalog.added')}</span>
                  </span>
                ) : null
              }
            />
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

      {/* Series with a page of their own, biggest first, as picture tiles under the shelf —
          the video page's "Channels". */}
      {tiles.length > 0 && (
        <section
          data-testid="library-series"
          className="space-y-4 pt-3"
          aria-labelledby="library-series"
        >
          <h2
            id="library-series"
            className="flex items-center gap-2 text-base font-bold text-foreground"
          >
            <Layers className="h-4 w-4 text-primary" />
            {t('series.tilesHeading')}
            <span className="text-xs font-normal tabular-nums text-caption">
              {new Intl.NumberFormat(i18n.language).format(tiles.length)}
            </span>
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map(({ card, cover, level }) => (
              <SeriesTile
                key={`${card.language}/${card.slug}`}
                to={seriesReadPath(card.language, card.slug)}
                title={card.title}
                language={card.language}
                cover={cover}
                level={level}
                languageLabel={nativeName(card.language)}
                episodes={t('series.episodes', { count: card.episode_count })}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
