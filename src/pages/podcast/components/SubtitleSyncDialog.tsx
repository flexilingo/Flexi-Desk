import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  Timer,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SyncPoint, RawSyncPoint, PodcastTranscriptSegment } from '../types';
import { mapSyncPoint, formatTimeMs, getEffectiveOffset, mergeSyncPoint } from '../types';
import { formatTime } from './ControlBar';
import { cn } from '@/lib/utils';

const SAVE_DEBOUNCE_MS = 1500;
/** One press of Earlier / Later moves every line by this much. */
const SHIFT_STEP = 0.5;
/** Held, Earlier / Later keep going: the first repeat after this, then one step every this. */
const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 120;
/** How long a tapped line says "Synced". */
const SYNCED_FLASH_MS = 1600;

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
 * The tool for lining the subtitles up with the audio (website: `SubtitleSyncDialog`, redesigned
 * 10-10): the lines take the screen; a slim header (what this is, search, close) and a two-row dock
 * (-5s / play / +5s and the scrubber; Earlier · shift · Later). Tapping a line pins it to the moment
 * you are hearing. Changes apply live and are saved on this computer.
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
  const { t } = useTranslation('podcastUi');
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [justSynced, setJustSynced] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the saved points when the tool opens. No focus on open: a focused search box also
  // stopped the list from following the audio.
  useEffect(() => {
    if (!open) return;
    setSaveError(null);
    setSearchOpen(false);
    setSearchQuery('');
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId })
      .then((raw) => setSyncPoints(raw.map(mapSyncPoint)))
      .catch(() => setSyncPoints([]));
  }, [open, episodeId]);

  useEffect(
    () => () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current);
    },
    [],
  );

  const persistPoints = useCallback(
    (points: SyncPoint[]) => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      saveDebounceRef.current = setTimeout(async () => {
        setIsSaving(true);
        setSaveError(null);
        try {
          if (points.length === 0) await invoke('podcast_clear_sync_points', { episodeId });
          else
            await invoke<RawSyncPoint[]>('podcast_save_sync_points', {
              episodeId,
              points: points.map((p) => ({
                audio_time: p.audioTime,
                subtitle_time: p.subtitleTime,
              })),
            });
        } catch {
          setSaveError(t('syncDialog.saveFailed'));
        } finally {
          setIsSaving(false);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [episodeId, t],
  );

  const applyPoints = useCallback(
    (points: SyncPoint[]) => {
      setSyncPoints(points);
      onSyncPointsChanged(points);
      persistPoints(points);
    },
    [onSyncPointsChanged, persistPoints],
  );

  // Seconds added to a line's time to get the audio time (segment + offset = player time).
  const effectiveOffset = useMemo(
    () => getEffectiveOffset(currentTime, syncPoints),
    [currentTime, syncPoints],
  );

  const activeSegmentIndex = useMemo(
    () =>
      segments.findIndex((seg) => {
        const start = seg.startMs / 1000 + effectiveOffset;
        const end = seg.endMs / 1000 + effectiveOffset;
        return currentTime >= start && currentTime < end;
      }),
    [segments, currentTime, effectiveOffset],
  );

  const query = searchQuery.trim().toLowerCase();
  const shownIndexes = useMemo(() => {
    const all = segments.map((_, i) => i);
    return query ? all.filter((i) => segments[i].text.toLowerCase().includes(query)) : all;
  }, [segments, query]);

  // Only a hand on the list counts as "the user is scrolling" (our own scrollIntoView does not).
  const markUserScroll = useCallback(() => {
    userScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      userScrollingRef.current = false;
    }, 3000);
  }, []);
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === container) markUserScroll();
    };
    container.addEventListener('wheel', markUserScroll, { passive: true });
    container.addEventListener('pointerdown', onPointerDown);
    return () => {
      container.removeEventListener('wheel', markUserScroll);
      container.removeEventListener('pointerdown', onPointerDown);
    };
  }, [markUserScroll, open]);

  // Follow the line being shown; not while searching.
  useEffect(() => {
    if (userScrollingRef.current || searchOpen) return;
    const el = activeSegmentRef.current;
    const box = listRef.current;
    if (!el || !box || activeSegmentIndex < 0) return;
    const c = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < c.top || r.bottom > c.bottom)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeSegmentIndex, searchOpen]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (searchOpen) closeSearch();
      else onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose, searchOpen, closeSearch]);

  const handleSegmentClick = (index: number) => {
    const segment = segments[index];
    applyPoints(
      mergeSyncPoint(syncPoints, {
        id: -Date.now(),
        episodeId,
        audioTime: Math.round(currentTime * 10) / 10,
        subtitleTime: segment.startMs / 1000,
      }),
    );
    setJustSynced(index);
    if (syncedTimeoutRef.current) clearTimeout(syncedTimeoutRef.current);
    syncedTimeoutRef.current = setTimeout(() => setJustSynced(null), SYNCED_FLASH_MS);
  };

  /** Negative delta = the lines show earlier. */
  const applyDelta = (delta: number) => {
    const newOffset = effectiveOffset + delta;
    applyPoints(
      mergeSyncPoint(syncPoints, {
        id: -Date.now(),
        episodeId,
        audioTime: currentTime,
        subtitleTime: currentTime - newOffset,
      }),
    );
  };
  // A held button repeats from a timer: it must always call the latest applyDelta.
  const applyDeltaRef = useRef(applyDelta);
  useEffect(() => {
    applyDeltaRef.current = applyDelta;
  });
  const shiftBy = useCallback((delta: number) => applyDeltaRef.current(delta), []);

  const hasSyncPoint = (segment: PodcastTranscriptSegment) =>
    syncPoints.some(
      (p) => p.subtitleTime >= segment.startMs / 1000 && p.subtitleTime < segment.endMs / 1000,
    );

  if (!open) return null;

  const shift = Math.round(effectiveOffset * 10) / 10;
  const shiftLabel =
    shift === 0
      ? t('np.syncShiftNone')
      : t(shift < 0 ? 'np.syncShiftEarlier' : 'np.syncShiftLater', {
          seconds: Math.abs(shift).toFixed(1),
        });

  const renderText = (text: string) => {
    if (!query) return text;
    const at = text.toLowerCase().indexOf(query);
    if (at === -1) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark className="rounded-[3px] bg-warning/30 px-0.5 text-foreground">
          {text.slice(at, at + query.length)}
        </mark>
        {text.slice(at + query.length)}
      </>
    );
  };

  const iconBtn =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subtitle-sync-title"
      className="fixed inset-0 z-[10000] flex flex-col bg-background"
    >
      <header className="shrink-0 border-b border-border bg-muted">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-6 py-1.5">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary-light/[0.12] text-primary">
            <Timer className="h-4 w-4" />
          </span>
          {searchOpen ? (
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[7px] border border-input bg-card px-3 transition-colors focus-within:border-primary-light/50 focus-within:ring-2 focus-within:ring-primary-light/15">
              <Search className="h-4 w-4 shrink-0 text-caption" />
              <input
                autoFocus
                dir="auto"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('np.syncSearchPlaceholder')}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-caption"
              />
              {query && (
                <span className="shrink-0 text-[11px] tabular-nums text-caption">
                  {shownIndexes.length}
                </span>
              )}
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <h2
                id="subtitle-sync-title"
                className="truncate text-sm font-semibold leading-tight text-foreground"
              >
                {t('np.syncTitle')}
              </h2>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                {saveError ?? t('np.syncTapLine')}
              </p>
            </div>
          )}
          {isSaving && !searchOpen && (
            <Loader2
              aria-label={t('np.syncSaving')}
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            />
          )}
          {searchOpen ? (
            <button
              type="button"
              onClick={closeSearch}
              title={t('np.syncSearchClose')}
              aria-label={t('np.syncSearchClose')}
              className={cn(iconBtn, 'text-muted-foreground hover:bg-card hover:text-foreground')}
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                title={t('np.syncSearchOpen')}
                aria-label={t('np.syncSearchOpen')}
                className={cn(iconBtn, 'text-primary hover:bg-card')}
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={onClose}
                title={t('shared.close')}
                aria-label={t('shared.close')}
                className={cn(iconBtn, 'text-muted-foreground hover:bg-card hover:text-foreground')}
              >
                <X className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl">
          {segments.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t('np.syncNoTranscript')}
            </p>
          ) : shownIndexes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t('np.syncNoResults')}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {shownIndexes.map((index) => {
                const segment = segments[index];
                const isActive = index === activeSegmentIndex && !searchOpen;
                return (
                  <div key={segment.id} ref={isActive ? activeSegmentRef : undefined}>
                    <button
                      type="button"
                      dir="auto"
                      onClick={() => handleSegmentClick(index)}
                      className={cn(
                        'relative flex w-full items-start gap-3 px-6 py-2.5 text-start transition-colors',
                        isActive ? 'bg-primary-light/[0.08]' : 'hover:bg-muted',
                      )}
                    >
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-primary-light"
                        />
                      )}
                      <span
                        className={cn(
                          'inline-flex w-11 shrink-0 items-center gap-1 pt-[3px] text-[11px] tabular-nums',
                          isActive ? 'font-semibold text-primary' : 'text-caption',
                        )}
                      >
                        {formatTimeMs(segment.startMs)}
                        {hasSyncPoint(segment) && (
                          <MapPin className="h-3 w-3 shrink-0 text-success" />
                        )}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-[15px] leading-relaxed',
                          isActive ? 'font-medium text-foreground' : 'text-foreground/80',
                        )}
                      >
                        {renderText(segment.text)}
                      </span>
                      {justSynced === index && (
                        <span className="inline-flex shrink-0 items-center gap-1 pt-[3px] text-[11px] font-semibold text-success">
                          <Check className="h-3.5 w-3.5" />
                          {t('np.syncLineSynced')}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-muted">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-6 pb-2 pt-1.5">
          <div dir="ltr" className="flex items-center gap-1">
            <SeekButton direction="back" label={t('np.syncSeekBack')} onClick={() => onSeek(-5)} />
            <button
              type="button"
              onClick={onPlayPause}
              title={isPlaying ? t('np.pause') : t('np.play')}
              aria-label={isPlaying ? t('np.pause') : t('np.play')}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md transition-[background-color,transform] hover:bg-accent/90 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 translate-x-px fill-current" />
              )}
            </button>
            <SeekButton
              direction="forward"
              label={t('np.syncSeekForward')}
              onClick={() => onSeek(5)}
            />
            <SyncScrubber
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              onSeekTo={onSeekTo}
            />
          </div>
          {/* Earlier on the left, Later on the right: the way the timeline runs. */}
          <div dir="ltr" className="flex items-center justify-between gap-2">
            <ShiftButton direction="earlier" label={t('np.syncEarlier')} onShift={shiftBy} />
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center leading-tight">
              <span
                dir="auto"
                className={cn(
                  'max-w-full truncate text-xs tabular-nums',
                  shift === 0 ? 'text-caption' : 'font-semibold text-accent',
                )}
              >
                {shiftLabel}
              </span>
              {syncPoints.length > 0 && (
                <button
                  type="button"
                  onClick={() => applyPoints([])}
                  className="inline-flex items-center text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t('np.syncReset')}
                </button>
              )}
            </div>
            <ShiftButton direction="later" label={t('np.syncLater')} onShift={shiftBy} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Earlier or Later by half a second; held, it keeps going. */
