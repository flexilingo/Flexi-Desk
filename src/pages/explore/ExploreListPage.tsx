import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Clock,
  Copy,
  Globe,
  Languages,
  Layers,
  Loader2,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/pages/review/stores/reviewStore';
import { listPublicDecks } from '@/pages/review/lib/deckCloud';
import {
  copiesOf,
  deckSourceLang,
  exploreFacets,
  filterPublicDecks,
  listableDecks,
  publicDeckTitle,
  type ExploreSort,
  type ExploreSource,
  type PublicDeckSummary,
} from '@/pages/review/lib/deckLogic';
import { languageLabel } from '@/pages/review/lib/deckLanguages';
import { useErrorText } from '@/pages/review/lib/useErrorText';
import { CloneDeckDialog } from './CloneDeckDialog';
import { DeckCoverImage } from './DeckCoverImage';

export function ExploreListPage() {
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { decks: library, fetchDecks } = useReviewStore();

  const [sort, setSort] = useState<ExploreSort>('recent');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<ExploreSource>('');
  const [language, setLanguage] = useState('');
  const [all, setAll] = useState<PublicDeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [cloneTarget, setCloneTarget] = useState<PublicDeckSummary | null>(null);

  useEffect(() => {
    void fetchDecks();
  }, [fetchDecks]);

  useEffect(() => {
    let live = true;
    setError(null);
    listPublicDecks({ sort })
      .then((r) => live && setAll(listableDecks(r)))
      .catch((e) => {
        if (!live) return;
        setError(errorText(e));
        setAll((cur) => cur ?? []);
      });
    return () => {
      live = false;
    };
  }, [sort, attempt, errorText]);

  const filters = { query, source, language, sort };
  const facets = useMemo(() => exploreFacets(all ?? [], filters), [all, query, source, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(
    () => filterPublicDecks(all ?? [], filters),
    [all, query, source, language, sort],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilter = !!(query || source || language);
  const clearAll = () => {
    setQuery('');
    setSource('');
    setLanguage('');
  };

  const sources: { id: ExploreSource; label: string }[] = [
    { id: '', label: t('explore.source.all') },
    { id: 'official', label: t('explore.source.official') },
    { id: 'users', label: t('explore.source.users') },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Globe className="h-6 w-6 text-accent" />
          {t('explore.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('explore.subtitle')}</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-light">
          <Languages className="h-4 w-4" />
          {t('explore.anyLanguageHint')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('explore.searchPlaceholder')}
            aria-label={t('explore.searchPlaceholder')}
            className="h-9 w-full rounded-md border border-border bg-card ps-9 pe-8 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('clear')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div
          role="tablist"
          aria-label={t('explore.sortLabel')}
          className="inline-flex rounded-lg border border-border bg-card p-1"
        >
          {(
            [
              ['recent', Clock, 'explore.newest'],
              ['popular', TrendingUp, 'explore.popular'],
            ] as const
          ).map(([id, Icon, key]) => (
            <button
              key={id}
              role="tab"
              aria-selected={sort === id}
              onClick={() => setSort(id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold',
                sort === id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(key)}
            </button>
          ))}
        </div>
        <div role="group" className="inline-flex rounded-lg border border-border bg-card p-1">
          {sources.map((s) => (
            <button
              key={s.id}
              aria-pressed={source === s.id}
              onClick={() => setSource(s.id)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold',
                source === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {s.label} <span className="tabular-nums opacity-70">{facets.sources[s.id]}</span>
            </button>
          ))}
        </div>
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <X className="h-4 w-4" />
            {t('explore.clearAll')}
          </Button>
        )}
      </div>

      {facets.languages.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t('explore.filterLanguage')}
        >
          {[
            ['', t('explore.allLanguages'), null] as const,
            ...facets.languages.map(([code, n]) => [code, languageLabel(code), n] as const),
          ].map(([code, label, n]) => (
            <button
              key={code || 'all'}
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                language === code
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/50',
              )}
            >
              <bdi>{label}</bdi>
              {n !== null && <span className="tabular-nums opacity-70">{n}</span>}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError className="flex-1" message={error} />
          <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </Button>
        </div>
      )}

      {all === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card px-8 py-14 text-center">
          <Globe className="mx-auto mb-3 h-9 w-9 text-accent" />
          <h3 className="mb-1.5 text-base font-bold">
            {hasFilter ? t('explore.noDecks') : t('explore.emptyTitle')}
          </h3>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {hasFilter ? t('explore.changeFilters') : t('explore.emptySubtitle')}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('explore.matchCount', { count: shown.length })}
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {shown.map((d) => {
              const lang = deckSourceLang(d.language_pair);
              const mine = copiesOf(library, d.id);
              const clones = d.total_clones ?? 0;
              return (
                <div
                  key={d.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
                >
                  <Link to={`/explore/${d.id}`} className="flex flex-1 flex-col">
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      <DeckCoverImage
                        coverUrl={d.cover_url}
                        sourceUrl={d.source_public ? d.source_url : null}
                        lang={lang}
                      />
                      <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-md bg-primary/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                        <Layers className="h-2.5 w-2.5" />
                        {t('cardsCount', { count: d.card_count })}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3
                        dir="auto"
                        className="mb-1 line-clamp-2 text-[13px] font-bold leading-snug"
                      >
                        {publicDeckTitle(d.title)}
                      </h3>
                      {d.official && (
                        <p className="mb-1 text-[11.5px] font-semibold text-primary-light">
                          FlexiLingo
                        </p>
                      )}
                      <div className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <bdi>{languageLabel(lang)}</bdi>
                        {mine.length > 0 ? (
                          <span className="ms-auto inline-flex items-center gap-1 font-semibold text-success">
                            <Check className="h-3 w-3" strokeWidth={3} />
                            {t('explore.inLibrary')}
                          </span>
                        ) : (
                          clones > 0 && (
                            <span className="ms-auto inline-flex items-center gap-1 tabular-nums">
                              <Copy className="h-3 w-3" />
                              {clones}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2">
                    {mine.length > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/review/deck/${mine[0].id}`)}
                      >
                        {t('explore.viewMyCopy')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setCloneTarget(d)}>
                        <Copy className="h-3.5 w-3.5" />
                        {t('explore.cloneButton')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <CloneDeckDialog
        deck={cloneTarget}
        open={!!cloneTarget}
        onClose={() => setCloneTarget(null)}
      />
    </div>
  );
}
