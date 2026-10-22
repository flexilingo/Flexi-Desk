import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Captions, CaptionsOff, ExternalLink, Loader2, RefreshCw, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { ControlBar } from '@/pages/podcast/components/ControlBar';
import { SubtitleStack, displayIndexAt } from '@/pages/podcast/components/SubtitleStack';
import { SentenceChatSheet } from '@/pages/podcast/components/SentenceChatSheet';
import { AddToDeckDialog } from '@/pages/podcast/components/AddToDeckDialog';
import { KeyboardShortcuts } from '@/pages/podcast/components/KeyboardShortcuts';
import { EpisodeCompleteOverlay } from '@/pages/podcast/components/EpisodeCompleteOverlay';
import { CardActions } from '@/pages/podcast/components/now-playing/CardActions';
import { VideoThumbnail } from '@/pages/podcast/components/now-playing/NowPlayingArtwork';
import { NowPlayingBadges } from '@/pages/podcast/components/now-playing/NowPlayingBadges';
import { PlayerStatusCard } from '@/pages/podcast/components/now-playing/PlayerStatusCard';
import { VocabDialog } from '@/pages/podcast/components/now-playing/VocabDialog';
import { usePodcastTransport } from '@/pages/podcast/hooks/usePodcastTransport';
import { publicEpisodeUrl } from '@/pages/podcast/utils/publicUrl';
import { stepVolume } from '@/pages/podcast/utils/transport';
import { VideoUpNext } from './components/VideoUpNext';
import { VideoTopBarActions } from './components/VideoTopBarActions';
import { videoListHref } from './lib/listMemory';
import { youtubeWatchUrl } from './lib/videoFilters';
import type { VideoSummary } from './lib/videosApi';
import { useVideoSurface, youtubeMedia } from './player/YouTubeMedia';
import { cn } from '@/lib/utils';

/**
 * Full screen: the height of the lines' band under the picture, by the reader's "lines before and
 * after" setting (website: FULLSCREEN_BAND). Auto keeps one line either side.
 */
const FULLSCREEN_BAND: Record<string, string> = {
  '0': 'h-[clamp(110px,20vh,200px)]',
  '1': 'h-[clamp(150px,26vh,280px)]',
  '2': 'h-[clamp(190px,32vh,340px)]',
  '3': 'h-[clamp(220px,38vh,400px)]',
  auto: 'h-[clamp(150px,26vh,280px)]',
};

/**
 * The video watch page — the website's now-playing layout for a video: the same two cards as a
 * podcast (what is playing and the transport on the left; the picture, with its lines right under
 * it, on the right). Nothing is ever laid over the playing YouTube picture, and the first play is
 * YouTube's own button (that is what counts as a view). Full screen (F) gives the picture the
 * screen, its lines under it and one slim control row.
 */
