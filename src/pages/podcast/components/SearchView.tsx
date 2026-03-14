import { useState } from 'react';
import { ArrowLeft, Search, Plus, Loader2, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { usePodcastStore } from '../stores/podcastStore';
import type { ITunesSearchResult } from '../types';

export function SearchView() {
  const {
    searchResults,
    isSearching,
    searchQuery,
    isAddingFeed,
    setSearchQuery,
    searchItunes,
    subscribeFromSearch,
    goBack,
  } = usePodcastStore();

  const [subscribingUrl, setSubscribingUrl] = useState<string | null>(null);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    searchItunes(searchQuery.trim());
  };

  const handleSubscribe = async (result: ITunesSearchResult) => {
    setSubscribingUrl(result.feedUrl);
    await subscribeFromSearch(result);
    setSubscribingUrl(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>Discover Podcasts</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Search bar */}
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search podcasts on iTunes…"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </Button>
        </div>

        {/* Results */}
        {isSearching ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Search for podcasts by name, topic, or author
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {searchResults.map((result, i) => (
              <div
                key={`${result.feedUrl}-${i}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                {/* Artwork */}
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                  {result.artworkUrl ? (
                    <img
                      src={result.artworkUrl}
                      alt={result.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Headphones className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.author}</p>
                  <p className="text-xs text-muted-foreground">{result.genre}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubscribe(result)}
                  disabled={isAddingFeed && subscribingUrl === result.feedUrl}
                >
                  {isAddingFeed && subscribingUrl === result.feedUrl ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Subscribe
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
