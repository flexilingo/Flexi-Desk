import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Trash2, Plus, RotateCcw, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { SyncPoint, RawSyncPoint, PodcastTranscriptSegment } from '../types';
import { mapSyncPoint, formatTimeMs } from '../types';

interface SubtitleSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  currentTime: number; // seconds
  segments: PodcastTranscriptSegment[];
  onSyncPointsChanged: (points: SyncPoint[]) => void;
}

const DELTA_BUTTONS = [
  { label: '-5s', delta: -5 },
  { label: '-2s', delta: -2 },
  { label: '-1s', delta: -1 },
  { label: '-0.5s', delta: -0.5 },
  { label: '+0.5s', delta: 0.5 },
  { label: '+1s', delta: 1 },
  { label: '+2s', delta: 2 },
  { label: '+5s', delta: 5 },
];

export function SubtitleSyncDialog({
  open,
  onOpenChange,
  episodeId,
  currentTime,
  segments,
  onSyncPointsChanged,
}: SubtitleSyncDialogProps) {
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);
  const [globalOffset, setGlobalOffset] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load existing sync points
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId })
      .then((raw) => {
        const points = raw.map(mapSyncPoint);
        setSyncPoints(points);
        if (points.length === 1) {
          setGlobalOffset(points[0].audioTime - points[0].subtitleTime);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [open, episodeId]);

  const handleAddSyncPoint = (segmentStartMs: number) => {
    const audioTime = currentTime;
    const subtitleTime = segmentStartMs / 1000;
    const newPoint: SyncPoint = {
      id: -Date.now(), // temp id
      episodeId,
      audioTime,
      subtitleTime,
    };
    setSyncPoints((prev) => [...prev, newPoint].sort((a, b) => a.audioTime - b.audioTime));
  };

  const handleRemoveSyncPoint = (index: number) => {
    setSyncPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyDelta = (delta: number) => {
    setGlobalOffset((prev) => prev + delta);
    // Create/update a single global sync point
    setSyncPoints([
      {
        id: -1,
        episodeId,
        audioTime: globalOffset + delta,
        subtitleTime: 0,
      },
    ]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const points = syncPoints.map((p) => ({
        audio_time: p.audioTime,
        subtitle_time: p.subtitleTime,
      }));
      const raw = await invoke<RawSyncPoint[]>('podcast_save_sync_points', {
        episodeId,
        points,
      });
      const saved = raw.map(mapSyncPoint);
      setSyncPoints(saved);
      onSyncPointsChanged(saved);
      onOpenChange(false);
    } catch {
      // silently fail
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    await invoke('podcast_clear_sync_points', { episodeId }).catch(() => {});
    setSyncPoints([]);
    setGlobalOffset(0);
    onSyncPointsChanged([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>Subtitle Sync</DialogTitle>
          <DialogDescription>
            Adjust subtitle timing to match the audio. Use delta buttons for global offset, or click
            a segment to create a sync point at the current playback position.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Quick offset buttons */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Quick Offset</span>
            <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
              {globalOffset >= 0 ? '+' : ''}
              {globalOffset.toFixed(1)}s
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DELTA_BUTTONS.map((btn) => (
              <Button
                key={btn.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => handleApplyDelta(btn.delta)}
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Sync points list */}
        <div className="px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Sync Points ({syncPoints.length})
            </span>
            {syncPoints.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-destructive hover:text-destructive"
                onClick={handleClear}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {syncPoints.length > 0 && (
          <div className="px-4 space-y-1 pb-2">
            {syncPoints.map((sp, i) => (
              <div
                key={sp.id}
                className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/30 text-xs"
              >
                <span className="font-mono tabular-nums text-[#8BB7A3]">
                  A: {sp.audioTime.toFixed(1)}s
                </span>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="font-mono tabular-nums text-[#C58C6E]">
                  S: {sp.subtitleTime.toFixed(1)}s
                </span>
                <span className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => handleRemoveSyncPoint(i)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Segment list — click to create sync point */}
        <ScrollArea className="flex-1 max-h-[30vh]">
          <div className="p-4 space-y-1">
            <span className="text-xs font-medium text-muted-foreground mb-2 block">
              Click a segment to sync it to current time ({currentTime.toFixed(1)}s)
            </span>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : segments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No transcript segments available.
              </p>
            ) : (
              segments.map((seg) => (
                <button
                  key={seg.id}
                  className="w-full text-left flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-xs group transition-colors"
                  onClick={() => handleAddSyncPoint(seg.startMs)}
                >
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">
                    {formatTimeMs(seg.startMs)}
                  </span>
                  <span className="flex-1 text-foreground/80 line-clamp-1">{seg.text}</span>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <Separator />

        <DialogFooter className="p-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