export function VideoWatchView({
  video,
}: {
  video: VideoSummary & { channel_youtube_id?: string | null };
}) {
  const { t } = useTranslation('videos');
  const { t: tp } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const {
    activeEpisode,
    transcriptSegments,
    nlpAnalysis,
    error: podcastError,
    clearError,
  } = usePodcastStore();

  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const volume = usePlayerStore((s) => s.volume);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const subtitlesEnabled = usePlayerStore((s) => s.subtitlesEnabled);
  const fontSize = usePlayerStore((s) => s.fontSize);
  const contextLines = usePlayerStore((s) => s.contextLines);
  const showCompleteOverlay = usePlayerStore((s) => s.showCompleteOverlay);
  const wordsClicked = usePlayerStore((s) => s.wordsClicked);
  const wordsAddedToDeck = usePlayerStore((s) => s.wordsAddedToDeck);
  const activeTimeSpent = usePlayerStore((s) => s.activeTimeSpent);
  const playError = usePlayerStore((s) => s.playError);
  const autoPauseOnBoundary = usePlayerStore((s) => s.autoPauseOnBoundary);
  const pauseOnHover = usePlayerStore((s) => s.pauseOnHover);
  const seek = usePlayerStore((s) => s.seek);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleSubtitles = usePlayerStore((s) => s.toggleSubtitles);
  const setFontSize = usePlayerStore((s) => s.setFontSize);
  const setContextLines = usePlayerStore((s) => s.setContextLines);
  const dismissCompleteOverlay = usePlayerStore((s) => s.dismissCompleteOverlay);
  const toggleAutoPauseOnBoundary = usePlayerStore((s) => s.toggleAutoPauseOnBoundary);
  const togglePauseOnHover = usePlayerStore((s) => s.togglePauseOnHover);

  const ready = useVideoSurface((s) => s.ready);
  const started = useVideoSurface((s) => s.started);
  const trouble = useVideoSurface((s) => s.trouble);
  const setSlot = useVideoSurface((s) => s.setSlot);

  const [fullscreen, setFullscreen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutoAction, setChatAutoAction] = useState<'translate' | 'grammar' | null>(null);
  const [addToDeckWords, setAddToDeckWords] = useState<string[]>([]);
  const [addToDeckOpen, setAddToDeckOpen] = useState(false);
  const [wordDialogOpen, setWordDialogOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);

  const episodeId = activeEpisode?.id ?? '';
  const sourceLang = video.language;

  // Count active watching time (the end-of-video numbers).
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(
      () => usePlayerStore.setState((s) => ({ activeTimeSpent: s.activeTimeSpent + 1000 })),
      1000,
    );
    return () => clearInterval(id);
  }, [isPlaying]);

  // Full screen asks the window too; leaving the page never strands it there.
  const ownsFullscreen = useRef(false);
  const toggleFullscreen = useCallback(() => {
    setFullscreen((on) => {
      const next = !on;
      try {
        if (next && !document.fullscreenElement) {
          void document.documentElement
            .requestFullscreen?.()
            .then(() => {
              ownsFullscreen.current = true;
            })
            .catch(() => {});
        } else if (!next && ownsFullscreen.current && document.fullscreenElement) {
          ownsFullscreen.current = false;
          void document.exitFullscreen().catch(() => {});
        }
      } catch {
        // No element full screen here: the layout alone fills the window.
      }
      return next;
    });
  }, []);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && ownsFullscreen.current) {
        ownsFullscreen.current = false;
        setFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (ownsFullscreen.current && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const handleSeekTo = (to: number) => seek(to);
  const handleSkip = useCallback((delta: number) => {
    const st = usePlayerStore.getState();
    st.seek(Math.max(0, Math.min(st.currentTime + delta, st.duration || st.currentTime + delta)));
  }, []);
  const { lineSteps, prevLine, nextLine } = usePodcastTransport({
    segments: transcriptSegments,
    syncOffset: 0,
    currentTime,
    episodeId: episodeId || null,
    seekTo: seek,
    skip: handleSkip,
  });

  const displayIndex = displayIndexAt(transcriptSegments, currentTime * 1000);
  const hasLineNow = transcriptSegments.length > 0 && displayIndex >= 0;
  const currentSentence = hasLineNow ? transcriptSegments[displayIndex].text : '';
  const prevSentence = displayIndex > 0 ? transcriptSegments[displayIndex - 1]?.text : undefined;
  const nextSentence = displayIndex >= 0 ? transcriptSegments[displayIndex + 1]?.text : undefined;

  const topBarActions = useMemo(() => <VideoTopBarActions video={video} />, [video]);
  const handleBack = () => navigate(videoListHref());
  // Before the first play only YouTube's own button starts the video.
  const handlePlayPause = () => {
    if (started) togglePlayPause();
  };
  const openLena = (action: 'translate' | 'grammar' | null = null) => {
    if (!currentSentence) return;
    if (usePlayerStore.getState().isPlaying) usePlayerStore.getState().pause();
    setChatAutoAction(action);
    setChatOpen(true);
  };
  const addWords = (words: string[]) => {
    setAddToDeckWords(words);
    setAddToDeckOpen(true);
  };

  if (!activeEpisode) return null;

  const modalOpen = chatOpen || wordDialogOpen || addToDeckOpen || vocabOpen;
  const knownDuration = duration > 0 ? duration : (video.duration_sec ?? 0);

  // The picture's place: the page is see-through there and the host lays YouTube over it.
  const stage = (
    <div ref={setSlot} className="pointer-events-none relative h-full w-full">
      {!ready && !trouble && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-xs">{t('watch.preparing')}</span>
        </div>
      )}
      {trouble && (
        <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
          <p className="text-sm font-semibold text-white">{t('podcasts.videoUnavailableTitle')}</p>
          <p className="max-w-sm text-xs leading-relaxed text-white/70">
            {t('podcasts.videoUnavailableBody')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => youtubeMedia.retry()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('podcasts.videoUnavailableRetry')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openUrl(youtubeWatchUrl(video.youtube_id))}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('podcasts.videoUnavailableOpen')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // What stands under the picture: its lines, or why there are none yet.
  const videoLines = (lineClass: string, statusClass: string) =>
    !started ? (
      <div className={cn('flex flex-1 items-center justify-center', statusClass)}>
        <p className="text-center text-sm text-muted-foreground">{tp('np.npCaptionHint')}</p>
      </div>
    ) : subtitlesEnabled && hasLineNow ? (
      <div className={cn('flex min-h-0 flex-1 flex-col', lineClass)}>
        <SubtitleStack
          segments={transcriptSegments}
          currentTime={currentTime}
          fontSize={fontSize}
          maxContext={contextLines}
          roomy={!fullscreen}
          episodeId={episodeId}
          sourceLang={sourceLang}
          autoPauseOnBoundary={autoPauseOnBoundary}
          pauseOnHover={pauseOnHover}
          waitingLabel={tp('np.waitingForSubtitle')}
          onSeek={handleSeekTo}
          onAddToDeck={addWords}
          onDialogOpenChange={setWordDialogOpen}
        />
      </div>
    ) : (
      <div className={cn('flex flex-1 items-center justify-center', statusClass)}>
        {!subtitlesEnabled ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CaptionsOff className="h-6 w-6 text-primary" />
            <p className="text-sm text-muted-foreground">{tp('np.npSubtitlesOff')}</p>
            <Button variant="outline" size="sm" onClick={toggleSubtitles}>
              <Captions className="h-4 w-4" />
              {tp('np.npTurnOnSubtitles')}
            </Button>
          </div>
        ) : (
          <PlayerStatusCard
            kind={transcriptSegments.length === 0 ? 'noSubtitlesVideo' : 'startsIn'}
            secondsLeft={
              transcriptSegments.length > 0 ? transcriptSegments[0].startMs / 1000 - currentTime : 0
            }
            isVideo
            className="w-full max-w-[440px]"
          />
        )}
      </div>
    );

  // No sync tool and no feedback form for a video; no Practice (the drills run on the audio element).
  const controls = {
    isPlaying,
    isLoading: isPlaying && isBuffering,
    currentTime,
    duration,
    fallbackDuration: knownDuration,
    volume,
    playbackRate,
    onPlayPause: handlePlayPause,
    onSeek: handleSkip,
    onSeekTo: handleSeekTo,
    onPrevLine: lineSteps ? prevLine : undefined,
    onNextLine: lineSteps ? nextLine : undefined,
    onToggleMute: () => setVolume(volume > 0 ? 0 : 1),
    onSpeedChange: setPlaybackRate,
    onVolumeChange: setVolume,
    hasCurrentSegment: hasLineNow,
    onVocab: () => setVocabOpen(true),
    onTranslateSentence: () => openLena('translate'),
    onAnalyzeSentence: () => openLena(null),
    onToggleFullscreen: toggleFullscreen,
    fullscreen,
    subtitlesEnabled,
    onToggleSubtitles: toggleSubtitles,
    fontSize,
    onFontSizeChange: setFontSize,
    contextLines,
    onContextLinesChange: setContextLines,
    autoPauseOnSubtitle: autoPauseOnBoundary,
    onToggleAutoPause: toggleAutoPauseOnBoundary,
    pauseOnWordHover: pauseOnHover,
    onTogglePauseOnWordHover: togglePauseOnHover,
  };

  const card = 'rounded-md border border-border shadow-md';
  const channelYoutubeId = video.channel_youtube_id;

  const layout = fullscreen ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
        <div className="aspect-video w-[min(100cqw,calc(100cqh*16/9))]">{stage}</div>
      </div>
      <div
        className={cn(
          'pointer-events-auto relative flex flex-none flex-col bg-card',
          FULLSCREEN_BAND[contextLines === null ? 'auto' : String(contextLines)] ??
            FULLSCREEN_BAND.auto,
        )}
      >
        {videoLines('px-6', 'px-8')}
      </div>
      {started && (
        <div className="pointer-events-auto">
          <ControlBar {...controls} layout="strip" />
        </div>
      )}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 gap-5 px-5 pb-5 pt-5">
      <aside
        className={cn(
          'pointer-events-auto flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto bg-card p-4 xl:w-[380px]',
          card,
        )}
      >
        <CardActions
          onBack={handleBack}
          extra={topBarActions}
          shareUrl={publicEpisodeUrl(activeEpisode)}
        />
        <div className="flex flex-1 flex-col justify-center gap-6 px-2 pb-2">
          <VideoThumbnail
            youtubeId={video.youtube_id}
            thumbnail={video.thumbnail}
            alt={video.title}
            className="w-full shrink-0 rounded-md shadow-md"
          />
          <div>
            <h1
              dir="auto"
              className="line-clamp-3 text-[22px] font-bold leading-tight text-foreground"
            >
              {video.title}
            </h1>
            {video.channel && (
              <p dir="auto" className="mt-1 truncate text-base text-muted-foreground">
                {video.channel}
              </p>
            )}
            <NowPlayingBadges
              className="mt-3"
              level={video.cefr_level ?? null}
              durationSeconds={knownDuration || null}
              uniqueWords={nlpAnalysis?.uniqueWords ?? null}
            />
            {channelYoutubeId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() =>
                  void openUrl(
                    `https://www.youtube.com/channel/${encodeURIComponent(channelYoutubeId)}?sub_confirmation=1`,
                  )
                }
              >
                <Youtube className="h-3.5 w-3.5" />
                {tp('np.subscribeYoutube')}
              </Button>
            )}
          </div>
          {started && <ControlBar {...controls} layout="card" />}
        </div>
      </aside>
      <section className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', card)}>
        <div className="aspect-video w-full shrink-0">{stage}</div>
        <div className="pointer-events-auto relative flex min-h-0 flex-1 flex-col bg-card pt-2">
          {videoLines('px-6 pb-4', 'px-8 pb-6')}
        </div>
      </section>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col">
      {(playError || podcastError) && (
        <div className="pointer-events-auto mx-5 mt-3 flex shrink-0 items-start gap-2 break-all rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
          <span className="flex-1">{podcastError || t('watch.importFailed')}</span>
          {podcastError && (
            <button
              type="button"
              aria-label={tp('dismiss')}
              onClick={clearError}
              className="shrink-0 text-error/70 hover:text-error"
            >
              &times;
            </button>
          )}
        </div>
      )}

      {layout}

      {showCompleteOverlay && (
        <div className="pointer-events-auto absolute inset-0 z-[105]">
          <EpisodeCompleteOverlay
            analysis={nlpAnalysis}
            level={video.cefr_level ?? null}
            wordsClicked={wordsClicked}
            wordsAddedToDeck={wordsAddedToDeck}
            activeTimeSpent={activeTimeSpent}
            onDismiss={dismissCompleteOverlay}
            recommendations={{
              heading: t('upNext.heading'),
              sub: t('upNext.sub'),
              render: (dismiss) => <VideoUpNext video={video} onDismiss={dismiss} />,
            }}
          />
        </div>
      )}

      <div className="pointer-events-auto">
        <VocabDialog
          open={vocabOpen}
          onOpenChange={setVocabOpen}
          analysis={nlpAnalysis}
          onAddToDeck={(words) => {
            setVocabOpen(false);
            addWords(words);
          }}
        />
      </div>
      <SentenceChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sentence={currentSentence}
        prevSentence={prevSentence}
        nextSentence={nextSentence}
        episodeId={episodeId}
        cloudVideoId={video.youtube_id}
        autoAction={chatAutoAction}
      />
      <AddToDeckDialog
        open={addToDeckOpen}
        onClose={() => setAddToDeckOpen(false)}
        words={addToDeckWords}
        episodeId={episodeId}
        sentenceContext={currentSentence}
      />

      <KeyboardShortcuts
        enabled={!modalOpen}
        // Before the first play only YouTube's own button may start it: the transport keys wait.
        transport={
          started
            ? {
                togglePlay: handlePlayPause,
                prevLine: lineSteps ? prevLine : () => handleSkip(-5),
                nextLine: lineSteps ? nextLine : () => handleSkip(5),
                back10: () => handleSkip(-10),
                forward10: () => handleSkip(10),
                mute: () => setVolume(volume > 0 ? 0 : 1),
                volumeUp: () => setVolume(stepVolume(volume, 1)),
                volumeDown: () => setVolume(stepVolume(volume, -1)),
              }
            : undefined
        }
        onToggleSubtitles={toggleSubtitles}
        onAnalyze={() => openLena(null)}
        onTranslate={() => openLena('translate')}
        onGrammar={() => openLena('grammar')}
        onFullscreen={toggleFullscreen}
        // Esc only leaves full screen; it never leaves the video.
        onExit={fullscreen ? toggleFullscreen : undefined}
      />
    </div>
  );
}
