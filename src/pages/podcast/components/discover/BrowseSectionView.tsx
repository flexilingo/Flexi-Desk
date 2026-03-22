import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  Heart,
  GraduationCap,
  Newspaper,
  Palette,
  FlaskConical,
  Globe,
  Cpu,
  Headphones,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiscoverStore } from '../../stores/discoverStore';
import { usePodcastStore } from '../../stores/podcastStore';
import { useAuthStore } from '@/stores/authStore';
import { PodcastCardCompact } from './PodcastCardCompact';
import type { LucideIcon } from 'lucide-react';

const PAGE_SIZE = 24;

interface SectionConfig {
  title: string;
  icon: LucideIcon;
}

const SECTION_MAP: Record<string, SectionConfig> = {
  trending: { title: 'Trending Now', icon: Flame },
  followed: { title: 'My Followed Podcasts', icon: Heart },
  education: { title: 'Education', icon: GraduationCap },
  news: { title: 'News', icon: Newspaper },
  arts: { title: 'Arts', icon: Palette },
  science: { title: 'Science', icon: FlaskConical },
  society: { title: 'Society & Culture', icon: Globe },
  technology: { title: 'Technology', icon: Cpu },
};

export function BrowseSectionView() {
  const session = useAuthStore((s) => s.session);
  const {
    browseSectionSlug,
    browseSectionItems,
    browseSectionTotal,
    browseSectionLoading,
    followedPodcasts,
    followedFeedIds,
    followingFeedId,
    clearBrowseSection,
    fetchBrowseSection,
    followPodcast,
  } = useDiscoverStore();

  const { addFeed, openFeed } = usePodcastStore();

  const [page, setPage] = useState(1);

  const slug = browseSectionSlug ?? '';
  const config = SECTION_MAP[slug];

  useEffect(() => {
    if (slug) {
      fetchBrowseSection(slug, page);
    }
  }, [slug, page, fetchBrowseSection]);

  const handleCloudPodcastClick = async (_feedId: number, rssUrl?: string) => {
    if (!rssUrl) return;
    await addFeed(rssUrl);
    const newFeed = usePodcastStore.getState().feeds[0];
    if (newFeed) openFeed(newFeed);
  };

  if (!config) return null;

  const SectionIcon = config.icon;

  // For followed section, paginate client-side
  const isFollowed = slug === 'followed';
  const displayItems = isFollowed
    ? followedPodcasts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : browseSectionItems;
  const total = isFollowed ? followedPodcasts.length : browseSectionTotal;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isLoading = browseSectionLoading;
  const hasItems = displayItems.length > 0;

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={clearBrowseSection}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Discover
      </button>

      {/* Page header */}
      <div className="flex items-center gap-2">
        <SectionIcon className="w-6 h-6 text-accent" />
        <h1 className="text-xl font-bold text-foreground">{config.title}</h1>
      </div>

      {/* Content */}
      {isLoading && !hasItems ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
            <span className="text-muted-foreground">Loading…</span>
          </div>
        </div>
      ) : !hasItems ? (
        <div className="text-center py-20">
          <SectionIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No podcasts found</p>
        </div>
      ) : (
        <>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              Showing {total} podcasts
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {isFollowed
              ? displayItems.map((p) => {
                  const podcast = p as typeof followedPodcasts[number];
                  return (
                    <PodcastCardCompact
                      key={podcast.id}
                      data={{ type: 'curated', podcast }}
                      isFollowed={followedFeedIds.has(podcast.feed_id)}
                      onClick={handleCloudPodcastClick}
                    />
                  );
                })
              : displayItems.map((feed) => (
                  <PodcastCardCompact
                    key={feed.id}
                    data={{ type: 'feed', podcast: feed }}
                    isFollowed={followedFeedIds.has(feed.id)}
                    isFollowing={followingFeedId === feed.id}
                    onFollow={session ? followPodcast : undefined}
                    onClick={handleCloudPodcastClick}
                  />
                ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
