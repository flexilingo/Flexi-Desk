import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { HorizontalSection } from './HorizontalSection';
import { PodcastCardCompact } from './PodcastCardCompact';
import type {
  CefrLevel,
  CuratedPodcast,
  PodcastFeed,
  PodcastIndexFeed,
  TopicCategory,
} from '../../types';
import type { LucideIcon } from 'lucide-react';

import { PodcastHubHero } from '../hub/PodcastHubHero';
import { PodcastFilterPills } from '../hub/PodcastFilterPills';
import { FeaturedPodcastCard } from '../hub/FeaturedPodcastCard';
import { EpisodeLevelGrid } from '../hub/EpisodeLevelGrid';
import { HotEpisodesSection } from '../hub/HotEpisodesSection';
import { NewEpisodesListSection } from '../hub/NewEpisodesListSection';

/** Matches front's hub page size. */
const FILTER_PAGE_SIZE = 24; // 24 per page

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

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cefr, setCefr] = useState<CefrLevel | undefined>();
  const [topic, setTopic] = useState<TopicCategory | undefined>();
  const [language, setLanguage] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hasFilters = !!cefr || !!topic || !!language || !!debouncedSearch;

  /**
   * A level or topic selects EPISODES via the v2 `episodes-by-level` endpoint,
   * which only scores English audio — so a non-English language filter falls back
   * to the podcast-level `curated-list`.
   */
  const isEpisodeMode = (!!cefr || !!topic) && (!language || language === 'en');

  // Episodes: level / topic / search
  useEffect(() => {
    if (!isEpisodeMode && !debouncedSearch) return;
    fetchEpisodesByLevel({
      level: cefr,
      topic,
      search: debouncedSearch || undefined,
      page,
      limit: FILTER_PAGE_SIZE,
    });
  }, [isEpisodeMode, cefr, topic, debouncedSearch, page, fetchEpisodesByLevel]);

  // Podcasts: language filter, or a search term. Skipped for a pure level/topic pick.
  useEffect(() => {
    if (!hasFilters) return;
    if (isEpisodeMode && !debouncedSearch) return;
    fetchFilteredResults({
      // When searching, the level pill shouldn't also narrow the podcast list —
      // the episode grid below already applies it.
      cefr: debouncedSearch ? undefined : cefr,
      topic,
      language,
      search: debouncedSearch || undefined,
      sort: 'score',
      page,
      limit: FILTER_PAGE_SIZE,
    });
  }, [
    hasFilters,
    isEpisodeMode,
    debouncedSearch,
    cefr,
    topic,
    language,
    page,
    fetchFilteredResults,
  ]);

  // PodcastIndex discovery runs alongside the curated search.
  useEffect(() => {
    if (!debouncedSearch) return;
    searchPodcastIndex(debouncedSearch, language, 20);
  }, [debouncedSearch, language, searchPodcastIndex]);

  // Don't re-list a podcast that already appeared in the curated results.
  const curatedFeedIds = useMemo(
    () => new Set(filterResults.map((p) => ('feed_id' in p ? p.feed_id : p.id))),
    [filterResults],
  );
  const piDeduped = useMemo(
    () => piSearchResults.filter((f) => !curatedFeedIds.has(f.id)),
    [piSearchResults, curatedFeedIds],
  );

  const totalPages = Math.ceil(filterTotal / FILTER_PAGE_SIZE);
  const isSearching =
    !!debouncedSearch && (isFilterLoading || isEpisodesByLevelLoading || isPiSearchLoading);

  const resetPage = () => setPage(1);

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

      {/* Filter pills — the hub's single filter bar */}
      <PodcastFilterPills
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        isSearching={isSearching}
        selectedCefr={cefr}
        onCefrChange={(v) => {
          setCefr(v);
          resetPage();
        }}
        selectedTopic={topic}
        onTopicChange={(v) => {
          setTopic(v);
          resetPage();
        }}
        selectedLanguage={language}
        onLanguageChange={(v) => {
          setLanguage(v);
          resetPage();
        }}
      />

      {debouncedSearch ? (
        /* ===== Search mode: podcasts + scored episodes ===== */
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">
              {t('podcast.searchPodcastsHeading', { count: filterTotal })}
            </h2>
            {isFilterLoading ? (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : filterResults.length > 0 ? (
              <PodcastGrid
                results={filterResults}
                source={filterSource}
                followedFeedIds={followedFeedIds}
                followingFeedId={followingFeedId}
                onFollow={session ? followPodcast : undefined}
                onClick={handleCloudPodcastClick}
              />
            ) : null}
          </section>

          <EpisodeLevelGrid
            episodes={episodesByLevel}
            total={episodesByLevelTotal}
            isLoading={isEpisodesByLevelLoading}
            page={page}
            pageSize={FILTER_PAGE_SIZE}
            onPageChange={setPage}
            onPlay={playEpisodeByLevel}
            onOpenPodcast={openPodcastRoute}
            heading={t('podcast.searchEpisodesHeading', { count: episodesByLevelTotal })}
          />

          {piDeduped.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-foreground">
                {t('podcast.searchDiscoverMore')}
              </h2>
              <PodcastGrid
                results={piDeduped}
                source="podcastindex"
                followedFeedIds={followedFeedIds}
                followingFeedId={followingFeedId}
                onFollow={session ? followPodcast : undefined}
                onClick={handleCloudPodcastClick}
              />
            </section>
          )}

          {!isFilterLoading &&
            !isEpisodesByLevelLoading &&
            !isPiSearchLoading &&
            filterResults.length === 0 &&
            episodesByLevel.length === 0 &&
            piDeduped.length === 0 && <NoResults />}
        </div>
      ) : isEpisodeMode ? (
        /* ===== Episode mode: a CEFR level and/or topic (v2 per-episode difficulty) ===== */
        <EpisodeLevelGrid
          episodes={episodesByLevel}
          total={episodesByLevelTotal}
          isLoading={isEpisodesByLevelLoading}
          page={page}
          pageSize={FILTER_PAGE_SIZE}
          onPageChange={setPage}
          onPlay={playEpisodeByLevel}
          onOpenPodcast={openPodcastRoute}
          heading={
            cefr
              ? t('podcast.levelEpisodeCountAt', { count: episodesByLevelTotal, level: cefr })
              : t('podcast.levelEpisodeCount', { count: episodesByLevelTotal })
          }
        />
      ) : hasFilters ? (
        /* ===== Podcast mode: language filter (episodes-by-level is English-only) ===== */
        <div>
          {isFilterLoading ? (
            <div className="flex min-h-75 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filterResults.length > 0 ? (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('podcast.searchPodcastsHeading', { count: filterTotal })}
              </p>
              <PodcastGrid
                results={filterResults}
                source={filterSource}
                followedFeedIds={followedFeedIds}
                followingFeedId={followingFeedId}
                onFollow={session ? followPodcast : undefined}
                onClick={handleCloudPodcastClick}
              />

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {t('podcast.previous')}
                  </button>
                  <span className="px-3 text-sm tabular-nums text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {t('podcast.next')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <NoResults />
          )}
        </div>
      ) : (
        /* ===== Discovery Mode ===== */
        <div className="space-y-8">
          {/* Starter podcasts for brand-new users */}
          {localFeeds.length === 0 && !isLoadingFeeds && starterPodcasts.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Get Started — Top Language Learning Podcasts
              </h3>
              {isStarterLoading ? (
                <div className="flex items-center gap-2 py-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading podcasts…</span>
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
                      {feed.episodeCount} episodes
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