function ShiftButton({
  direction,
  label,
  onShift,
}: {
  direction: 'earlier' | 'later';
  label: string;
  onShift: (delta: number) => void;
}) {
  const delta = direction === 'earlier' ? -SHIFT_STEP : SHIFT_STEP;
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (repeatRef.current) clearInterval(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  const Icon = direction === 'earlier' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        stop();
        onShift(delta);
        delayRef.current = setTimeout(() => {
          repeatRef.current = setInterval(() => onShift(delta), HOLD_REPEAT_MS);
        }, HOLD_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        if (e.detail === 0) onShift(delta);
      }}
      title={`${label} · ${SHIFT_STEP}s`}
      className={cn(
        'inline-flex h-9 shrink-0 select-none items-center gap-1 rounded-md border border-input bg-card text-sm font-medium text-foreground transition-colors hover:border-primary-light/40 hover:text-primary active:bg-primary-light/10',
        direction === 'earlier' ? 'ps-2 pe-3' : 'ps-3 pe-2',
      )}
    >
      {direction === 'earlier' && <Icon className="h-4 w-4 text-primary" />}
      {label}
      <span className="text-[11px] font-normal tabular-nums text-caption">{SHIFT_STEP}s</span>
      {direction === 'later' && <Icon className="h-4 w-4 text-primary" />}
    </button>
  );
}

