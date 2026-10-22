import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clapperboard, Pause, Play, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { isBookEpisode, usePlayerStore } from '@/pages/podcast/stores/playerStore';
import type { BookEdition, BookVideo } from '../lib/book-audio';
import { BookVideoPlayer } from './BookVideoPlayer';

/**
 * The book's videos, played in the panel beside the page they belong to.
 *
 * A player of its own rather than the bottom bar the recordings use: that bar
 * holds sound, and a video needs somewhere to be seen. It sits at the top of
 * the panel, so the page stays open next to it — the point of watching it here
 * rather than on the publisher's site is the exercise on the page.
 *
 * The files are the publisher's own, streamed from their site like the audio.
 * The player and its enlarged view are `BookVideoPlayer`.
 *
 * One sound at a time: a video playing holds the book's recording (see
 * `onPlayingChange` and `useAudioHold`), and a recording started from the bar
 * pauses the video.
 */
export function PdfVideoPanel({
  edition,
  offset,
  currentPage,
  onGoToPage,
  onPlayingChange,
  onClose,
}: {
  edition: BookEdition;
  /** PDF page minus printed page — the correction the recordings get. */
  offset: number;
  currentPage: number;
  onGoToPage: (pageNumber: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');
  const videos = edition.videos ?? [];
  const pageOf = (video: BookVideo) =>
    video.printed_page !== null ? video.printed_page + offset : null;

  // Opened on a page that has a video, the panel starts on it — ready, not playing.
  const [selected, setSelected] = useState<number | null>(
    () => videos.find((video) => pageOf(video) === currentPage)?.number ?? null,
  );
  /** Only a pick from the list plays at once; the one the panel opened on waits to be asked. */
  const [autoplay, setAutoplay] = useState(false);
  const [subtitled, setSubtitled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Where to pick up after the subtitle switch swaps the file. */
  const [resume, setResume] = useState<{ time: number; play: boolean } | null>(null);

  const current = videos.find((video) => video.number === selected) ?? null;
  const src = current
    ? subtitled && current.subtitled_url
      ? current.subtitled_url
      : current.video_url
    : null;

  useEffect(() => {
    onPlayingChange(playing);
  }, [playing, onPlayingChange]);
  // Closing the panel mid-video must not leave the recording held for ever.
  useEffect(() => () => onPlayingChange(false), [onPlayingChange]);

  // A recording started from the bottom bar wins: it was the newer choice.
  const audioPlaying = usePlayerStore((s) => s.isPlaying && isBookEpisode(s.currentEpisode));
  useEffect(() => {
    if (audioPlaying) videoRef.current?.pause();
  }, [audioPlaying]);

  const choose = (video: BookVideo) => {
    if (video.number === selected) {
      const element = videoRef.current;
      if (!element) return;
      if (element.paused) void element.play().catch(() => {});
      else element.pause();
      return;
    }
    setResume(null);
    setFailed(false);
    setPlaying(false);
    setAutoplay(true);
    setSelected(video.number);
  };

  /** Same video, other cut, same second — a switch, not a restart. */
  const toggleSubtitles = (on: boolean) => {
    const element = videoRef.current;
    setResume(element ? { time: element.currentTime, play: !element.paused } : null);
    setFailed(false);
    setSubtitled(on);
  };

  const onThisPage = videos.filter((video) => pageOf(video) === currentPage);

  // Under the video in the panel, and in the enlarged view's header.
  const subtitleSwitch = current?.subtitled_url ? (
    <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
      {t('pdf.video.subtitles')}
      <Switch
        checked={subtitled}
        onCheckedChange={toggleSubtitles}
        aria-label={t('pdf.video.subtitles')}
      />
    </label>
  ) : null;

  const renderRow = (video: BookVideo, key: string) => {
    const page = pageOf(video);
    const active = video.number === selected;
    const isPlaying = active && playing;
    return (
      <li key={key} className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => choose(video)}
          aria-label={video.title}
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
            isPlaying
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-border text-primary hover:bg-muted'
          }`}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1 px-1.5">
          {/* The book's own title, in the book's language: never laid out right to
              left, or "Bonjour !" prints as "! Bonjour" in a Persian interface. */}
          <p
            dir="auto"
            className={`text-sm font-semibold leading-snug ${active ? 'text-primary' : 'text-foreground'}`}
          >
            {video.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{t('pdf.video.number', { n: video.number })}</span>
            {page !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{t('pdf.audio.page', { n: page })}</span>
              </>
            )}
          </p>
        </div>

        {page !== null && (
          <button
            type="button"
            onClick={() => onGoToPage(page)}
            aria-label={t('pdf.audio.goToPage', { n: page })}
            title={t('pdf.audio.goToPage', { n: page })}
            className="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary/55 hover:bg-primary/10"
          >
            {t('pdf.audio.go')}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </button>
        )}
      </li>
    );
  };

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-s border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Clapperboard className="h-4 w-4 text-primary" />
        </span>
        <h2 className="flex-1 text-sm font-bold text-foreground">
          {t('pdf.video.panelTitle', { n: videos.length })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pdf.notes.close')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border">
        {current && src ? (
          <>
            <BookVideoPlayer
              src={src}
              title={current.title}
              videoRef={videoRef}
              // After a subtitle switch, exactly as it was — paused stays paused.
              autoPlay={resume ? resume.play : autoplay}
              resumeAt={resume?.time ?? null}
              onPlayingChange={setPlaying}
              onError={() => {
                setPlaying(false);
                setFailed(true);
              }}
              headerExtra={subtitleSwitch}
            />
            <div className="flex items-start gap-3 px-4 py-2.5">
              <p
                dir="auto"
                className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground"
              >
                {current.title}
              </p>
              {subtitleSwitch}
            </div>
            {/* Said where it happened, not as a warning over the whole list. */}
            {failed && (
              <p className="px-4 pb-2.5 text-xs font-semibold text-error">
                {t('pdf.video.unavailable')}
              </p>
            )}
          </>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-muted px-6 text-center">
            <Clapperboard className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('pdf.video.pick')}</p>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {onThisPage.length > 0 && (
          <section className="border-b border-border">
            <h3 className="sticky top-0 z-[1] border-b border-border bg-muted px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              {t('pdf.audio.onThisPage', { n: currentPage })}
            </h3>
            <ul className="divide-y divide-border">
              {onThisPage.map((video) => renderRow(video, `here-${video.number}`))}
            </ul>
          </section>
        )}

        <ul className="divide-y divide-border">
          {videos.map((video) => renderRow(video, String(video.number)))}
        </ul>
      </div>
    </aside>
  );
}
