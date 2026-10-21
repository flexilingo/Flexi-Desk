import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  Play,
  Pause,
  X,
  Search,
  MapPin,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SyncPoint, RawSyncPoint, PodcastTranscriptSegment } from '../types';
import { mapSyncPoint, formatTimeMs, getEffectiveOffset, mergeSyncPoint } from '../types';

const SAVE_DEBOUNCE_MS = 1500;

interface SubtitleSyncDialogProps {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  segments: PodcastTranscriptSegment[];
  currentTime: number; // seconds
  duration: number; // seconds
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (deltaSeconds: number) => void;
  onSeekTo: (time: number) => void;
  onSyncPointsChanged: (points: SyncPoint[]) => void;
}

/**
 * Full-screen subtitle sync studio (mirrors front's SubtitleSyncDialog):
 * play the audio, pause when you hear a line, click that line to anchor it
 * to the current playback position. Changes apply live and auto-save.
 */
export function SubtitleSyncDialog({
  open,
  onClose,
  episodeId,
  segments,
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
  onSeekTo,
  onSyncPointsChanged,
}: SubtitleSyncDialogProps) {
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing sync points when the dialog opens
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setSearchQuery('');
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId })
      .then((raw) => setSyncPoints(raw.map(mapSyncPoint)))
      .catch(() => setSyncPoints([]));
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [open, episodeId]);

  // Flush pending debounce on unmount/close
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const persistPoints = useCallback(
    (points: SyncPoint[]) => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(async () => {
        setIsSaving(true);
        setSaveError(null);
        try {
          await invoke<RawSyncPoint[]>('podcast_save_sync_points', {
            episodeId,
            points: points.map((p) => ({
              audio_time: p.audioTime,
              subtitle_time: p.subtitleTime,
            })),
          });
        } catch {
          setSaveError('Could not save sync points. They still apply for this session.');
        } finally {
          setIsSaving(false);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [episodeId],
  );

  // Apply live (player offset updates instantly) + auto-save debounced
  const applyPoints = useCallback(
    (points: SyncPoint[]) => {
      setSyncPoints(points);
      onSyncPointsChanged(points);
      persistPoints(points);
    },
    [onSyncPointsChanged, persistPoints],
  );

  const handleReset = () => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    setSyncPoints([]);
    onSyncPointsChanged([]);
    invoke('podcast_clear_sync_points', { episodeId }).catch(() =>
      setSaveError('Could not save sync points. They still apply for this session.'),
    );
  };

  // Offset applied to subtitle timestamps at the current playback position
  const effectiveOffset = useMemo(
    () => getEffectiveOffset(currentTime, syncPoints),
    [currentTime, syncPoints],
  );

  const activeSegmentIndex = useMemo(() => {
    if (!segments.length) return -1;
    return segments.findIndex((seg) => {
      const start = seg.startMs / 1000 + effectiveOffset;
      const end = seg.endMs / 1000 + effectiveOffset;
      return currentTime >= start && currentTime < end;
    });
  }, [segments, currentTime, effectiveOffset]);

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(q));
  }, [segments, searchQuery]);

  const displaySegments = filteredSegments ?? segments;

  // Suppress auto-scroll for 3s after the user scrolls the list manually
  const handleScroll = useCallback(() => {
    userScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 3000);
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll, open]);

  useEffect(() => {
    if (userScrollingRef.current) return;
    if (searchQuery.trim()) return;
    if (document.activeElement === searchInputRef.current) return;
    if (activeSegmentRef.current && listRef.current && activeSegmentIndex >= 0) {
      const containerRect = listRef.current.getBoundingClientRect();
      const elementRect = activeSegmentRef.current.getBoundingClientRect();
      const isVisible =
        elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom;
      if (!isVisible) {
        activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex, searchQuery]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [open, onClose]);

  const handleSegmentClick = (segment: PodcastTranscriptSegment) => {
    const newPoint: SyncPoint = {
      id: -Date.now(),
      episodeId,
      audioTime: Math.round(currentTime * 10) / 10,
      subtitleTime: segment.startMs / 1000,
    };
    applyPoints(mergeSyncPoint(syncPoints, newPoint));
  };

  // Positive delta = subtitles appear later (matches the applied `seg + offset`)
  const applyDelta = (delta: number) => {
    const newOffset = effectiveOffset + delta;
    const newPoint: SyncPoint = {
      id: -Date.now(),
      episodeId,
      audioTime: currentTime,
      subtitleTime: currentTime - newOffset,
    };
    applyPoints(mergeSyncPoint(syncPoints, newPoint));
  };

  const hasSyncPointForSegment = useCallback(
    (segment: PodcastTranscriptSegment): boolean =>
      syncPoints.some(
        (p) => p.subtitleTime >= segment.startMs / 1000 && p.subtitleTime < segment.endMs / 1000,
      ),
    [syncPoints],
  );

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeekTo(percent * duration);
  };

  const positiveDeltas = [0.5, 1, 2, 5];
  const negativeDeltas = [-0.5, -1, -2, -5];

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      {/* Top color strip */}
      <div className="h-1 bg-gradient-to-r from-accent to-accent/60 shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-2.5 lg:py-3.5 border-b border-border bg-card/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 lg:w-9 lg:h-9 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Timer className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold leading-none text-foreground">Sync subtitles</h2>
            <p className="text-[11px] lg:text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
              Play the audio, pause when you hear a line, then click that line below to sync.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RotateCcw className="w-3 h-3 animate-spin" />
              Saving…
            </span>
          )}
          {saveError && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3 h-3" />
              {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex w-9 h-9 items-center justify-center rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body: stacked on narrow windows, two-panel from lg up */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
        {/* Controls Panel */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-background px-3 py-2.5 lg:p-5 gap-2.5 lg:gap-6 lg:overflow-y-auto">
          {/* Progress bar + transport controls */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="flex-1 h-1.5 lg:h-2 bg-muted rounded-full cursor-pointer relative group"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent/70 rounded-full transition-[width] duration-100 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className="absolute top-1/2 w-3 h-3 bg-accent rounded-full -translate-x-1/2 -translate-y-1/2 border-2 border-background pointer-events-none group-hover:scale-110 transition-transform"
                  style={{ left: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[11px] lg:text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                <span className="font-semibold text-foreground">
                  {formatTimeMs(currentTime * 1000)}
                </span>
                <span> / {formatTimeMs(duration * 1000)}</span>
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onSeek(-5)}
                className="inline-flex w-8 h-8 lg:w-9 lg:h-9 items-center justify-center rounded-lg bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border transition-colors"
                title="-5s"
              >
                <SkipBack className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </button>
              <Button
                type="button"
                size="sm"
                onClick={onPlayPause}
                className="inline-flex items-center gap-1.5 h-8 lg:h-10 px-3.5 lg:px-4 text-xs lg:text-sm"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                    Play
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => onSeek(5)}
                className="inline-flex w-8 h-8 lg:w-9 lg:h-9 items-center justify-center rounded-lg bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border transition-colors"
                title="+5s"
              >
                <SkipForward className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </button>
            </div>
          </div>

          {/* Offset & sync points */}
          <div className="flex flex-col gap-1.5 lg:gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 flex-wrap">
                <span className="text-[11px] lg:text-xs text-muted-foreground">Offset:</span>
                <span
                  className={`text-sm lg:text-base tabular-nums font-bold ${
                    effectiveOffset !== 0 ? 'text-accent' : 'text-muted-foreground'
                  }`}
                >
                  {effectiveOffset > 0 ? '+' : ''}
                  {effectiveOffset.toFixed(1)}s
                </span>
                {syncPoints.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/15 text-success border border-success/30 text-[10px] font-semibold tabular-nums">
                    <MapPin className="w-2.5 h-2.5" />
                    {syncPoints.length} pt{syncPoints.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {syncPoints.length > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 px-2 py-1 lg:px-3 lg:py-2 rounded-lg text-[11px] lg:text-xs text-muted-foreground border border-border bg-card hover:bg-muted hover:text-foreground transition-colors shrink-0"
                  title="Reset sync points"
                >
                  <RotateCcw className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>

            {/* Delta buttons */}
            <div className="flex flex-col gap-1 lg:gap-1.5">
              <div className="flex items-center gap-1 lg:gap-1.5">
                {positiveDeltas.map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => applyDelta(delta)}
                    className="flex-1 inline-flex items-center justify-center py-1 lg:py-1.5 rounded-md text-[11px] lg:text-xs tabular-nums bg-card text-muted-foreground hover:bg-accent/10 hover:text-accent border border-border cursor-pointer transition-colors"
                  >
                    +{delta}s
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 lg:gap-1.5">
                {negativeDeltas.map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => applyDelta(delta)}
                    className="flex-1 inline-flex items-center justify-center py-1 lg:py-1.5 rounded-md text-[11px] lg:text-xs tabular-nums bg-card text-muted-foreground hover:bg-accent/10 hover:text-accent border border-border cursor-pointer transition-colors"
                  >
                    {delta}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Save error (visible on narrow windows too) */}
          {saveError && (
            <div className="sm:hidden flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {saveError}
            </div>
          )}

          {/* Instruction */}
          <div className="hidden lg:block lg:mt-auto p-3 rounded-2xl bg-accent/[0.08] border border-accent/25">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Play the audio, pause when you hear a subtitle line, then click that line on the right
              to add a sync point.
            </p>
          </div>
        </div>

        {/* Right Panel: Subtitle List */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background">
          {/* Search bar */}
          <div className="px-3 lg:px-5 py-2 lg:py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-colors">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subtitles..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="inline-flex w-5 h-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                {displaySegments.length} result{displaySegments.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Segment list */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto px-2.5 py-2 lg:px-4 lg:py-3 space-y-0.5 lg:space-y-1"
          >
            {segments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                No transcript. Transcribe the episode first.
              </p>
            ) : displaySegments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No results found</p>
            ) : (
              displaySegments.map((segment, idx) => {
                const originalIndex = segments.indexOf(segment);
                const isActive = originalIndex === activeSegmentIndex;
                const hasSyncPt = hasSyncPointForSegment(segment);

                const renderText = () => {
                  if (!searchQuery.trim()) return segment.text;
                  const q = searchQuery.toLowerCase();
                  const matchIdx = segment.text.toLowerCase().indexOf(q);
                  if (matchIdx === -1) return segment.text;
                  return (
                    <>
                      {segment.text.slice(0, matchIdx)}
                      <mark className="bg-accent/30 text-foreground rounded-sm px-0.5">
                        {segment.text.slice(matchIdx, matchIdx + searchQuery.length)}
                      </mark>
                      {segment.text.slice(matchIdx + searchQuery.length)}
                    </>
                  );
                };

                return (
                  <div key={idx} ref={isActive && !searchQuery ? activeSegmentRef : undefined}>
                    <button
                      type="button"
                      onClick={() => handleSegmentClick(segment)}
                      className={`w-full text-left px-3 py-2 lg:px-4 lg:py-2.5 rounded-lg border transition-colors ${
                        isActive && !searchQuery
                          ? 'bg-accent/[0.12] border-accent/40 text-foreground font-semibold'
                          : 'border-transparent bg-transparent hover:bg-muted/60 hover:border-border text-foreground/85'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <span className="text-[11px] tabular-nums text-muted-foreground w-10">
                            {formatTimeMs(segment.startMs)}
                          </span>
                          {hasSyncPt && <MapPin className="w-2.5 h-2.5 text-success shrink-0" />}
                        </div>
                        <span className="text-sm leading-relaxed">{renderText()}</span>
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
