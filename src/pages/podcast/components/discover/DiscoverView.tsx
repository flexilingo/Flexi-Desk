import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Headphones, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '@/components/ui/button';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { getCuratedList } from '../../services/podcastCloud';
import {
  readPodcastQuery,
  semanticSearch,
  type PodcastReading,
  type SemanticHit,
} from '../../services/podcastSearch';
import type { CuratedPodcast } from '../../types';

import { PodcastPageHeader } from '../PodcastPageHeader';
import { PodcastFilterPills } from '../hub/PodcastFilterPills';
import { FeaturedPodcastCard } from '../hub/FeaturedPodcastCard';
import { CategoryGrid } from '../hub/CategoryGrid';
import { EpisodeCardGrid } from '../hub/EpisodeCardGrid';
import { HubPager } from '../hub/HubPager';
import { PodcastTileGrid } from '../hub/PodcastTileCard';
import { HubViewList } from '../hub/HubViewList';
import { SemanticEpisodeResults } from '../hub/SemanticEpisodeResults';
import {
  EPISODE_VIEWS,
  HUB_PAGE_SIZE,
  applyReading,
  hasActiveFilter,
  parseHubParams,
  serializeHubParams,
  DURATION_MAX_MINUTES,
  type HubParams,
} from '../../utils/hubParams';
import { exactTitleFirst } from '../../utils/exactTitle';
import { keepSemanticHits, laneOrder, planSearchLanes } from '../../utils/semantic';

/** Matches the website's hub page size. */
const FILTER_PAGE_SIZE = HUB_PAGE_SIZE;
const PI_PAGE_SIZE = 20;

