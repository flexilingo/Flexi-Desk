import { useEffect, useState } from 'react';
import {
  Headphones,
  Search,
  Plus,
  Sparkles,
  TrendingUp,
  Heart,
  GraduationCap,
  Newspaper,
  FlaskConical,
  Palette,
  Cpu,
  Rss,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDiscoverStore, CATEGORIES } from '../../stores/discoverStore';
import { usePodcastStore } from '../../stores/podcastStore';
import { useAuthStore } from '@/stores/authStore';
import { HorizontalSection } from './HorizontalSection';
import { PodcastCardCompact } from './PodcastCardCompact';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Education: GraduationCap,
  News: Newspaper,
  Science: FlaskConical,
  Arts: Palette,
  Technology: Cpu,
};


export function DiscoverView() {
  const session = useAuthStore((s) => s.session);

  const {
    curatedPodcasts,
    isCuratedLoading,
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
    fetchAll,
    followPodcast,
  } = useDiscoverStore();

  const {
    feeds: localFeeds,
    isLoadingFeeds,
    isAddingFeed,
    addFeed,
    openFeed,
    setView,
  } = usePodcastStore();

  const [feedUrl, setFeedUrl] = useState('');

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAddFeed = async () => {
    if (!feedUrl.trim()) return;
    await addFeed(feedUrl.trim());
    setFeedUrl('');
  };

  const handleCloudPodcastClick = async (feedId: number, rssUrl?: string) => {
    if (!rssUrl) return;
    // Subscribe locally, then open
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
      {/* Top bar: RSS input + Discover button */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-2">
          <Input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="Paste RSS feed URL…"
            onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
            className="flex-1 font-mono text-sm"
          />
          <Button onClick={handleAddFeed} disabled={isAddingFeed || !feedUrl.trim()} size="sm">
            {isAddingFeed ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setView('search')}>
          <Search className="h-4 w-4" />
          iTunes Search
        </Button>
      </div>

      {/* Starter podcasts for new users */}
      {localFeeds.length === 0 && !isLoadingFeeds && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Get Started — Top Language Learning Podcasts</h3>
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

      {/* Section: My Subscriptions (local feeds) */}
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
            className="w-[140px] shrink-0 overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:shadow-md hover:border-primary/30 active:scale-[0.98]"
          >
            <div className="relative h-[140px] w-[140px] bg-muted">
              {feed.artworkUrl ? (
                <img
                  src={feed.artworkUrl}
                  alt={feed.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Headphones className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="space-y-0.5 p-2">
              <p className="text-xs font-semibold leading-4 text-foreground line-clamp-2">
                {feed.title}
              </p>
              {feed.author && (
                <p className="text-[11px] leading-3 text-muted-foreground truncate">
                  {feed.author}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">{feed.episodeCount} episodes</p>
            </div>
          </button>
        ))}
      </HorizontalSection>

      {/* Section: My Followed Podcasts (cloud, requires auth) */}
      {session && (
        <HorizontalSection
          title="My Followed Podcasts"
          icon={Heart}
          isLoading={isFollowedLoading}
          isEmpty={followedPodcasts.length === 0}
        >
          {followedPodcasts.map((podcast) => (
            <PodcastCardCompact
              key={podcast.id}
              data={{ type: 'curated', podcast }}
              isFollowed
              onClick={handleCloudPodcastClick}
            />
          ))}
        </HorizontalSection>
      )}

      {/* Section: Analyzed by FlexiLingo */}
      <HorizontalSection
        title="Analyzed by FlexiLingo"
        icon={Sparkles}
        isLoading={isCuratedLoading}
        isEmpty={curatedPodcasts.length === 0}
      >
        {curatedPodcasts.map((podcast) => (
          <PodcastCardCompact
            key={podcast.id}
            data={{ type: 'curated', podcast }}
            isFollowed={followedFeedIds.has(podcast.feed_id)}
            isFollowing={followingFeedId === podcast.feed_id}
            onFollow={session ? followPodcast : undefined}
            onClick={handleCloudPodcastClick}
          />
        ))}
      </HorizontalSection>

      {/* Section: Trending Now */}
      <HorizontalSection
        title="Trending Now"
        icon={TrendingUp}
        isLoading={isTrendingLoading}
        isEmpty={trendingFeeds.length === 0}
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

      {/* Category sections */}
      {CATEGORIES.map((cat) => (
        <HorizontalSection
          key={cat}
          title={cat}
          icon={CATEGORY_ICONS[cat] ?? Headphones}
          isLoading={categoryLoading[cat] ?? false}
          isEmpty={!categoryFeeds[cat] || categoryFeeds[cat].length === 0}
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
  );
}
