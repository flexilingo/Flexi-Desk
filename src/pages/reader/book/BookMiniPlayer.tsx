import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Captions, Lock } from 'lucide-react';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { bookTrackOf } from '../lib/book-episode';
import {
  useBookLineSteps,
  useBookListenTracker,
  useBookTrackSubtitles,
} from '../lib/use-book-track';
import { BookSubtitleLine } from './BookSubtitleLine';
import { MiniPlayerBar } from '@/pages/podcast/components/mini/MiniPlayerBar';

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

  if (!episode || !book) return null;
  const open = subs.available && !subs.locked;
  const showLine = cc && open && subs.line;

  // The website's mini player bar in book mode: a book track has no full player, so expanding goes
  // back to the book; its line can be selected like the full player's.
  return (
    <MiniPlayerBar
      title={episode.title}
      showName={book.showName}
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      volume={volume}
      playbackError={!!playError}
      onPlayPause={togglePlayPause}
      onSkip={(s) => (s < 0 ? skipBack(-s) : skipForward(s))}
      onSeek={seek}
      onVolumeChange={setVolume}
      onExpand={() => navigate(book.returnTo)}
      expandLabel={t('book.backToBook')}
      onExit={stop}
      lineSteps={lineSteps}
      hasTranscription={open}
      ccEnabled={cc}
      onToggleCC={() => setCc((on) => !on)}
      ccLock={
        subs.available && subs.locked ? (
          <LockedCaptions listens={subs.listens} required={subs.required} />
        ) : null
      }
      subtitleLine={
        showLine && subs.line ? (
          <div className="border-t border-border bg-card/95 backdrop-blur">
            <BookSubtitleLine
              text={subs.line.text}
              lineId={`${episode.id}-${subs.lineIndex}`}
              language={book.language}
              trackId={episode.id}
            />
          </div>
        ) : null
      }
    />
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
