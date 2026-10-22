import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  ExternalLink,
  Loader2,
  MousePointerClick,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { TopBar } from '@/pages/podcast/components/TopBar';
import { ControlBar } from '@/pages/podcast/components/ControlBar';
import { SubtitleBar } from '@/pages/podcast/components/SubtitleBar';
import { TranscriptPanel } from '@/pages/podcast/components/TranscriptPanel';
import { PlayerSidebar, type SidebarTab } from '@/pages/podcast/components/sidebar/PlayerSidebar';
import { SentenceChatSheet } from '@/pages/podcast/components/SentenceChatSheet';
import { AddToDeckDialog } from '@/pages/podcast/components/AddToDeckDialog';
import { QuickAddNoteDialog } from '@/pages/podcast/components/QuickAddNoteDialog';
import { SavedWordsIndicator } from '@/pages/podcast/components/SavedWordsIndicator';
import { KeyboardShortcuts } from '@/pages/podcast/components/KeyboardShortcuts';
import { VideoUpNext } from './components/VideoUpNext';
import { VideoTopBarActions } from './components/VideoTopBarActions';
import { videoListHref } from './lib/listMemory';
import { youtubeWatchUrl } from './lib/videoFilters';
import type { VideoSummary } from './lib/videosApi';
import { useVideoSurface, youtubeMedia } from './player/YouTubeMedia';
import { useVideoKeys } from './player/useVideoKeys';
import { VIDEO_PLAYER_CAPABILITIES } from './player/videoCapabilities';

