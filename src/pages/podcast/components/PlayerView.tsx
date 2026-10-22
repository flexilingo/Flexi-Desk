import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { usePodcastStore } from '../stores/podcastStore';
import { usePlayerStore } from '../stores/playerStore';
import { episodeSourceLang } from '../utils/difficulty';
import { AudioPlayerArea } from './AudioPlayerArea';
import { ControlBar } from './ControlBar';
import { TopBar } from './TopBar';
import { SubtitleBar } from './SubtitleBar';
import { TranscriptPanel } from './TranscriptPanel';
import { EpisodeCompleteOverlay } from './EpisodeCompleteOverlay';
import { PlayerSidebar, type SidebarTab } from './sidebar/PlayerSidebar';
import { SubtitleSyncDialog } from './SubtitleSyncDialog';
import { SentenceChatSheet } from './SentenceChatSheet';
import { AddToDeckDialog } from './AddToDeckDialog';
import { QuickAddNoteDialog } from './QuickAddNoteDialog';
import { FeedbackDialog } from './FeedbackDialog';
import { XPToast } from './XPToast';
import { SavedWordsIndicator } from './SavedWordsIndicator';
import { TranscriptSourceButton } from './TranscriptSourceButton';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { PipWindow } from './PipWindow';
import {
  ProgramLauncher,
  ProgramLayer,
  ProgramProvider,
  useProgramActions,
  useProgramGate,
  type TranscriptSegment,
} from '../listening';
import { usePodcastTransport } from '../hooks/usePodcastTransport';
import { useStudyTimeSync } from '../hooks/useStudyTimeSync';
import { usePictureInPicture } from '../hooks/usePictureInPicture';
import { useFavoritesStore } from '../stores/favoritesStore';
import { setLineSteppers } from '../utils/mediaSession';
import { parseStartAt, startRequestKey, stepVolume } from '../utils/transport';
import { LearningSession } from './quiz/LearningSession';
import type { SyncPoint, RawSyncPoint, RawPodcastTranscriptSegment } from '../types';
import { mapSyncPoint, getEffectiveOffset, mapTranscriptSegment } from '../types';
import type { RawModelCompatibility } from '@/pages/caption/types';
import { ModelSuggestionDialog } from './ModelSuggestionDialog';
import { WhisperSettingsDialog } from './WhisperSettingsDialog';
import { CloudSyncDialog } from './CloudSyncDialog';
import { ENABLED_MODULES } from '@/config/features';
import { useJobStore } from '@/stores/jobStore';

