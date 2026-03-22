import { useEffect, useState } from 'react';
import {
  Headphones,
  Plus,
  Rss,
  Loader2,
  Flame,
  Heart,
  GraduationCap,
  Newspaper,
  FlaskConical,
  Globe,
  Palette,
  Cpu,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDiscoverStore, CATEGORIES } from '../../stores/discoverStore';
import { usePodcastStore } from '../../stores/podcastStore';
import { useAuthStore } from '@/stores/authStore';
import { HorizontalSection } from './HorizontalSection';
import { PodcastCardCompact } from './PodcastCardCompact';
import { PodcastFilters } from './PodcastFilters';
import type { CefrLevel, CuratedPodcast, PodcastIndexFeed } from '../../types';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_CONFIG: { cat: string; slug: string; label: string; icon: LucideIcon }[] = [
  { cat: 'Education', slug: 'education', label: 'Education', icon: GraduationCap },
  { cat: 'News', slug: 'news', label: 'News', icon: Newspaper },
  { cat: 'Arts', slug: 'arts', label: 'Arts', icon: Palette },
  { cat: 'Science', slug: 'science', label: 'Science', icon: FlaskConical },
  { cat: 'Society-Culture', slug: 'society', label: 'Society & Culture', icon: Globe },
  { cat: 'Technology', slug: 'technology', label: 'Technology', icon: Cpu },
];

export function DiscoverView() {
  const session = useAuthStore((s) => s.session);

  const {
    trendingFeeds,
    isTrendingLoading,
    categoryFeeds,
    categoryLoading,
    followedPodcasts,
    isFollowedLoading,
    followedFeedIds,
    followingFeedId,
    starterPodcasts,
    isStarterLoading,
    filterResults,
    filterTotal,
    filterSource,
    isFilterLoading,
    fetchAll,
    followPodcast,
    fetchFilteredResults,
    setBrowseSection,
  } = useDiscoverStore();

  const {
    feeds: localFeeds,
    isLoadingFeeds,
    isAddingFeed,
    addFeed,
    openFeed,
  } = usePodcastStore();

  const [feedUrl, setFeedUrl] = useState('');

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cefr, setCefr] = useState<CefrLevel | undefined>();
  const [sort, setSort] = useState<'score' | 'newest' | 'name'>('score');
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch discovery data
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Fetch filtered results when filters change
  const hasFilters = !!cefr || sort !== 'score' || !!debouncedSearch;

  useEffect(() => {
    if (hasFilters) {
      fetchFilteredResults({
        search: debouncedSearch || undefined,
        cefr,
        sort,
        page,
        limit: 18,
      });
    }
  }, [hasFilters, debouncedSearch, cefr, sort, page, fetchFilteredResults]);

  const totalPages = Math.ceil(filterTotal / 18);

  const handleAddFeed = async () => {
    if (!feedUrl.trim()) return;
    await addFeed(feedUrl.trim());
    setFeedUrl('');
  };

  const handleCloudPodcastClick = async (_feedId: number, rssUrl?: string) => {
    if (!rssUrl) return;
    await addFeed(rssUrl);
    const newFeed = usePodcastStore.getState().feeds[0];
    if (newFeed) openFeed(newFeed);
  };

  const handleLocalFeedClick = (feedId: string) => {
    const feed = localFeeds.find((f) => f.id === feedId);
    if (feed) openFeed(feed);
  };

  return (
    <div className="space-y-6">
      {/* RSS Feed Input */}
      <div className="flex items-center gap-2">
        <Input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="Paste RSS feed URL…"
          onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
          className="flex-1 font-mono text-sm"
        />
        <Button onClick={handleAddFeed} disabled={isAddingFeed || !feedUrl.trim()} size="sm">
          {isAddingFeed ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>

      {/* PodcastIndex Stats Banner - only in discovery mode */}
      {!hasFilters && (
        <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
          <p className="text-sm font-medium text-foreground mb-3">
            🔍 Search across 4.6 million podcasts
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-foreground">4,640,963</span>
              <span className="text-xs text-muted-foreground">podcasts</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold text-accent">94,292</span>
              <span className="text-xs text-muted-foreground">new in last 3 days</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold text-accent">357,461</span>
              <span className="text-xs text-muted-foreground">new in last 30 days</span>
            </div>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-semibold text-accent">486,692</span>
              <span className="text-xs text-muted-foreground">new in last 90 days</span>
            </div>
            <div className="ml-auto hidden md:flex items-center gap-1 text-xs text-muted-foreground">
              Powered by
              <a
                href="https://podcastindex.org"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:text-accent/80 transition-colors ml-1"
              >
                PodcastIndex.org
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Filters - always visible */}
      <PodcastFilters
        selectedCefr={cefr}
        selectedSort={sort}
        searchQuery={searchInput}
        onCefrChange={(v) => { setCefr(v); setPage(1); }}
        onSortChange={(v) => { setSort(v); setPage(1); }}
        onSearchChange={setSearchInput}
      />

      {hasFilters ? (
        /* ===== Filtered/Search Results Grid ===== */
        <div>
          {isFilterLoading ? (
            <div className="min-h-[300px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary" />
                <span className="text-muted-foreground">Loading…</span>
              </div>
            </div>
          ) : filterResults.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Showing {filterTotal} podcasts
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filterResults.map((podcast) => {
                  const isFeed = filterSource === 'podcastindex';
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
                      onFollow={session ? followPodcast : undefined}
                      onClick={handleCloudPodcastClick}
                    />
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted-foreground px-3">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-50 hover:bg-muted transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Headphones className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">No results found</p>
            </div>
          )}
        </div>
      ) : (
        /* ===== Discovery Mode — Horizontal Rows ===== */
        <div>
          {/* Starter podcasts for new users */}
          {localFeeds.length === 0 && !isLoadingFeeds && starterPodcasts.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3 mb-8">
              <h3 className="text-sm font-semibold text-foreground">
                Get Started — Top Language Learning Podcasts
              </h3>
              {isStarterLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading podcasts…</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {starterPodcasts.map((p) => {
                    const url = p.rssUrl ?? '';
                    return (
                      <button
                        key={url}
                        onClick={() => addFeed(url)}
                        disabled={isAddingFeed || !url}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:border-primary/40 transition-colors"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Headphones className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* My Subscriptions (local feeds) */}
          <HorizontalSection
            title="My Subscriptions"
            icon={Rss}
            isLoading={isLoadingFeeds}
            isEmpty={localFeeds.length === 0}
          >
            {localFeeds.map((feed) => (
              <button
                key={feed.id}
                onClick={() => handleLocalFeedClick(feed.id)}
                className="w-[200px] shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
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
                  <p className="text-sm font-semibold text-foreground line-clamp-1 mb-0.5">
                    {feed.title}
                  </p>
                  {feed.author && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{feed.author}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">{feed.episodeCount} episodes</p>
                </div>
              </button>
            ))}
          </HorizontalSection>

          {/* Trending Now */}
          <HorizontalSection
            title="Trending Now"
            icon={Flame}
            isLoading={isTrendingLoading}
            isEmpty={trendingFeeds.length === 0}
            onMoreClick={() => setBrowseSection('trending')}
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
          {CATEGORY_CONFIG.map(({ cat, slug, label, icon }) => (
            <HorizontalSection
              key={cat}
              title={label}
              icon={icon}
              isLoading={categoryLoading[cat] ?? false}
              isEmpty={!categoryFeeds[cat] || categoryFeeds[cat].length === 0}
              onMoreClick={() => setBrowseSection(slug)}
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
