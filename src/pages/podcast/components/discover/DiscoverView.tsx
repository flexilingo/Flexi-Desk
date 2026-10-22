import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Rss,
  Loader2,
  Flame,
  Star,
  GraduationCap,
  Newspaper,
  FlaskConical,
  Globe,
  Palette,
  Cpu,
  Headphones,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDiscoverStore } from '../../stores/discoverStore';
import { usePodcastStore } from '../../stores/podcastStore';
import { useAuthStore } from '@/stores/authStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { getCuratedList } from '../../services/podcastCloud';
import {
  readPodcastQuery,
  semanticSearch,
  type PodcastReading,
  type SemanticHit,
} from '../../services/podcastSearch';
import { HorizontalSection } from './HorizontalSection';
import { PodcastCardCompact } from './PodcastCardCompact';
import type { CuratedPodcast, PodcastFeed, PodcastIndexFeed } from '../../types';
import type { LucideIcon } from 'lucide-react';

import { PodcastHubHero } from '../hub/PodcastHubHero';
import { PodcastFilterPills } from '../hub/PodcastFilterPills';
import { FeaturedPodcastCard } from '../hub/FeaturedPodcastCard';
import { EpisodeLevelGrid } from '../hub/EpisodeLevelGrid';
import { HotEpisodesSection } from '../hub/HotEpisodesSection';
import { NewEpisodesListSection } from '../hub/NewEpisodesListSection';
import { HubViewList } from '../hub/HubViewList';
import { SemanticEpisodeResults } from '../hub/SemanticEpisodeResults';
import {
  EPISODE_VIEWS,
  HUB_PAGE_SIZE,
  applyReading,
  effectiveView,
  parseHubParams,
  serializeHubParams,
  DURATION_MAX_MINUTES,
  type HubParams,
} from '../../utils/hubParams';
import { exactTitleFirst } from '../../utils/exactTitle';
import { keepSemanticHits, laneOrder, planSearchLanes } from '../../utils/semantic';

/** Matches front's hub page size. */
const FILTER_PAGE_SIZE = HUB_PAGE_SIZE;
const PI_PAGE_SIZE = 20;

const CATEGORY_CONFIG: { cat: string; slug: string; labelKey: string; icon: LucideIcon }[] = [
  { cat: 'Education', slug: 'education', labelKey: 'podcast.catEducation', icon: GraduationCap },
  { cat: 'News', slug: 'news', labelKey: 'podcast.catNews', icon: Newspaper },
  { cat: 'Arts', slug: 'arts', labelKey: 'podcast.catArts', icon: Palette },
  { cat: 'Science', slug: 'science', labelKey: 'podcast.catScience', icon: FlaskConical },
  { cat: 'Society-Culture', slug: 'society', labelKey: 'podcast.catSocietyCulture', icon: Globe },
  { cat: 'Technology', slug: 'technology', labelKey: 'podcast.catTechnology', icon: Cpu },
];