export function PlayerView() {
  const {
    activeEpisode,
    activeFeed,
    transcriptSegments,
    isLoadingTranscript,
    nlpAnalysis,
    bookmarks,
    downloadEpisode,
    transcribeEpisode,
    fetchBookmarks,
    addBookmark,
    deleteBookmark,
    error: podcastError,
    clearError,
    transcriptSourceInfo,
    isFetchingCloudTranscript,
    fetchTranscriptSourceInfo,
    fetchCloudTranscript,
    setTranscriptSource,
  } = usePodcastStore();
  const navigate = useNavigate();
  const handleBack = () => navigate(-1);

  // Derive transcription/download state from global job store
  const isTranscribing = useJobStore((s) =>
    Object.values(s.jobs).some(
      (j) => j.episodeId === activeEpisode?.id && j.type === 'transcribe' && j.status === 'running',
    ),
  );
  const isDownloading = useJobStore((s) =>
    Object.values(s.jobs).some(
      (j) => j.episodeId === activeEpisode?.id && j.type === 'download' && j.status === 'running',
    ),
  );
  // Return primitive (number) to avoid infinite re-render from new object refs
  const downloadPercent = useJobStore((s) => {
    const job = Object.values(s.jobs).find(
      (j) => j.episodeId === activeEpisode?.id && j.type === 'download' && j.status === 'running',
    );
    return job?.progress ?? -1;
  });
  const downloadProgress = downloadPercent >= 0 ? { percent: downloadPercent } : null;
  const transcribePercent = useJobStore((s) => {
    const job = Object.values(s.jobs).find(
      (j) => j.episodeId === activeEpisode?.id && j.type === 'transcribe' && j.status === 'running',
    );
    return job?.progress ?? 0;
  });

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
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const playError = usePlayerStore((s) => s.playError);

  const autoPauseOnBoundary = usePlayerStore((s) => s.autoPauseOnBoundary);
  const pauseOnHover = usePlayerStore((s) => s.pauseOnHover);
  const subtitleAlignment = usePlayerStore((s) => s.subtitleAlignment);

  const play = usePlayerStore((s) => s.play);
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

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('stats');

  // The collapsed sidebar rail was removed; the panels open from the control bar.
  const openSidebarTab = (tab: SidebarTab) => {
    setSidebarTab(tab);
    setSidebarOpen(true);
  };
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);

  // New dialog states
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutoAction, setChatAutoAction] = useState<'translate' | 'grammar' | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [xpVisible, setXpVisible] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [addToDeckWords, setAddToDeckWords] = useState<string[]>([]);
  const [whisperSettingsOpen, setWhisperSettingsOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [addToDeckOpen, setAddToDeckOpen] = useState(false);
  const [wordDialogOpen, setWordDialogOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);

  // Load sync points on episode change
  useEffect(() => {
    if (!activeEpisode) return;
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId: activeEpisode.id })
      .then((raw) => setSyncPoints(raw.map(mapSyncPoint)))
      .catch(() => {});
  }, [activeEpisode?.id]);

  const syncOffset = getEffectiveOffset(currentTime, syncPoints);

  // The Listening Program works on the episode's lines (subtitle timeline, seconds).
  const programSegments = useMemo<TranscriptSegment[]>(
    () =>
      transcriptSegments.map((s) => ({
        start: s.startMs / 1000,
        end: s.endMs / 1000,
        text: s.text,
      })),
    [transcriptSegments],
  );

  const { t: tp } = useTranslation('podcastUi');
  const [searchParams, setSearchParams] = useSearchParams();

  // The previous/next-line buttons, the arrow keys and the OS media keys share one stepper.
  const isCurrentEpisode = currentEpisode?.id === activeEpisode?.id;
  const seekFromLine = useCallback(
    (time: number) => {
      if (activeEpisode && !isCurrentEpisode) play(activeEpisode, activeFeed ?? undefined);
      seek(time);
    },
    [activeEpisode, activeFeed, isCurrentEpisode, play, seek],
  );
  const skipFromLine = useCallback(
    (seconds: number) => {
      if (activeEpisode && !isCurrentEpisode) play(activeEpisode, activeFeed ?? undefined);
      const st = usePlayerStore.getState();
      if (seconds < 0) st.skipBack(-seconds);
      else st.skipForward(seconds);
    },
    [activeEpisode, activeFeed, isCurrentEpisode, play],
  );
  const { lineSteps, prevLine, nextLine, lines } = usePodcastTransport({
    segments: transcriptSegments,
    syncOffset,
    currentTime,
    episodeId: activeEpisode?.id ?? null,
    seekTo: seekFromLine,
    skip: skipFromLine,
  });
  useEffect(() => {
    setLineSteppers({ prevLine, nextLine });
    return () => setLineSteppers(null);
  }, [prevLine, nextLine]);

  // Picture-in-Picture: the line being spoken in a small window that stays on top.
  const pipIdx = lines.findIndex((l) => currentTime >= l.start && currentTime < l.end);
  const pipLine =
    subtitlesEnabled && pipIdx >= 0 ? transcriptSegments[pipIdx]?.text.trim() || null : null;
  const pipNextLine = pipLine ? transcriptSegments[pipIdx + 1]?.text.trim() || null : null;
  const pipTotal = duration > 0 ? duration : (activeEpisode?.durationSeconds ?? 0);
  const pipIdle = !subtitlesEnabled
    ? tp('pipSubtitlesOff')
    : transcriptSegments.length > 0
      ? tp('pipIdle')
      : tp('pipNoTranscript');
  const pip = usePictureInPicture({
    enabled: !!activeEpisode,
    frame: {
      title: activeEpisode?.title ?? '',
      subtitle: activeFeed?.title ?? null,
      line: pipLine,
      nextLine: pipNextLine,
      idle: pipIdle,
      progress: pipTotal > 0 ? Math.round((currentTime / pipTotal) * 500) / 500 : 0,
    },
    isPlaying: isCurrentEpisode && isPlaying,
    onPlay: () => {
      if (!usePlayerStore.getState().isPlaying) usePlayerStore.getState().resume();
    },
    onPause: () => {
      if (usePlayerStore.getState().isPlaying) usePlayerStore.getState().pause();
    },
    onTogglePlay: () => usePlayerStore.getState().togglePlayPause(),
  });

  useStudyTimeSync(isCurrentEpisode && isPlaying);

  // B: save the episode (here and, with a catalogue id and an account, on the account).
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const favoriteError = useFavoritesStore((s) => s.error);
  const clearFavoriteError = useFavoritesStore((s) => s.clearError);
  const isFavorite = useFavoritesStore((s) =>
    activeEpisode ? s.local.some((l) => l.localEpisodeId === activeEpisode.id) : false,
  );

  // ?t= (a search moment) and ?resume= (history): start there once, then drop the parameter.
  const startedAtRef = useRef<string | null>(null);
  const startAt = parseStartAt(searchParams);
  useEffect(() => {
    if (!activeEpisode) return;
    const request = startRequestKey(startedAtRef.current, activeEpisode.id, startAt);
    if (!request.apply || startAt === null) return;
    startedAtRef.current = request.key;
    play(activeEpisode, activeFeed ?? undefined);
    seek(startAt);
    const next = new URLSearchParams(searchParams);
    next.delete('t');
    next.delete('resume');
    setSearchParams(next, { replace: true });
  }, [activeEpisode, activeFeed, startAt, play, seek, searchParams, setSearchParams]);

  // Refresh which transcripts exist after a local transcription finishes.
  // The initial decision (including auto-loading FlexiLingo's transcript) is made
  // by the store in `loadEpisode`, so switching episodes can't race it.
  useEffect(() => {
    if (activeEpisode) fetchTranscriptSourceInfo(activeEpisode.id);
  }, [activeEpisode?.id, activeEpisode?.transcriptStatus, fetchTranscriptSourceInfo]);

  // Listen for streaming transcript segments (real-time subtitles while on player page)
  useEffect(() => {
    if (!activeEpisode) return;
    const unlisten = listen<RawPodcastTranscriptSegment>('podcast-transcript-segment', (event) => {
      if (event.payload.episode_id === activeEpisode.id) {
        const segment = mapTranscriptSegment(event.payload);
        usePodcastStore.setState((s) => {
          s.transcriptSegments.push(segment);
        });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [activeEpisode?.id]);

  // Track active listening time
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      usePlayerStore.setState((s) => ({ activeTimeSpent: s.activeTimeSpent + 1000 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // XP calculation (1 per 5 min, max 12)
  const xpEarned = Math.min(12, Math.floor(activeTimeSpent / (5 * 60 * 1000)));

  // Show XP toast when episode completes
  useEffect(() => {
    if (showCompleteOverlay && xpEarned > 0) {
      setXpVisible(true);
    }
  }, [showCompleteOverlay, xpEarned]);

  // Check whisper availability
  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    invoke<{ is_available: boolean }>('caption_check_whisper')
      .then((info) => setWhisperAvailable(info.is_available))
      .catch(() => setWhisperAvailable(false));
  }, []);

  // Model compatibility dialog state
  const [showModelSuggestion, setShowModelSuggestion] = useState(false);
  const [modelCompatibility, setModelCompatibility] = useState<RawModelCompatibility | null>(null);

  // Fetch bookmarks when sidebar notes tab needs them
  useEffect(() => {
    if (activeEpisode && sidebarOpen) {
      fetchBookmarks(activeEpisode.id);
    }
  }, [activeEpisode?.id, sidebarOpen, fetchBookmarks]);

  if (!activeEpisode) return null;

  const isCurrentlyPlaying = currentEpisode?.id === activeEpisode.id;

  const handlePlay = () => {
    play(activeEpisode, activeFeed ?? undefined);
  };

  const handleSeek = (seconds: number) => {
    if (!isCurrentlyPlaying) handlePlay();
    const audio = seek;
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
    audio(newTime);
  };

  const handleSeekTo = (time: number) => {
    if (!isCurrentlyPlaying) handlePlay();
    seek(time);
  };

  const handleToggleMute = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  const handleTranscribe = async () => {
    if (whisperAvailable === false) {
      usePodcastStore.setState((s) => ({
        ...s,
        error: tp('player.whisperNotConfigured'),
      }));
      return;
    }

    // Check model compatibility with podcast language
    const feedLang = episodeSourceLang(activeEpisode, activeFeed);
    try {
      const compat = await invoke<RawModelCompatibility>('caption_check_model_for_language', {
        language: feedLang,
      });
      if (!compat.is_compatible) {
        setModelCompatibility(compat);
        setShowModelSuggestion(true);
        return;
      }
    } catch {
      // If check fails, proceed anyway
    }

    // If not downloaded, download first then auto-transcribe when done
    if (!activeEpisode.isDownloaded) {
      useJobStore.getState().queueTranscribeAfterDownload(activeEpisode.id);
      downloadEpisode(activeEpisode.id);
      return;
    }

    transcribeEpisode(activeEpisode.id);
  };

  const handlePlayPause = () => {
    if (isCurrentlyPlaying) {
      togglePlayPause();
    } else {
      handlePlay();
    }
  };

  const canTranscribe = activeEpisode.transcriptStatus !== 'completed';
  // Also treat DB 'processing' status as transcribing (job may have started before this page loaded)
  const isTranscribingOrProcessing =
    isTranscribing || activeEpisode.transcriptStatus === 'processing';
  const hasTranscript =
    transcriptSegments.length > 0 || isLoadingTranscript || isTranscribingOrProcessing;

  // Current segment for context
  const currentSegment = transcriptSegments.find((seg) => {
    const startSec = seg.startMs / 1000 + syncOffset;
    const endSec = seg.endMs / 1000 + syncOffset;
    return currentTime >= startSec && currentTime < endSec;
  });
  const hasCurrentSegment = !!currentSegment;
  const currentSentence = currentSegment?.text || '';
  const segIdx = currentSegment ? transcriptSegments.indexOf(currentSegment) : -1;
  const prevSentence = segIdx > 0 ? transcriptSegments[segIdx - 1]?.text : undefined;
  const nextSentence =
    segIdx >= 0 && segIdx < transcriptSegments.length - 1
      ? transcriptSegments[segIdx + 1]?.text
      : undefined;

  const handleOpenChat = (action?: 'translate' | 'grammar' | null) => {
    setChatAutoAction(action ?? null);
    setChatOpen(true);
  };

  const handleOpenNote = () => {
    if (currentSegment) {
      setNoteDialogOpen(true);
    } else {
      // Still allow note without segment context
      setNoteDialogOpen(true);
    }
  };

  return (
    <ProgramProvider
      videoId={activeEpisode.id}
      enabled={!activeEpisode.youtubeId}
      segments={programSegments}
      syncPoints={syncPoints}
    >
      <div className="flex flex-col h-full bg-background relative overflow-hidden">
        {/* Episode Complete Overlay */}
        {showCompleteOverlay && (
          <EpisodeCompleteOverlay
            analysis={nlpAnalysis}
            episode={activeEpisode}
            wordsClicked={wordsClicked}
            wordsAddedToDeck={wordsAddedToDeck}
            activeTimeSpent={activeTimeSpent}
            onReplay={() => {
              dismissCompleteOverlay();
              seek(0);
              if (!isPlaying) togglePlayPause();
            }}
            onOpenVocab={() => {
              dismissCompleteOverlay();
              setSidebarOpen(true);
            }}
            onDismiss={dismissCompleteOverlay}
            onStartQuiz={
              ENABLED_MODULES.podcastQuiz
                ? () => {
                    dismissCompleteOverlay();
                    setShowQuiz(true);
                  }
                : undefined
            }
          />
        )}

        {/* TopBar — full width */}
        {!focusMode && (
          <TopBar
            onBack={handleBack}
            onTranscribe={handleTranscribe}
            isTranscribing={isTranscribingOrProcessing}
            canTranscribe={canTranscribe}
            isDownloading={isDownloading}
            downloadProgress={downloadProgress}
            onOpenWhisperSettings={
              canTranscribe && !isTranscribingOrProcessing
                ? () => setWhisperSettingsOpen(true)
                : undefined
            }
            onSyncToCloud={() => setCloudSyncOpen(true)}
            hasTranscript={activeEpisode.transcriptStatus === 'completed'}
            transcriptControl={
              <TranscriptSourceButton
                info={transcriptSourceInfo}
                isTranscribing={isTranscribingOrProcessing}
                isDownloading={isDownloading}
                isFetchingCloud={isFetchingCloudTranscript}
                isDownloaded={activeEpisode.isDownloaded}
                onTranscribeLocally={handleTranscribe}
                onUseCloud={() => fetchCloudTranscript(activeEpisode.id)}
                onSwitchToSource={(source) => setTranscriptSource(activeEpisode.id, source)}
              />
            }
            episodeInfo={{
              title: activeEpisode.title,
              image: activeFeed?.artworkUrl ?? undefined,
              podcastTitle: activeFeed?.title,
              publishDate: activeEpisode.publishedAt,
              durationSeconds:
                activeEpisode.durationSeconds > 0 ? activeEpisode.durationSeconds : null,
              cefrLevel: activeEpisode.cefrLevel,
              description: activeEpisode.description,
              isDownloaded: activeEpisode.isDownloaded,
            }}
            sidebarAction={
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                title={sidebarOpen ? tp('player.closeSidebar') : tp('player.openSidebar')}
              >
                {sidebarOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            }
          />
        )}

        {/* Middle row — content + sidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {/* Main content column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Error banners */}
            {(pip.failed || favoriteError) && (
              <div className="shrink-0 mx-4 mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <span className="flex-1">{pip.failed ? tp('pipFailed') : favoriteError}</span>
                <button
                  type="button"
                  aria-label={tp('dismiss')}
                  onClick={pip.failed ? pip.dismissFailure : clearFavoriteError}
                  className="shrink-0 text-destructive/70 hover:text-destructive"
                >
                  &times;
                </button>
              </div>
            )}
            {(playError || podcastError) && (
              <div className="shrink-0 mx-4 mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono break-all flex items-start gap-2">
                <span className="flex-1">{playError || podcastError}</span>
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

            {/* Main content area — artwork + subtitle OR focus mode transcript */}
            <div className="flex-1 relative overflow-hidden flex flex-col">
              {focusMode && hasTranscript ? (
                /* Focus / Reading Mode — full scrollable transcript */
                <TranscriptPanel
                  segments={transcriptSegments}
                  currentTime={currentTime}
                  onSeek={handleSeekTo}
                  isLoading={isLoadingTranscript}
                  episodeId={activeEpisode.id}
                  sourceLang={episodeSourceLang(activeEpisode, activeFeed)}
                  syncOffset={syncOffset}
                />
              ) : (
                <>
                  {/* AudioPlayerArea — fills available space, but yields to subtitle */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <AudioPlayerArea
                      title={activeEpisode.title}
                      showName={activeFeed?.title}
                      image={activeEpisode.imageUrl ?? activeFeed?.artworkUrl}
                      isPlaying={isCurrentlyPlaying && isPlaying}
                      currentTime={isCurrentlyPlaying ? currentTime : 0}
                      duration={isCurrentlyPlaying ? duration : activeEpisode.durationSeconds}
                      onPlayClick={() => {
                        if (isCurrentlyPlaying) {
                          togglePlayPause();
                        } else {
                          handlePlay();
                        }
                      }}
                      onSeek={handleSeek}
                      analysis={nlpAnalysis}
                      episode={activeEpisode}
                    />
                  </div>

                  {/* Transcription progress indicator */}
                  {isTranscribingOrProcessing && (
                    <div className="shrink-0 flex items-center justify-center gap-2 py-2 px-4 bg-primary/10 border-t border-primary/20">
                      <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                      <span className="text-xs font-medium text-primary">
                        {transcribePercent > 0
                          ? tp('player.transcribingPercent', { percent: transcribePercent })
                          : tp('player.startingTranscription')}
                      </span>
                    </div>
                  )}

                  {/* SubtitleBar — positioned at bottom, never shrinks */}
                  {hasTranscript && (
                    <div className="shrink-0 relative z-10">
                      <SubtitleBar
                        segments={transcriptSegments}
                        currentTime={currentTime}
                        onSeek={handleSeekTo}
                        fontSize={fontSize}
                        subtitleBgOpacity={subtitleBgOpacity}
                        episodeId={activeEpisode.id}
                        subtitlesEnabled={subtitlesEnabled}
                        sourceLang={episodeSourceLang(activeEpisode, activeFeed)}
                        syncOffset={syncOffset}
                        autoPauseOnBoundary={autoPauseOnBoundary}
                        pauseOnHover={pauseOnHover}
                        subtitleAlignment={subtitleAlignment}
                        onAddToDeck={(words) => {
                          setAddToDeckWords(words);
                          setAddToDeckOpen(true);
                        }}
                        onDialogOpenChange={setWordDialogOpen}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          {/* end main content column */}

          {/* Sidebar — icon strip always visible, panel expands */}
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
            sourceLang={episodeSourceLang(activeEpisode, activeFeed)}
            bookmarks={bookmarks}
            episodeId={activeEpisode.id}
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
            onStartQuiz={ENABLED_MODULES.podcastQuiz ? () => setShowQuiz(true) : undefined}
            onAddToDeck={(words) => {
              setAddToDeckWords(words);
              setAddToDeckOpen(true);
            }}
          />
        </div>
        {/* end middle row */}

        <ProgramLayer
          meta={{
            videoId: activeEpisode.id,
            feedId: activeEpisode.feedId,
            title: activeEpisode.title,
            image: activeEpisode.imageUrl ?? activeFeed?.artworkUrl,
          }}
          lang={episodeSourceLang(activeEpisode, activeFeed)}
          onAddWords={(words) => {
            setAddToDeckWords(words);
            setAddToDeckOpen(true);
          }}
        />

        {/* ControlBar — always visible */}
        <ControlBar
          onOpenVocab={() => openSidebarTab('vocab')}
          onOpenAnalysis={() => openSidebarTab('analysis')}
          isPlaying={isCurrentlyPlaying && isPlaying}
          isBuffering={isBuffering}
          currentTime={isCurrentlyPlaying ? currentTime : 0}
          duration={isCurrentlyPlaying ? duration : activeEpisode.durationSeconds}
          volume={volume}
          isMuted={volume === 0}
          playbackRate={playbackRate}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSeekTo={handleSeekTo}
          onToggleMute={handleToggleMute}
          onSpeedChange={setPlaybackRate}
          onVolumeChange={setVolume}
          focusMode={focusMode}
          subtitlesEnabled={subtitlesEnabled}
          onToggleFocusMode={toggleFocusMode}
          onToggleSubtitles={toggleSubtitles}
          onNote={handleOpenNote}
          hasCurrentSegment={hasCurrentSegment}
          onAnalyzeSentence={() => handleOpenChat(null)}
          onTranslateSentence={() => handleOpenChat('translate')}
          onGrammarSentence={() => handleOpenChat('grammar')}
          onHelp={() => setFeedbackOpen(true)}
          onExit={handleBack}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          subtitleBgOpacity={subtitleBgOpacity}
          onSubtitleBgOpacityChange={setSubtitleBgOpacity}
          onSyncClick={hasTranscript ? () => setSyncDialogOpen(true) : undefined}
          autoPauseOnSubtitle={autoPauseOnBoundary}
          onToggleAutoPause={toggleAutoPauseOnBoundary}
          pauseOnWordHover={pauseOnHover}
          onTogglePauseOnHover={togglePauseOnHover}
          translationAlignment={subtitleAlignment}
          onTranslationAlignmentChange={setSubtitleAlignment}
          onPrevLine={lineSteps ? prevLine : undefined}
          onNextLine={lineSteps ? nextLine : undefined}
          onBookmark={() => toggleFavorite(activeEpisode, activeFeed)}
          bookmarked={isFavorite}
          onTogglePip={pip.supported ? pip.toggle : undefined}
          pipActive={pip.active}
          onPractice={
            activeEpisode.youtubeId || programSegments.length < 2
              ? undefined
              : () => setPracticeOpen(true)
          }
        />

        {practiceOpen && (
          <ProgramLauncher
            onClose={() => setPracticeOpen(false)}
            currentTime={Math.max(0, currentTime - syncOffset)}
          />
        )}
        <ProgramOverlayBridge
          open={
            chatOpen ||
            noteDialogOpen ||
            feedbackOpen ||
            syncDialogOpen ||
            addToDeckOpen ||
            wordDialogOpen
          }
        />

        {pip.container &&
          createPortal(
            <PipWindow
              title={activeEpisode.title}
              line={pipLine}
              nextLine={pipNextLine}
              idle={pipIdle}
              progress={pipTotal > 0 ? currentTime / pipTotal : 0}
              isPlaying={isCurrentlyPlaying && isPlaying}
              onTogglePlay={handlePlayPause}
              onPrevLine={prevLine}
              onNextLine={nextLine}
            />,
            pip.container,
          )}

        {/* Quiz Overlay */}
        {ENABLED_MODULES.podcastQuiz && showQuiz && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
              <h2 className="text-lg font-semibold">{tp('player.learningSession')}</h2>
              <button
                onClick={() => setShowQuiz(false)}
                className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors text-lg"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="max-w-3xl mx-auto">
                <LearningSession
                  contentId={activeEpisode.id}
                  contentTitle={activeEpisode.title}
                  onClose={() => setShowQuiz(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Subtitle Sync Dialog */}
        <SubtitleSyncDialog
          open={syncDialogOpen}
          onClose={() => setSyncDialogOpen(false)}
          episodeId={activeEpisode.id}
          segments={transcriptSegments}
          currentTime={isCurrentlyPlaying ? currentTime : 0}
          duration={isCurrentlyPlaying ? duration : activeEpisode.durationSeconds}
          isPlaying={isCurrentlyPlaying && isPlaying}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSeekTo={handleSeekTo}
          onSyncPointsChanged={setSyncPoints}
        />

        {/* Sentence Chat (Ask Lena) */}
        <SentenceChatSheet
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          sentence={currentSentence}
          prevSentence={prevSentence}
          nextSentence={nextSentence}
          episodeId={activeEpisode.id}
          sourceLang={episodeSourceLang(activeEpisode, activeFeed)}
          autoAction={chatAutoAction}
        />

        {/* Add to Deck Dialog */}
        <AddToDeckDialog
          open={addToDeckOpen}
          onClose={() => setAddToDeckOpen(false)}
          words={addToDeckWords}
          episodeId={activeEpisode.id}
          sentenceContext={currentSentence}
        />

        {/* Quick Add Note */}
        <QuickAddNoteDialog
          open={noteDialogOpen}
          onClose={() => setNoteDialogOpen(false)}
          episodeId={activeEpisode.id}
          currentTime={currentTime}
          subtitleText={currentSentence}
        />

        {/* Feedback */}
        <FeedbackDialog
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          episodeId={activeEpisode.id}
        />

        {/* Model Suggestion */}
        <ModelSuggestionDialog
          open={showModelSuggestion}
          onClose={() => setShowModelSuggestion(false)}
          compatibility={modelCompatibility}
          feedLanguage={episodeSourceLang(activeEpisode, activeFeed)}
          onModelSwitched={() => {
            setShowModelSuggestion(false);
            transcribeEpisode(activeEpisode.id);
          }}
        />

        {/* Whisper Settings */}
        <WhisperSettingsDialog
          open={whisperSettingsOpen}
          onClose={() => {
            setWhisperSettingsOpen(false);
            invoke<{ is_available: boolean }>('caption_check_whisper')
              .then((info) => setWhisperAvailable(info.is_available))
              .catch(() => setWhisperAvailable(false));
          }}
        />

        <CloudSyncDialog
          open={cloudSyncOpen}
          onOpenChange={setCloudSyncOpen}
          episodeId={activeEpisode.id}
          episodeTitle={activeEpisode.title}
        />

        {/* XP Toast */}
        <XPToast
          visible={xpVisible}
          earned={xpEarned}
          breakdown={{ time: xpEarned, words: wordsClicked, clicks: wordsAddedToDeck }}
          onHide={() => setXpVisible(false)}
        />

        {/* Saved Words Indicator */}
        <SavedWordsIndicator count={wordsAddedToDeck} onClick={() => setSidebarOpen(true)} />

        {/* Keyboard Shortcuts */}
        <GatedShortcuts
          enabled={
            !chatOpen &&
            !noteDialogOpen &&
            !feedbackOpen &&
            !syncDialogOpen &&
            !showQuiz &&
            !wordDialogOpen &&
            !addToDeckOpen
          }
          volumeKeys={!focusMode}
          transport={{
            togglePlay: handlePlayPause,
            prevLine: lineSteps ? prevLine : () => handleSeek(-5),
            nextLine: lineSteps ? nextLine : () => handleSeek(5),
            back10: () => handleSeek(-10),
            forward10: () => handleSeek(10),
            mute: handleToggleMute,
            volumeUp: () => setVolume(stepVolume(volume, 1)),
            volumeDown: () => setVolume(stepVolume(volume, -1)),
            bookmark: () => toggleFavorite(activeEpisode, activeFeed),
            pip: pip.supported ? pip.toggle : undefined,
          }}
          onToggleSubtitles={toggleSubtitles}
          onNote={handleOpenNote}
          onAnalyze={() => handleOpenChat(null)}
          onTranslate={() => handleOpenChat('translate')}
          onGrammar={() => handleOpenChat('grammar')}
          onSync={hasTranscript ? () => setSyncDialogOpen(true) : undefined}
          onFocus={toggleFocusMode}
          onHelp={() => setFeedbackOpen(true)}
          // Esc only leaves focus mode; it never leaves the episode (people press it to close whatever is on top).
          onExit={focusMode ? toggleFocusMode : undefined}
        />
      </div>
    </ProgramProvider>
  );
}

/** Pauses a running drill while a dialog is open and resumes it when the dialog closes. */
function ProgramOverlayBridge({ open }: { open: boolean }) {
  const { setHostOverlayOpen } = useProgramActions();
  useEffect(() => {
    setHostOverlayOpen(open);
  }, [open, setHostOverlayOpen]);
  return null;
}

/** The keyboard map, minus the transport keys while a drill owns the playhead. */
function GatedShortcuts(props: ComponentProps<typeof KeyboardShortcuts>) {
  const gate = useProgramGate();
  return (
    <KeyboardShortcuts {...props} transport={gate.ownsTransport ? undefined : props.transport} />
  );
}
