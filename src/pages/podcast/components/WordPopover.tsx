import { useState } from 'react';
import { BookmarkPlus, Plus, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface WordPopoverProps {
  word: string;
  children: React.ReactNode;
  episodeId?: string;
  positionMs?: number;
}

export function WordPopover({ word, children, episodeId, positionMs }: WordPopoverProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

  const handleAddToSrs = async () => {
    setIsAdding(true);
    try {
      await invoke('srs_add_vocabulary', {
        word: word.toLowerCase(),
        language: 'en',
        sourceModule: 'podcast',
      });
      setAdded(true);
    } catch {
      // silently fail
    } finally {
      setIsAdding(false);
    }
  };

  const handleBookmark = async () => {
    if (!episodeId || positionMs === undefined) return;
    setIsBookmarking(true);
    try {
      await invoke('podcast_add_bookmark', {
        episodeId,
        positionMs,
        label: word,
        note: null,
      });
    } catch {
      // silently fail
    } finally {
      setIsBookmarking(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-3" side="top" align="center">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{word}</span>
            <Badge variant="outline" className="text-[10px]">
              EN
            </Badge>
          </div>

          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              className="justify-start h-7 text-xs"
              onClick={handleAddToSrs}
              disabled={isAdding || added}
            >
              {isAdding ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-3 w-3 mr-1.5" />
              )}
              {added ? 'Added to SRS' : 'Add to SRS'}
            </Button>

            {episodeId && positionMs !== undefined && (
              <Button
                variant="outline"
                size="sm"
                className="justify-start h-7 text-xs"
                onClick={handleBookmark}
                disabled={isBookmarking}
              >
                {isBookmarking ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <BookmarkPlus className="h-3 w-3 mr-1.5" />
                )}
                Bookmark at this time
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