export function DiscoverView() {
  const { t } = useTranslation('common');
  const { t: tp } = useTranslation('podcastUi');

  const {
    popularPodcasts,
    curatedRow,
    isCuratedRowLoading,
    episodesByLevel,
    episodesByLevelTotal,
    isEpisodesByLevelLoading,
    fetchEpisodesByLevel,
    filterResults,
    filterTotal,
    isFilterLoading,
    piSearchResults,
    isPiSearchLoading,
    searchPodcastIndex,
    fetchPopularPodcasts,
    fetchCuratedRow,
    fetchFilteredResults,
  } = useDiscoverStore();
  const navigate = useNavigate();
  const {
    playEpisodeByLevel,
    playSemanticHit,
    importingId,
    error: importError,
  } = useImportAndPlay();

  const openPodcastRoute = (feedId: number) => navigate(`/podcast/show/${feedId}`);

  // Every filter, the view and the page live in the URL, so Back from a show or an episode returns to
  // the same list, and a refresh opens exactly this one.
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => parseHubParams(searchParams), [searchParams]);
  const paramsRef = useRef<HubParams>(params);
  useEffect(() => {
    paramsRef.current = params;
  });
  const update = useCallback(
    (patch: Partial<HubParams>) => {
      // A filter or search change starts the list over; an explicit page in the patch wins.
      const next = { ...paramsRef.current, page: 1, ...patch };
      paramsRef.current = next;
      setSearchParams(serializeHubParams(next), { replace: true });
    },
    [setSearchParams],
  );

  const [searchInput, setSearchInput] = useState(params.q);
  // The input follows the URL when something else changes it (Back, a menu link).
  useEffect(() => {
    setSearchInput((cur) => (cur.trim() === params.q.trim() ? cur : params.q));
  }, [params.q]);
  // Debounce: the URL (and so every request) takes the typed text 400 ms after the last keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== paramsRef.current.q) update({ q: searchInput });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, update]);

  const { q: debouncedSearch, cefr, topic, language, duration, page } = params;
  const view = params.view;
  const searching = debouncedSearch.trim() !== '';

  // The featured pick: the most-listened show, else the top curated one.
  useEffect(() => {
    fetchPopularPodcasts();
    fetchCuratedRow();
  }, [fetchPopularPodcasts, fetchCuratedRow]);

  // READ THE SENTENCE FIRST, in the one place the whole product reads it ("podcasts for kids" is a
  // category, "beginner" means A2). Checked against the query it answers: a reading of the last
  // thing typed must not decide how THIS text is searched.
  const [reading, setReading] = useState<{ q: string; read: PodcastReading } | null>(null);
  useEffect(() => {
    if (!searching) {
      setReading(null);
      return;
    }
    let cancelled = false;
    readPodcastQuery(debouncedSearch)
      .then((r) => {
        if (!cancelled) setReading({ q: debouncedSearch, read: r.interpreted });
      })
      .catch(() => {
        // The reading is an enrichment; without it the sentence is searched as a name.
        if (!cancelled) setReading(null);
      });
    return () => {
      cancelled = true;
    };
  }, [searching, debouncedSearch]);
  const read = reading?.q === debouncedSearch ? reading.read : undefined;
  const eff = useMemo(() => applyReading(params, read), [params, read]);
  const plan = planSearchLanes(debouncedSearch, eff);

  // A browse category (kids, business, true crime) has its own page; the language goes with it.
  useEffect(() => {
    if (!eff.section) return;
    const lang = eff.language ? `?language=${encodeURIComponent(eff.language)}` : '';
    navigate(`/podcast/browse/${eff.section}${lang}`);
  }, [eff.section, eff.language, navigate]);

  // The pills' view total, reported by the view itself.
  const [viewTotal, setViewTotal] = useState<number | undefined>();
  const [piMax, setPiMax] = useState(PI_PAGE_SIZE);
  useEffect(() => {
    setPiMax(PI_PAGE_SIZE);
  }, [debouncedSearch, language]);

  // Episodes lane: every search runs it.
  useEffect(() => {
    if (!plan.episodes) return;
    fetchEpisodesByLevel({
      level: eff.level,
      topic: eff.topic,
      search: eff.searchTerm,
      maxDuration: eff.duration,
      page,
      limit: FILTER_PAGE_SIZE,
    });
  }, [
    plan.episodes,
    eff.level,
    eff.topic,
    eff.searchTerm,
    eff.duration,
    page,
    fetchEpisodesByLevel,
  ]);

  // Shows lane. The level applies to a DESCRIBED query and not to a name: someone typing a title
  // wants that show, not whatever in their band resembles it.
  useEffect(() => {
    if (!plan.podcasts) return;
    fetchFilteredResults({
      cefr: eff.described ? eff.level : undefined,
      topic: eff.topic,
      language: eff.language,
      search: eff.searchTerm,
      sort: 'score',
      page,
      limit: FILTER_PAGE_SIZE,
    });
  }, [
    plan.podcasts,
    eff.described,
    eff.level,
    eff.topic,
    eff.language,
    eff.searchTerm,
    page,
    fetchFilteredResults,
  ]);

  // PodcastIndex discovery: titles only, so only ever an answer to a name.
  useEffect(() => {
    if (!plan.discover || !eff.searchTerm) return;
    searchPodcastIndex(eff.searchTerm, eff.language, piMax);
  }, [plan.discover, eff.searchTerm, eff.language, piMax, searchPodcastIndex]);

  // Don't re-list a podcast that already appeared in the curated results, and apply the language to
  // the results: PodcastIndex takes a language parameter and ignores it.
  const curatedFeedIds = useMemo(
    () => new Set(filterResults.map((p) => ('feed_id' in p ? p.feed_id : p.id))),
    [filterResults],
  );
  const piDeduped = useMemo(() => {
    const want = eff.language?.toLowerCase();
    return piSearchResults
      .filter((f) => !curatedFeedIds.has(f.id))
      .filter((f) => !want || (f.language ?? '').toLowerCase().split('-')[0] === want);
  }, [piSearchResults, curatedFeedIds, eff.language]);
  const hasMorePi = piSearchResults.length >= piMax;

  // Semantic lane: runs for EVERY search; episodes matched by what is said inside them.
  const [semantic, setSemantic] = useState<{ q: string; hits: SemanticHit[] } | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  useEffect(() => {
    if (!plan.semantic) {
      setSemantic(null);
      setSemanticLoading(false);
      return;
    }
    let cancelled = false;
    setSemanticLoading(true);
    semanticSearch({
      q: debouncedSearch,
      types: ['podcast_episode'],
      levels: eff.level ? [eff.level] : undefined,
      languages: eff.language ? [eff.language] : undefined,
      limit: 12,
    })
      .then((res) => {
        if (!cancelled) setSemantic({ q: debouncedSearch, hits: res.results ?? [] });
      })
      .catch(() => {
        // The lane is an extra: failing means it is absent, never an error over the other lanes.
        if (!cancelled) setSemantic(null);
      })
      .finally(() => {
        if (!cancelled) setSemanticLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plan.semantic, debouncedSearch, eff.level, eff.language]);
  const semanticHits = useMemo(
    () => (semantic?.q === debouncedSearch ? keepSemanticHits(semantic.hits) : []),
    [semantic, debouncedSearch],
  );

  const nothingFound =
    searching &&
    !isFilterLoading &&
    !isEpisodesByLevelLoading &&
    !isPiSearchLoading &&
    !semanticLoading &&
    filterResults.length === 0 &&
    episodesByLevel.length === 0 &&
    piDeduped.length === 0 &&
    semanticHits.length === 0;

  // Never a bare dead end: an empty search answers with what we would recommend anyway.
  const [rescue, setRescue] = useState<CuratedPodcast[]>([]);
  useEffect(() => {
    if (!nothingFound) {
      setRescue([]);
      return;
    }
    let cancelled = false;
    getCuratedList({
      cefr: eff.level,
      topic: eff.topic,
      language: eff.language,
      sort: 'score',
      page: 1,
      limit: 12,
    })
      .then((res) => {
        if (!cancelled) setRescue(res.podcasts ?? []);
      })
      .catch(() => {
        if (!cancelled) setRescue([]);
      });
    return () => {
      cancelled = true;
    };
  }, [nothingFound, eff.level, eff.topic, eff.language]);

  // The show titled exactly as searched goes to the front of its lane; a discovery lane holding it
  // goes above the other two.
  const curatedRanked = useMemo(
    () => exactTitleFirst(filterResults, (p) => p.title, eff.searchTerm),
    [filterResults, eff.searchTerm],
  );
  const piRanked = useMemo(
    () => exactTitleFirst(piDeduped, (f) => f.title, eff.searchTerm),
    [piDeduped, eff.searchTerm],
  );
  const exactInDiscover = !curatedRanked.found && piRanked.found;

  const isSearching =
    searching && (isFilterLoading || isEpisodesByLevelLoading || isPiSearchLoading);
  const readingLabel = useMemo(() => {
    if (!read || read.as !== 'filters') return '';
    const u = read.understood;
    return [
      u.level ?? undefined,
      u.topic
        ? t(`podcast.topic${u.topic.charAt(0).toUpperCase()}${u.topic.slice(1)}`, {
            defaultValue: u.topic,
          })
        : undefined,
      u.language ?? undefined,
      u.duration
        ? tp('filterDurationUnder', { minutes: DURATION_MAX_MINUTES[u.duration] })
        : undefined,
      u.section ?? undefined,
    ]
      .filter(Boolean)
      .join(' \u00B7 ');
  }, [read, t, tp]);

  // Smart featured: prefer most-listened, fall back to top curated.
  const featured = popularPodcasts[0] ?? curatedRow[0];
  const filtered = hasActiveFilter(params, view);

  const searchHeading = (text: string) => (
    <p className="text-sm font-medium text-muted-foreground">{text}</p>
  );

  const podcastsLane = (isFilterLoading || filterResults.length > 0) && plan.podcasts && (
    <div key="podcasts" className="space-y-3">
      {searchHeading(`${tp('searchPodcastsSection')}${filterTotal > 0 ? ` (${filterTotal})` : ''}`)}
      <PodcastTileGrid
        podcasts={curatedRanked.items}
        isLoading={isFilterLoading}
        onOpen={openPodcastRoute}
        total={filterTotal}
      />
    </div>
  );
  const episodesLane = plan.episodes &&
    (isEpisodesByLevelLoading || episodesByLevel.length > 0) && (
      <div key="episodes" className="space-y-3">
        {searchHeading(
          `${tp('searchEpisodesSection')}${episodesByLevelTotal > 0 ? ` (${episodesByLevelTotal})` : ''}`,
        )}
        <EpisodeCardGrid
          episodes={episodesByLevel}
          isLoading={isEpisodesByLevelLoading}
          skeletonCount={12}
          onPlay={playEpisodeByLevel}
          onOpenPodcast={openPodcastRoute}
        />
        <HubPager
          page={page}
          totalPages={Math.max(1, Math.ceil(episodesByLevelTotal / FILTER_PAGE_SIZE))}
          totalCount={episodesByLevelTotal}
          pageSize={FILTER_PAGE_SIZE}
          onPageChange={(p) => {
            update({ page: p });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    );
  const discoverLane = (isPiSearchLoading || piDeduped.length > 0) && plan.discover && (
    <div key="discover" className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        {tp('searchDiscoverSection')}
        {!isPiSearchLoading && piDeduped.length > 0 && (
          <span className="ms-1 font-normal text-caption">({piDeduped.length})</span>
        )}
      </p>
      <PodcastTileGrid
        podcasts={piRanked.items}
        isLoading={isPiSearchLoading}
        onOpen={openPodcastRoute}
        total={piDeduped.length}
      />
      {hasMorePi && !isPiSearchLoading && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" onClick={() => setPiMax((n) => n + PI_PAGE_SIZE)}>
            {tp('loadMore')}
          </Button>
        </div>
      )}
      {isPiSearchLoading && piMax > PI_PAGE_SIZE && (
        <div className="flex justify-center pt-1">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      )}
    </div>
  );
  const lanes = { podcasts: podcastsLane, episodes: episodesLane, discover: discoverLane };

  return (
    <div className="space-y-5">
      <PodcastPageHeader active="browse" />

      {importError && (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error"
        >
          {importError}
        </p>
      )}

      <div className="space-y-5 md:space-y-6">
        {/* The hub's single filter bar */}
        <PodcastFilterPills
          searchQuery={searchInput}
          onSearchChange={(q) => {
            setSearchInput(q);
            // Clearing is immediate; typing waits for the debounce.
            if (q === '') update({ q: '' });
          }}
          isSearching={isSearching}
          selectedCefr={cefr}
          onCefrChange={(v) => update({ cefr: v })}
          selectedTopic={topic}
          onTopicChange={(v) => update({ topic: v })}
          selectedLanguage={language}
          onLanguageChange={(v) => update({ language: v })}
          selectedDuration={duration}
          onDurationChange={(v) => update({ duration: v })}
          // Episode length only means something where the results ARE episodes.
          showDuration={searching || EPISODE_VIEWS.includes(view)}
          view={searching ? undefined : view}
          onViewChange={(v) => update({ view: v })}
          // A search answers in several lanes, each with its own count.
          resultCount={searching ? undefined : viewTotal}
          resultKind={EPISODE_VIEWS.includes(view) ? 'episodes' : 'podcasts'}
        />

        {searching ? (
          /* ===== Search mode: the lanes, then what is said inside episodes ===== */
          <>
            {(eff.described || eff.browsing) && (
              <p className="text-sm text-caption">
                {eff.browsing ? tp('readAsBrowse') : tp('readAs', { filters: readingLabel })}
              </p>
            )}
            {laneOrder(exactInDiscover).map((key) => lanes[key])}

            {nothingFound && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-border bg-card py-12 text-center">
                  <Headphones className="mx-auto mb-4 h-12 w-12 text-caption" />
                  <p className="text-muted-foreground">{tp('noResults')}</p>
                </div>
                {rescue.length > 0 && (
                  <div className="space-y-3">
                    {searchHeading(tp('readAsBrowse'))}
                    <PodcastTileGrid
                      podcasts={rescue}
                      onOpen={openPodcastRoute}
                      total={rescue.length}
                    />
                  </div>
                )}
              </div>
            )}

            {plan.semantic && (
              <SemanticEpisodeResults
                hits={semanticHits}
                isLoading={semanticLoading}
                query={debouncedSearch}
                openingId={importingId}
                onOpen={(hit, startAt) => playSemanticHit(hit, startAt)}
              />
            )}
          </>
        ) : (
          /* ===== Discovery: the editor's pick, the chosen view, the categories ===== */
          <div className="w-full space-y-8 md:space-y-10">
            {isCuratedRowLoading && !featured ? (
              <div className="min-h-[200px] animate-pulse rounded-2xl border border-border bg-muted" />
            ) : (
              featured && (
                <FeaturedPodcastCard
                  podcast={featured}
                  onListen={(p) => openPodcastRoute(p.feed_id)}
                />
              )
            )}

            <section>
              <HubViewList
                view={view}
                cefr={cefr}
                topic={topic}
                language={language}
                duration={duration}
                page={page}
                onPageChange={(p) => update({ page: p })}
                onTotalChange={setViewTotal}
                showTotal={!filtered}
              />
            </section>

            <CategoryGrid />
          </div>
        )}
      </div>

      <div className="mt-12 text-center">
        <p className="text-xs text-muted-foreground">
          {tp('poweredByPodcastIndex')}{' '}
          <button
            type="button"
            onClick={() => void openUrl('https://podcastindex.org')}
            className="font-medium text-accent transition-colors hover:text-accent/80"
          >
            PodcastIndex.org
          </button>
        </p>
      </div>
    </div>
  );
}