/** The podcast player, with the picture swapped: YouTube's iframe where the cover art was. */
export function VideoWatchView({ video }: { video: VideoSummary }) {
  const { t } = useTranslation('videos');
  const navigate = useNavigate();
  const {
    activeEpisode,
    transcriptSegments,
    nlpAnalysis,
    bookmarks,
    fetchBookmarks,
    addBookmark,
    deleteBookmark,
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
  const focusMode = usePlayerStore((s) => s.focusMode);
  const fontSize = usePlayerStore((s) => s.fontSize);
  const subtitleBgOpacity = usePlayerStore((s) => s.subtitleBgOpacity);
  const showCompleteOverlay = usePlayerStore((s) => s.showCompleteOverlay);
  const wordsClicked = usePlayerStore((s) => s.wordsClicked);
  const wordsAddedToDeck = usePlayerStore((s) => s.wordsAddedToDeck);
  const activeTimeSpent = usePlayerStore((s) => s.activeTimeSpent);
  const playError = usePlayerStore((s) => s.playError);
  const autoPauseOnBoundary = usePlayerStore((s) => s.autoPauseOnBoundary);
  const pauseOnHover = usePlayerStore((s) => s.pauseOnHover);
  const subtitleAlignment = usePlayerStore((s) => s.subtitleAlignment);
  const seek = usePlayerStore((s) => s.seek);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleSubtitles = usePlayerStore((s) => s.toggleSubtitles);
  const toggleFocusMode = usePlayerStore((s) => s.toggleFocusMode);
  const setFontSize = usePlayerStore((s) => s.setFontSize);
  const setSubtitleBgOpacity = usePlayerStore((s) => s.setSubtitleBgOpacity);
  const dismissCompleteOverlay = usePlayerStore((s) => s.dismissCompleteOverlay);
  const toggleAutoPauseOnBoundary = usePlayerStore((s) => s.toggleAutoPauseOnBoundary);
  const togglePauseOnHover = usePlayerStore((s) => s.togglePauseOnHover);
  const setSubtitleAlignment = usePlayerStore((s) => s.setSubtitleAlignment);

  const ready = useVideoSurface((s) => s.ready);
  const started = useVideoSurface((s) => s.started);
  const trouble = useVideoSurface((s) => s.trouble);
  const setSlot = useVideoSurface((s) => s.setSlot);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('stats');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutoAction, setChatAutoAction] = useState<'translate' | 'grammar' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [addToDeckWords, setAddToDeckWords] = useState<string[]>([]);
  const [addToDeckOpen, setAddToDeckOpen] = useState(false);
  const [wordDialogOpen, setWordDialogOpen] = useState(false);

  const episodeId = activeEpisode?.id ?? '';
  const sourceLang = video.language;

  useEffect(() => {
    if (episodeId && sidebarOpen) void fetchBookmarks(episodeId);
  }, [episodeId, sidebarOpen, fetchBookmarks]);

  // Count active watching time (the Stats tab).
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(
      () => usePlayerStore.setState((s) => ({ activeTimeSpent: s.activeTimeSpent + 1000 })),
      1000,
    );
    return () => clearInterval(id);
  }, [isPlaying]);

  const modalOpen = chatOpen || noteOpen || wordDialogOpen || addToDeckOpen;
  useVideoKeys(!modalOpen);
  // Escape closes a dialog AND is the "leave" key; the same keypress must not do both.
  const modalClosedAt = useRef(0);
  const wasModalOpen = useRef(false);
  useEffect(() => {
    if (wasModalOpen.current && !modalOpen) modalClosedAt.current = Date.now();
    wasModalOpen.current = modalOpen;
  }, [modalOpen]);

  const currentSegment = transcriptSegments.find(
    (seg) => currentTime * 1000 >= seg.startMs && currentTime * 1000 < seg.endMs,
  );
  const segIdx = currentSegment ? transcriptSegments.indexOf(currentSegment) : -1;
  const currentSentence = currentSegment?.text ?? '';
  const prevSentence = segIdx > 0 ? transcriptSegments[segIdx - 1]?.text : undefined;
  const nextSentence =
    segIdx >= 0 && segIdx < transcriptSegments.length - 1
      ? transcriptSegments[segIdx + 1]?.text
      : undefined;
  const hasTranscript = transcriptSegments.length > 0;

  const topBarActions = useMemo(() => <VideoTopBarActions video={video} />, [video]);

  const handleBack = () => navigate(videoListHref());
  const handleEscape = () => {
    if (Date.now() - modalClosedAt.current > 400) handleBack();
  };
  // Before the first play only YouTube's own button starts the video; the bar's button waits for it.
  const handlePlayPause = () => {
    if (started) togglePlayPause();
  };
  const handleSeek = (delta: number) =>
    seek(Math.max(0, Math.min(currentTime + delta, duration || currentTime + delta)));
  const handleSeekTo = (time: number) => seek(time);
  const openChat = (action: 'translate' | 'grammar' | null = null) => {
    setChatAutoAction(action);
    setChatOpen(true);
  };
  const openSidebarTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    setSidebarOpen(true);
  };
  const addWords = (words: string[]) => {
    setAddToDeckWords(words);
    setAddToDeckOpen(true);
  };

  if (!activeEpisode) return null;

  // The stage is see-through: the picture is laid over it from behind (VideoHost), so everything on
  // this page that must take clicks opts back in with `pointer-events-auto`.
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
      {ready && !started && !trouble && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            <MousePointerClick className="h-3.5 w-3.5" />
            {t('watch.startHint')}
          </span>
        </div>
      )}
      {showCompleteOverlay && (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col gap-3 overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground">{t('upNext.heading')}</h2>
              <p className="text-xs text-muted-foreground">{t('upNext.sub')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  dismissCompleteOverlay();
                  seek(0);
                  togglePlayPause();
                }}
              >
                {t('watch.replay')}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('podcasts.closePlayer')}
                onClick={dismissCompleteOverlay}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <VideoUpNext video={video} onDismiss={dismissCompleteOverlay} />
        </div>
      )}
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col">
      {!focusMode && (
        <div className="pointer-events-auto shrink-0">
          <TopBar
            onBack={handleBack}
            hasTranscript={false}
            transcriptControl={<div className="flex items-center gap-2">{topBarActions}</div>}
            episodeInfo={{
              title: video.title,
              image: video.thumbnail,
              podcastTitle: video.channel,
              durationSeconds: video.duration_sec,
              cefrLevel: video.cefr_level,
            }}
            sidebarAction={
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                {sidebarOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            }
          />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {(playError || podcastError) && (
            <div className="pointer-events-auto mx-4 mt-2 flex shrink-0 items-start gap-2 break-all rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <span className="flex-1">{podcastError || t('watch.importFailed')}</span>
              {podcastError && (
                <button
                  type="button"
                  onClick={clearError}
                  className="shrink-0 text-destructive/70 hover:text-destructive"
                >
                  &times;
                </button>
              )}
            </div>
          )}

          {focusMode && hasTranscript ? (
            <>
              <div className="h-56 shrink-0">{stage}</div>
              <div className="pointer-events-auto min-h-0 flex-1 bg-background">
                <TranscriptPanel
                  segments={transcriptSegments}
                  currentTime={currentTime}
                  onSeek={handleSeekTo}
                  episodeId={episodeId}
                  sourceLang={sourceLang}
                />
              </div>
            </>
          ) : (
            <>
              <div className="min-h-0 flex-1">{stage}</div>
              <div className="pointer-events-auto relative z-10 shrink-0 bg-background">
                {hasTranscript ? (
                  <SubtitleBar
                    segments={transcriptSegments}
                    currentTime={currentTime}
                    onSeek={handleSeekTo}
                    fontSize={fontSize}
                    subtitleBgOpacity={subtitleBgOpacity}
                    episodeId={episodeId}
                    subtitlesEnabled={subtitlesEnabled}
                    sourceLang={sourceLang}
                    autoPauseOnBoundary={autoPauseOnBoundary}
                    pauseOnHover={pauseOnHover}
                    subtitleAlignment={subtitleAlignment}
                    onAddToDeck={addWords}
                    onDialogOpenChange={setWordDialogOpen}
                  />
                ) : (
                  <p className="px-4 py-3 text-center text-xs text-muted-foreground">
                    {t('watch.noTranscript')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="pointer-events-auto">
          <PlayerSidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            activeTab={sidebarTab}
            onTabChange={setSidebarTab}
            wordsClicked={wordsClicked}
            wordsAddedToDeck={wordsAddedToDeck}
            activeTimeSpent={activeTimeSpent}
            segmentCount={transcriptSegments.length}
            analysis={nlpAnalysis}
            sourceLang={sourceLang}
            bookmarks={bookmarks}
            episodeId={episodeId}
            onSeek={handleSeekTo}
            onDeleteBookmark={deleteBookmark}
            onAddBookmark={addBookmark}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            subtitleBgOpacity={subtitleBgOpacity}
            onSubtitleBgOpacityChange={setSubtitleBgOpacity}
            subtitlesEnabled={subtitlesEnabled}
            onToggleSubtitles={toggleSubtitles}
            autoPauseOnBoundary={autoPauseOnBoundary}
            onToggleAutoPause={toggleAutoPauseOnBoundary}
            pauseOnHover={pauseOnHover}
            onTogglePauseOnHover={togglePauseOnHover}
            subtitleAlignment={subtitleAlignment}
            onSubtitleAlignmentChange={setSubtitleAlignment}
            onAddToDeck={addWords}
          />
        </div>
      </div>

      <div className="pointer-events-auto shrink-0">
        <ControlBar
          onOpenVocab={() => openSidebarTab('vocab')}
          onOpenAnalysis={() => openSidebarTab('analysis')}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={volume === 0}
          playbackRate={playbackRate}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSeekTo={handleSeekTo}
          onToggleMute={() => setVolume(volume > 0 ? 0 : 1)}
          onSpeedChange={setPlaybackRate}
          onVolumeChange={setVolume}
          focusMode={focusMode}
          subtitlesEnabled={subtitlesEnabled}
          onToggleFocusMode={toggleFocusMode}
          onToggleSubtitles={toggleSubtitles}
          onNote={() => setNoteOpen(true)}
          hasCurrentSegment={!!currentSegment}
          onAnalyzeSentence={() => openChat(null)}
          onTranslateSentence={() => openChat('translate')}
          onGrammarSentence={() => openChat('grammar')}
          onExit={handleBack}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          subtitleBgOpacity={subtitleBgOpacity}
          onSubtitleBgOpacityChange={setSubtitleBgOpacity}
          autoPauseOnSubtitle={autoPauseOnBoundary}
          onToggleAutoPause={toggleAutoPauseOnBoundary}
          pauseOnWordHover={pauseOnHover}
          onTogglePauseOnHover={togglePauseOnHover}
          translationAlignment={subtitleAlignment}
          onTranslationAlignmentChange={setSubtitleAlignment}
          // No sync dialog and no feedback form for a video (see VIDEO_PLAYER_CAPABILITIES).
          onSyncClick={VIDEO_PLAYER_CAPABILITIES.sync ? () => undefined : undefined}
          onHelp={VIDEO_PLAYER_CAPABILITIES.feedback ? () => undefined : undefined}
        />
      </div>

      <div className="pointer-events-auto">
        <SavedWordsIndicator count={wordsAddedToDeck} onClick={() => setSidebarOpen(true)} />
      </div>

      <SentenceChatSheet
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sentence={currentSentence}
        prevSentence={prevSentence}
        nextSentence={nextSentence}
        episodeId={episodeId}
        sourceLang={sourceLang}
        autoAction={chatAutoAction}
      />
      <AddToDeckDialog
        open={addToDeckOpen}
        onClose={() => setAddToDeckOpen(false)}
        words={addToDeckWords}
        episodeId={episodeId}
        sentenceContext={currentSentence}
      />
      <QuickAddNoteDialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        episodeId={episodeId}
        currentTime={currentTime}
        subtitleText={currentSentence}
      />

      <KeyboardShortcuts
        enabled={!modalOpen}
        onToggleSubtitles={toggleSubtitles}
        onNote={() => setNoteOpen(true)}
        onAnalyze={() => openChat(null)}
        onTranslate={() => openChat('translate')}
        onGrammar={() => openChat('grammar')}
        onFocus={toggleFocusMode}
        onExit={handleEscape}
      />
    </div>
  );
}
