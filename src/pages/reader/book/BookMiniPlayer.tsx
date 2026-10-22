import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Captions,
  Lock,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { bookTrackOf } from '../lib/book-episode';
import {
  useBookLineSteps,
  useBookListenTracker,
  useBookTrackSubtitles,
} from '../lib/use-book-track';
import { BookSubtitleLine } from './BookSubtitleLine';

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
}

const iconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40';

/**
 * The mini player for a book track (website: `GlobalMiniPlayer` in book mode).
 *
 * A book track is not an episode: it has no transcript to look up and no episode page to
 * expand to, so expanding goes back to the book. Its subtitles are the book's own and open
 * only after the learner has heard the track in full enough times; until then a locked
 * caption button says "n/required" and explains the rule. Line back / forward step by the
 * line times (sent even while locked).
 */
export function BookMiniPlayer() {
  const { t } = useTranslation('readerDesk');
  const { t: tp } = useTranslation('podcastUi');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const episode = usePlayerStore((s) => s.currentEpisode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const playError = usePlayerStore((s) => s.playError);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const seek = usePlayerStore((s) => s.seek);
  const skipBack = usePlayerStore((s) => s.skipBack);
  const skipForward = usePlayerStore((s) => s.skipForward);
  const stop = usePlayerStore((s) => s.stop);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const signedIn = useAuthStore((s) => !!s.session);

  const book = bookTrackOf(episode);
  // Counting and subtitles belong to the account: signed out, the recording still plays.
  const key = book && signedIn ? { edition: book.edition, track: book.track } : null;
  useBookListenTracker(key);
  const subs = useBookTrackSubtitles(key, currentTime);
  const lineSteps = useBookLineSteps(subs.lines);

  const [cc, setCc] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  if (!episode || !book) return null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const open = subs.available && !subs.locked;
  const showLine = cc && open && subs.line;
  const isMuted = volume === 0;

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[34rem] max-w-[calc(100vw-2rem)] select-none overflow-visible rounded-2xl border border-border bg-card shadow-2xl">
      {showLine && subs.line && (
        <div className="border-b border-border">
          <BookSubtitleLine
            text={subs.line.text}
            lineId={`${episode.id}-${subs.lineIndex}`}
            language={book.language}
            trackId={episode.id}
          />
        </div>
      )}

      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-xs font-semibold leading-tight text-foreground">
            {episode.title}
          </p>
          <p dir="auto" className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {book.showName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(book.returnTo)}
          className={iconBtn}
          title={t('book.backToBook')}
          aria-label={t('book.backToBook')}
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={stop}
          className={iconBtn}
          title={tp('mini.close')}
          aria-label={tp('mini.close')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={progressRef}
        dir="ltr"
        className="group mx-3 h-1 cursor-pointer rounded-full bg-muted"
        onClick={(event) => {
          const rect = progressRef.current?.getBoundingClientRect();
          if (!rect || duration <= 0) return;
          seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration);
        }}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {playError && (
        <p role="alert" className="px-3 pt-2 text-xs font-semibold text-error">
          {t('book.playFailed')}
        </p>
      )}

      <div className="flex items-center gap-1 px-3 pb-3 pt-2">
        <span dir="ltr" className="mr-1 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {formatTime(currentTime)}
          <span className="opacity-50"> / {formatTime(duration)}</span>
        </span>
        <span className="flex-1" />

        <button
          type="button"
          onClick={lineSteps ? lineSteps.onPrev : () => skipBack(5)}
          title={lineSteps ? tp('prevLineHint') : '-5s'}
          aria-label={lineSteps ? tp('prevLine') : '-5s'}
          className={iconBtn}
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={togglePlayPause}
          aria-label={isPlaying ? tc('podcast.pause') : tc('podcast.play')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={lineSteps ? lineSteps.onNext : () => skipForward(5)}
          title={lineSteps ? tp('nextLineHint') : '+5s'}
          aria-label={lineSteps ? tp('nextLine') : '+5s'}
          className={iconBtn}
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <span className="flex-1" />

        {open && (
          <button
            type="button"
            onClick={() => setCc((on) => !on)}
            aria-pressed={cc}
            title={tc('podcast.ccLabel')}
            className={`${iconBtn} ${cc ? 'bg-primary/15 text-primary' : ''}`}
          >
            <Captions className="h-4 w-4" />
          </button>
        )}
        {subs.available && subs.locked && (
          <LockedCaptions listens={subs.listens} required={subs.required} />
        )}

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowVolume((on) => !on)}
            className={iconBtn}
            title={tp('shared.volume')}
            aria-label={tp('shared.volume')}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : volume < 0.5 ? (
              <Volume1 className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          {showVolume && (
            <div className="absolute bottom-full right-0 z-[1000] mb-2 flex min-w-[72px] flex-col items-center gap-2 rounded-xl border border-border bg-popover p-3 shadow-xl">
              <div
                className="relative h-20 w-2 cursor-pointer rounded bg-muted"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setVolume(Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)));
                }}
              >
                <div
                  className="absolute inset-x-0 bottom-0 rounded bg-primary"
                  style={{ height: `${volume * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold tabular-nums text-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Locked captions with the count so far; a click explains the rule. */
function LockedCaptions({ listens, required }: { listens: number; required: number }) {
  const { t } = useTranslation('readerDesk');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={t('book.lockedTitle', { n: listens, required })}
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span className="relative inline-flex">
          <Captions className="h-4 w-4" />
          <Lock
            className="absolute -bottom-1 -end-1.5 h-2.5 w-2.5 rounded-sm bg-card"
            strokeWidth={2.5}
          />
        </span>
        <span className="text-xs font-semibold tabular-nums">
          {listens}/{required}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full end-0 z-[1000] mb-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-xl">
          <p dir="auto" className="text-sm font-semibold text-foreground">
            {t('book.lockedHeading')}
          </p>
          <p dir="auto" className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t('book.lockedRule', { count: required, required })}
          </p>
          <div className="mt-2.5 flex gap-1" aria-hidden="true">
            {Array.from({ length: required }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full ${index < listens ? 'bg-success' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p dir="auto" className="mt-1.5 text-xs font-semibold text-primary">
            {t('book.lockedProgress', { n: listens, required })}
          </p>
        </div>
      )}
    </div>
  );
}