/** Back or forward 5 seconds: the arrow with the 5 inside it. */
function SeekButton({
  direction,
  label,
  onClick,
}: {
  direction: 'back' | 'forward';
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === 'back' ? RotateCcw : RotateCw;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-card"
    >
      <Icon className="h-6 w-6" strokeWidth={1.75} />
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pt-px text-[8px] font-bold tabular-nums"
      >
        5
      </span>
    </button>
  );
}

/** The position in the audio; dragged, the knob follows and the audio moves once, on release. */
function SyncScrubber({
  currentTime,
  duration,
  onSeek,
  onSeekTo,
}: {
  currentTime: number;
  duration: number;
  onSeek: (deltaSeconds: number) => void;
  onSeekTo: (time: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratioFrom = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const ratio = dragRatio ?? (duration > 0 ? Math.min(1, currentTime / duration) : 0);
  const shownTime = dragRatio !== null ? dragRatio * duration : currentTime;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 ps-1.5">
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownTime)}
        aria-valuetext={formatTime(shownTime)}
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragRatio(ratioFrom(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragRatio !== null) setDragRatio(ratioFrom(e.clientX));
        }}
        onPointerUp={(e) => {
          if (dragRatio === null) return;
          const r = ratioFrom(e.clientX);
          setDragRatio(null);
          if (duration) onSeekTo(r * duration);
        }}
        onPointerCancel={() => setDragRatio(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onSeek(-5);
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onSeek(5);
          }
        }}
        className="group -my-3 min-w-0 flex-1 cursor-pointer touch-none rounded-full py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-light/30"
      >
        <div ref={barRef} className="relative h-1.5 rounded-full bg-input">
          <div
            className={cn(
              'h-full rounded-full bg-primary-light',
              dragRatio === null && 'transition-[width] duration-100 ease-out',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-md group-hover:scale-110',
              dragRatio === null ? 'transition-[left,transform] duration-100' : 'scale-125',
            )}
            style={{ left: `${ratio * 100}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-caption">
        <span className="font-semibold text-foreground">{formatTime(shownTime)}</span>
        {' / '}
        {formatTime(duration)}
      </span>
    </div>
  );
}
