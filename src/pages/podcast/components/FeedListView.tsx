import { useState } from 'react';
import {
  Headphones,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  ChevronRight,
  Loader2,
  Rss,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { usePodcastStore } from '../stores/podcastStore';
import type { PodcastFeed } from '../types';

export function FeedListView() {
  const {
    feeds,
    isLoadingFeeds,
    isAddingFeed,
    addFeed,
    openFeed,
    deleteFeed,
    refreshFeed,
    setView,
  } = usePodcastStore();

  const [feedUrl, setFeedUrl] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleAddFeed = async () => {
    if (!feedUrl.trim()) return;
    await addFeed(feedUrl.trim());
    setFeedUrl('');
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    await deleteFeed(id);
    setDeletingId(null);
  };

  const handleRefresh = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRefreshingId(id);
    await refreshFeed(id);
    setRefreshingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Podcasts</CardTitle>
              <CardDescription>Subscribe to RSS feeds and learn from episodes</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView('search')}>
            <Search className="h-4 w-4" />
            Discover
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add feed input */}
        <div className="flex gap-2">
          <Input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="Paste RSS feed URL…"
            onKeyDown={(e) => e.key === 'Enter' && handleAddFeed()}
            className="flex-1 font-mono text-sm"
          />
          <Button onClick={handleAddFeed} disabled={isAddingFeed || !feedUrl.trim()}>
            {isAddingFeed ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add Feed
          </Button>
        </div>

        {/* Feed list */}
        {isLoadingFeeds ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : feeds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Rss className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No podcasts yet</p>
              <p className="text-sm text-muted-foreground">
                Add an RSS feed URL above or discover podcasts with the search button
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {feeds.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                isDeleting={deletingId === feed.id}
                isRefreshing={refreshingId === feed.id}
                onClick={() => openFeed(feed)}
                onDelete={(e) => handleDelete(e, feed.id)}
                onRefresh={(e) => handleRefresh(e, feed.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedRow({
  feed,
  isDeleting,
  isRefreshing,
  onClick,
  onDelete,
  onRefresh,
}: {
  feed: PodcastFeed;
  isDeleting: boolean;
  isRefreshing: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRefresh: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 hover:border-border"
    >
      {/* Artwork */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {feed.artworkUrl ? (
          <img
            src={feed.artworkUrl}
            alt={feed.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Headphones className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground truncate">{feed.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {feed.author && <span className="truncate max-w-[150px]">{feed.author}</span>}
          <span>{feed.episodeCount} episodes</span>
          <span>{feed.language.toUpperCase()}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="rounded-md p-1.5 text-muted-foreground hover:text-error hover:bg-error/10 transition-colors"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}