export function DiscoverView() {
  const { t } = useTranslation('common');
  const { t: tp } = useTranslation('podcastUi');
  const session = useAuthStore((s) => s.session);

  const {
    trendingFeeds,
    isTrendingLoading,
    categoryFeeds,
    categoryLoading,
    followedFeedIds,
    followingFeedId,
    starterPodcasts,
    isStarterLoading,
    popularPodcasts,
    popularEpisodes,
    isPopularEpisodesLoading,
    newEpisodes,
    isNewEpisodesLoading,
    episodesByLevel,
    episodesByLevelTotal,
    isEpisodesByLevelLoading,
    fetchEpisodesByLevel,
    publicStats,
    curatedRow,
    isCuratedRowLoading,
    filterResults,
    filterTotal,
    filterSource,
    isFilterLoading,
    piSearchResults,
    isPiSearchLoading,
    searchPodcastIndex,
    fetchAll,
    followPodcast,
    fetchFilteredResults,
  } = useDiscoverStore();
  const navigate = useNavigate();
  const {
    playEpisodeByLevel,
    playCuratedEpisode,
    playSemanticHit,
    importingId,
    error: importError,
  } = useImportAndPlay();

  const { feeds: localFeeds, isLoadingFeeds, isAddingFeed, addFeed, loadFeed } = usePodcastStore();

  // Subscribing then opening a feed is one motion; navigation is the router's.
  const openFeedRoute = (feed: PodcastFeed) => {
    loadFeed(feed);
    navigate(`/podcast/feed/${feed.id}`);
  };

  const [feedUrl, setFeedUrl] = useState('');

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
  const view = effectiveView(params);
  const searching = debouncedSearch.trim() !== '';

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  const handleAddFeed = async () => {
    if (!feedUrl.trim()) return;
    await addFeed(feedUrl.trim());
    setFeedUrl('');
  };

  // A cloud podcast opens its detail page. It used to force-subscribe the whole
  // RSS feed locally just to look at it, which is not what a click means.
  const openPodcastRoute = (feedId: number) => navigate(`/podcast/show/${feedId}`);

  const handleCloudPodcastClick = (feedId: number) => openPodcastRoute(feedId);

  const handleOpenCurated = (p: CuratedPodcast) => openPodcastRoute(p.feed_id);

  const handleLocalFeedClick = (feedId: string) => {
    const feed = localFeeds.find((f) => f.id === feedId);
    if (feed) openFeedRoute(feed);
  };

  // Smart featured: prefer most-listened, fall back to top curated
  const featured = popularPodcasts[0] ?? curatedRow[0];
  const restCurated = curatedRow.slice(1);

  const totalPages = Math.ceil(filterTotal / FILTER_PAGE_SIZE);

  const podcastsLane = (isFilterLoading || filterResults.length > 0) && plan.podcasts && (
    <section key="podcasts" className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">
        {tp('searchPodcastsSection')}
        {filterTotal > 0 ? ` (${filterTotal})` : ''}
      </h2>
      {isFilterLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <PodcastGrid
          results={curatedRanked.items}
          source={filterSource}
          followedFeedIds={followedFeedIds}
          followingFeedId={followingFeedId}
          onFollow={session ? followPodcast : undefined}
          onClick={handleCloudPodcastClick}
        />
      )}
    </section>
  );
  const episodesLane = (
    <div key="episodes">
      <EpisodeLevelGrid
        episodes={episodesByLevel}
        total={episodesByLevelTotal}
        isLoading={isEpisodesByLevelLoading}
        page={page}
        pageSize={FILTER_PAGE_SIZE}
        onPageChange={(p) => update({ page: p })}
        onPlay={playEpisodeByLevel}
        onOpenPodcast={openPodcastRoute}
        heading={`${tp('searchEpisodesSection')}${episodesByLevelTotal > 0 ? ` (${episodesByLevelTotal})` : ''}`}
        hideWhenEmpty
      />
    </div>
  );
  const discoverLane = (isPiSearchLoading || piDeduped.length > 0) && plan.discover && (
    <section key="discover" className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">
        {tp('searchDiscoverSection')}
        {!isPiSearchLoading && piDeduped.length > 0 && (
          <span className="ml-1 font-normal text-muted-foreground">({piDeduped.length})</span>
        )}
      </h2>
      <PodcastGrid
        results={piRanked.items}
        source="podcastindex"
        followedFeedIds={followedFeedIds}
        followingFeedId={followingFeedId}
        onFollow={session ? followPodcast : undefined}
        onClick={handleCloudPodcastClick}
      />
      {hasMorePi && !isPiSearchLoading && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={() => setPiMax((n) => n + PI_PAGE_SIZE)}>
            {tp('loadMore')}
          </Button>
        </div>
      )}
      {isPiSearchLoading && piMax > PI_PAGE_SIZE && (
        <div className="flex justify-center pt-1">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
    </section>
  );
  const lanes = { podcasts: podcastsLane, episodes: episodesLane, discover: discoverLane };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <PodcastHubHero stats={publicStats} />

      {importError && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
          {importError}
        </div>
      )}

      {/* RSS Feed Input */}
      <div className="flex items-center gap-2">
        <Input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder={t('podcast.rssFeedUrl')}
          onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
          className="flex-1 font-mono text-sm"
        />
        <Button onClick={handleAddFeed} disabled={isAddingFeed || !feedUrl.trim()} size="sm">
          {isAddingFeed ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t('podcast.addFeed')}
        </Button>
      </div>

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
        resultCount={searching || view === 'overview' ? undefined : viewTotal}
        resultKind={EPISODE_VIEWS.includes(view) ? 'episodes' : 'podcasts'}
      />

      {searching ? (
        /* ===== Search mode: the lanes, then what is said inside episodes ===== */
        <div className="space-y-8">
          {(eff.described || eff.browsing) && (
            <p className="text-sm text-muted-foreground">
              {eff.browsing ? tp('readAsBrowse') : tp('readAs', { filters: readingLabel })}
            </p>
          )}
          {laneOrder(exactInDiscover).map((key) => lanes[key])}

          {totalPages > 1 && plan.podcasts && !isFilterLoading && filterResults.length > 0 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => update({ page: Math.max(1, page - 1) })}
                disabled={page <= 1}
                className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                {t('podcast.previous')}
              </button>
              <span className="px-3 text-sm tabular-nums text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => update({ page: Math.min(totalPages, page + 1) })}
                disabled={page >= totalPages}
                className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                {t('podcast.next')}
              </button>
            </div>
          )}

          {nothingFound && (
            <div className="space-y-5">
              <NoResults />
              {rescue.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-bold text-foreground">{tp('readAsBrowse')}</h2>
                  <PodcastGrid
                    results={rescue}
                    source="db"
                    followedFeedIds={followedFeedIds}
                    followingFeedId={followingFeedId}
                    onFollow={session ? followPodcast : undefined}
                    onClick={handleCloudPodcastClick}
                  />
                </section>
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
        </div>
      ) : view !== 'overview' ? (
        /* ===== A view (Just analyzed, New podcasts, Latest, Most popular, Curated) narrowed by the bar ===== */
        <HubViewList
          view={view}
          cefr={cefr}
          topic={topic}
          language={language}
          duration={duration}
          page={page}
          onPageChange={(p) => update({ page: p })}
          onTotalChange={setViewTotal}
        />
      ) : (
        /* ===== Overview: desk's discovery page (subscriptions, trending, categories) ===== */
        <div className="space-y-8">
          {/* Starter podcasts for brand-new users */}
          {localFeeds.length === 0 && !isLoadingFeeds && starterPodcasts.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-sm font-semibold text-foreground">{tp('starterTitle')}</h3>
              {isStarterLoading ? (
                <div className="flex items-center gap-2 py-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">{tp('starterLoading')}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {starterPodcasts.map((p) => {
                    const url = p.rssUrl ?? '';
                    return (
                      <button
                        key={url}
                        onClick={() => addFeed(url)}
                        disabled={isAddingFeed || !url}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Headphones className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{p.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Featured podcast (smart) */}
          {featured && <FeaturedPodcastCard podcast={featured} onListen={handleOpenCurated} />}

          {/* My Subscriptions (local feeds) — "See all" opens the local library */}
          {localFeeds.length > 0 && (
            <HorizontalSection
              title={t('podcast.mySubscriptions')}
              icon={Rss}
              isLoading={isLoadingFeeds}
              isEmpty={localFeeds.length === 0}
              onMoreClick={() => navigate('/podcast/library')}
            >
              {localFeeds.map((feed) => (
                <button
                  key={feed.id}
                  onClick={() => handleLocalFeedClick(feed.id)}
                  className="w-50 shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
                >
                  <div className="relative h-36 bg-muted">
                    {feed.artworkUrl ? (
                      <img
                        src={feed.artworkUrl}
                        alt={feed.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Headphones className="h-10 w-10 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="mb-0.5 line-clamp-1 text-sm font-semibold text-foreground">
                      {feed.title}
                    </p>
                    {feed.author && (
                      <p className="mb-2 line-clamp-1 text-xs text-muted-foreground">
                        {feed.author}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {tp('episodesCount', { count: feed.episodeCount })}
                    </p>
                  </div>
                </button>
              ))}
            </HorizontalSection>
          )}

          {/* Hot This Week */}
          <HotEpisodesSection
            episodes={popularEpisodes}
            isLoading={isPopularEpisodesLoading}
            openingId={importingId}
            onOpen={playCuratedEpisode}
          />

          {/* Just Analyzed */}
          <NewEpisodesListSection
            episodes={newEpisodes}
            isLoading={isNewEpisodesLoading}
            openingId={importingId}
            onOpen={playCuratedEpisode}
          />

          {/* Curated by FlexiLingo (horizontal) */}
          {restCurated.length > 0 && (
            <HorizontalSection
              title={t('podcast.curatedByFlexiLingo')}
              icon={Star}
              isLoading={isCuratedRowLoading}
              isEmpty={restCurated.length === 0}
            >
              {restCurated.map((p) => (
                <PodcastCardCompact
                  key={p.id}
                  data={{ type: 'curated', podcast: p }}
                  isFollowed={followedFeedIds.has(p.feed_id)}
                  isFollowing={followingFeedId === p.feed_id}
                  onFollow={session ? followPodcast : undefined}
                  onClick={handleCloudPodcastClick}
                />
              ))}
            </HorizontalSection>
          )}

          {/* Trending Among Learners */}
          {popularPodcasts.length > 0 && (
            <HorizontalSection
              title={t('podcast.trendingAmongLearners')}
              icon={Flame}
              isLoading={false}
              isEmpty={popularPodcasts.length === 0}
            >
              {popularPodcasts.map((p) => (
                <PodcastCardCompact
                  key={p.id}
                  data={{ type: 'curated', podcast: p }}
                  isFollowed={followedFeedIds.has(p.feed_id)}
                  isFollowing={followingFeedId === p.feed_id}
                  onFollow={session ? followPodcast : undefined}
                  onClick={handleCloudPodcastClick}
                />
              ))}
            </HorizontalSection>
          )}

          {/* Trending Now (PodcastIndex) */}
          <HorizontalSection
            title={t('podcast.trendingNow')}
            icon={Flame}
            isLoading={isTrendingLoading}
            isEmpty={trendingFeeds.length === 0}
            onMoreClick={() => navigate('/podcast/browse/trending')}
          >
            {trendingFeeds.map((feed) => (
              <PodcastCardCompact
                key={feed.id}
                data={{ type: 'feed', podcast: feed }}
                isFollowed={followedFeedIds.has(feed.id)}
                isFollowing={followingFeedId === feed.id}
                onFollow={session ? followPodcast : undefined}
                onClick={handleCloudPodcastClick}
              />
            ))}
          </HorizontalSection>

          {/* Category rows */}
          {CATEGORY_CONFIG.map(({ cat, slug, labelKey, icon }) => (
            <HorizontalSection
              key={cat}
              title={t(labelKey)}
              icon={icon}
              isLoading={categoryLoading[cat] ?? false}
              isEmpty={!categoryFeeds[cat] || categoryFeeds[cat].length === 0}
              onMoreClick={() => navigate(`/podcast/browse/${slug}`)}
            >
              {(categoryFeeds[cat] ?? []).map((feed) => (
                <PodcastCardCompact
                  key={feed.id}
                  data={{ type: 'feed', podcast: feed }}
                  isFollowed={followedFeedIds.has(feed.id)}
                  isFollowing={followingFeedId === feed.id}
                  onFollow={session ? followPodcast : undefined}
                  onClick={handleCloudPodcastClick}
                />
              ))}
            </HorizontalSection>
          ))}
        </div>
      )}
    </div>
  );
}

/** Grid of cloud podcasts — rows come from either the curated DB or PodcastIndex. */
function PodcastGrid({
  results,
  source,
  followedFeedIds,
  followingFeedId,
  onFollow,
  onClick,
}: {
  results: (CuratedPodcast | PodcastIndexFeed)[];
  source: 'db' | 'podcastindex' | null;
  followedFeedIds: Set<number>;
  followingFeedId: number | null;
  onFollow?: (feedId: number) => void;
  onClick: (feedId: number) => void;
}) {
  const isFeed = source === 'podcastindex';
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {results.map((podcast) => {
        const feedId = isFeed
          ? (podcast as PodcastIndexFeed).id
          : (podcast as CuratedPodcast).feed_id;
        return (
          <PodcastCardCompact
            key={feedId}
            data={
              isFeed
                ? { type: 'feed', podcast: podcast as PodcastIndexFeed }
                : { type: 'curated', podcast: podcast as CuratedPodcast }
            }
            isFollowed={followedFeedIds.has(feedId)}
            isFollowing={followingFeedId === feedId}
            onFollow={onFollow}
            onClick={onClick}
          />
        );
      })}
    </div>
  );
}

function NoResults() {
  const { t } = useTranslation('common');
  return (
    <div className="py-12 text-center">
      <Headphones className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground">{t('podcast.noResults')}</p>
    </div>
  );
}
