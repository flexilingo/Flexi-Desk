import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Maximize2, Pause, Play, X } from 'lucide-react';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { useVideoSurface, youtubeMedia } from './YouTubeMedia';
import { MINI_ICON_BUTTON } from '@/pages/podcast/components/mini/MiniPlayerBar';
import { isExamSession } from './exam-route';

/**
 * The one place the YouTube picture lives, mounted by the Shell (through the mini player) so it
 * outlives every page. An iframe cannot change parents — moving it reloads it and the video starts
 * over — so it NEVER moves. Instead:
 *  - while the watch page is open it renders an empty slot where the picture belongs, and this host
 *    lays itself exactly over that slot (behind the page, which lets clicks through the slot), and
 *  - when the page goes, the same element just changes shape into the floating mini player.
 * During an exam the floating player pauses and hides: it would sit on the exam's Next button
 * while the exam clock runs. It comes back, paused, when the exam is left.
 */
export function VideoHost() {
  const { t } = useTranslation('videos');
  const navigate = useNavigate();
  const episode = usePlayerStore((s) => s.currentEpisode);
  const feed = usePlayerStore((s) => s.currentFeed);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const stop = usePlayerStore((s) => s.stop);
  const slot = useVideoSurface((s) => s.slot);
  const started = useVideoSurface((s) => s.started);
  const inExam = isExamSession(useLocation().pathname);

  const hostRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    youtubeMedia.attach(container);
    return () => youtubeMedia.detach(container);
  }, []);

  // Docked: lay the picture over the slot, every frame. A ResizeObserver would miss the moves that
  // keep the size (a banner appearing above it, focus mode hiding the top bar).
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!slot || !host) return;
    let frame = 0;
    let last = '';
    const place = () => {
      if (slot.isConnected) {
        const r = slot.getBoundingClientRect();
        const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
        if (key !== last) {
          last = key;
          host.style.left = `${r.left}px`;
          host.style.top = `${r.top}px`;
          host.style.width = `${r.width}px`;
          host.style.height = `${r.height}px`;
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => {
      cancelAnimationFrame(frame);
      for (const k of ['left', 'top', 'width', 'height'] as const) host.style[k] = '';
    };
  }, [slot]);

  // Keys must survive a click on the video. The iframe fills the stage, so a click hands focus to
  // YouTube's cross-origin document and every keydown lands there, never on `window`. Take focus
  // back (the click itself still reaches YouTube) — but only when it went INTO the video.
  useEffect(() => {
    let timer: number | null = null;
    const reclaim = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (!document.hasFocus()) return;
        const wrapper = wrapperRef.current;
        const active = document.activeElement;
        if (wrapper && active?.tagName === 'IFRAME' && wrapper.contains(active)) {
          wrapper.focus({ preventScroll: true });
        }
      }, 0);
    };
    window.addEventListener('blur', reclaim);
    return () => {
      window.removeEventListener('blur', reclaim);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (inExam) youtubeMedia.pause();
  }, [inExam]);

  if (!episode?.youtubeId) return null;
  const docked = slot !== null;
  const expand = () => {
    if (episode.catalogueVideoId) navigate(`/videos/watch/${episode.catalogueVideoId}`);
  };
  const toggle = () => {
    if (isPlaying) youtubeMedia.pause();
    else youtubeMedia.play().catch(() => {});
  };

  return (
    <>
      {docked && <div aria-hidden className="fixed inset-0 z-40 bg-background" />}
      <div
        ref={hostRef}
        className={
          docked
            ? 'fixed z-40 bg-black'
            : inExam
              ? 'hidden'
              : 'fixed bottom-4 end-4 z-[200] flex w-[400px] flex-col overflow-hidden rounded-md border border-border bg-card shadow-md'
        }
      >
        <div
          ref={wrapperRef}
          tabIndex={-1}
          className={
            docked
              ? 'relative h-full w-full bg-black outline-none'
              : 'relative aspect-video min-h-[200px] w-full bg-black outline-none'
          }
        >
          {/* YouTube's iframe is created inside this element, once, and never moved. */}
          <div ref={containerRef} className="absolute inset-0 h-full w-full" />
        </div>
        {!docked && (
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={expand}
              title={t('podcasts.expandPlayer')}
              className="min-w-0 flex-1 text-start"
            >
              <span dir="auto" className="block truncate text-sm font-semibold text-foreground">
                {episode.title}
              </span>
              {feed?.title && (
                <span dir="auto" className="block truncate text-xs text-muted-foreground">
                  {feed.title}
                </span>
              )}
            </button>
            {/* Before the first play only YouTube's own button on the picture may start it. */}
            {started && (
              <button
                type="button"
                onClick={toggle}
                title={isPlaying ? t('podcasts.pause') : t('podcasts.play')}
                aria-label={isPlaying ? t('podcasts.pause') : t('podcasts.play')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors hover:bg-accent/90"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={expand}
              title={t('podcasts.expandPlayer')}
              aria-label={t('podcasts.expandPlayer')}
              className={MINI_ICON_BUTTON}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={stop}
              title={t('podcasts.closePlayer')}
              aria-label={t('podcasts.closePlayer')}
              className={MINI_ICON_BUTTON}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
