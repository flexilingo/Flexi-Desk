import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { usePodcastStore } from '../stores/podcastStore';
import { usePlayerStore } from '../stores/playerStore';
import { AudioPlayerArea } from './AudioPlayerArea';
import { ControlBar } from './ControlBar';
import { TopBar } from './TopBar';
import { SubtitleBar } from './SubtitleBar';
import { TranscriptPanel } from './TranscriptPanel';
import { EpisodeCompleteOverlay } from './EpisodeCompleteOverlay';
import { PlayerSidebar } from './sidebar/PlayerSidebar';
import { SubtitleSyncDialog } from './SubtitleSyncDialog';
import { SentenceChatSheet } from './SentenceChatSheet';
import { AddToDeckDialog } from './AddToDeckDialog';
import { QuickAddNoteDialog } from './QuickAddNoteDialog';
import { FeedbackDialog } from './FeedbackDialog';
import { XPToast } from './XPToast';
import { SavedWordsIndicator } from './SavedWordsIndicator';
import { DifficultyBadge } from './DifficultyBadge';
import { KeyboardShortcuts } from './KeyboardShortcuts';
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
    goBack,
    downloadEpisode,
    transcribeEpisode,
    fetchBookmarks,
    addBookmark,
    deleteBookmark,
    error: podcastError,
    clearError,
  } = usePodcastStore();

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
  const showEstimatedOnSubtitles = usePlayerStore((s) => s.showEstimatedOnSubtitles);
  const toggleShowEstimated = usePlayerStore((s) => s.toggleShowEstimated);

  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  // Load sync points on episode change
  useEffect(() => {
    if (!activeEpisode) return;
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId: activeEpisode.id })
      .then((raw) => setSyncPoints(raw.map(mapSyncPoint)))
      .catch(() => {});
  }, [activeEpisode?.id]);

  const syncOffset = getEffectiveOffset(currentTime, syncPoints);

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
        error:
          'Whisper is not configured. Go to Settings → Whisper tab and complete both Step 1 (binary path) and Step 2 (model download), then click "Save Configuration".',
      }));
      return;
    }

    // Check model compatibility with podcast language
    const feedLang = activeFeed?.language ?? 'auto';
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
  const isTranscribingOrProcessing = isTranscribing || activeEpisode.transcriptStatus === 'processing';
  const hasTranscript = transcriptSegments.length > 0 || isLoadingTranscript || isTranscribingOrProcessing;

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
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Episode Complete Overlay */}
      {showCompleteOverlay && (
        <EpisodeCompleteOverlay
          analysis={nlpAnalysis}
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
          onStartQuiz={ENABLED_MODULES.podcastQuiz ? () => {
            dismissCompleteOverlay();
            setShowQuiz(true);
          } : undefined}
        />
      )}

      {/* TopBar — full width */}
      {!focusMode && (
        <TopBar
          onBack={goBack}
          onTranscribe={handleTranscribe}
          isTranscribing={isTranscribingOrProcessing}
          canTranscribe={canTranscribe}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          onOpenWhisperSettings={canTranscribe && !isTranscribingOrProcessing ? () => setWhisperSettingsOpen(true) : undefined}
          onSyncToCloud={() => setCloudSyncOpen(true)}
          hasTranscript={activeEpisode.transcriptStatus === 'completed'}
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
      )}

      {/* Middle row — content + sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Main content column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Error banners */}
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
                sourceLang={activeFeed?.language || 'en'}
                syncOffset={syncOffset}
              />
            ) : (
              <>
                {/* AudioPlayerArea — fills available space, but yields to subtitle */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AudioPlayerArea
                    title={activeEpisode.title}
                    showName={activeFeed?.title}
                    image={activeFeed?.artworkUrl}
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
                  />
                </div>

                {/* Transcription progress indicator */}
                {isTranscribingOrProcessing && (
                  <div className="shrink-0 flex items-center justify-center gap-2 py-2 px-4 bg-primary/10 border-t border-primary/20">
                    <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-medium text-primary">
                      {transcribePercent > 0
                        ? `Transcribing... ${transcribePercent}%`
                        : 'Starting transcription...'}
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
                      sourceLang={activeFeed?.language || 'en'}
                      syncOffset={syncOffset}
                      autoPauseOnBoundary={autoPauseOnBoundary}
                      pauseOnHover={pauseOnHover}
                      subtitleAlignment={subtitleAlignment}
                      showEstimatedOnSubtitles={showEstimatedOnSubtitles}
                      onAddToDeck={(words) => {
                        setAddToDeckWords(words);
                        setAddToDeckOpen(true);
                      }}
                      onDialogOpenChange={setWordDialogOpen}
                    />
                    <div className="flex justify-center py-1">
                      <DifficultyBadge cefrLevel={nlpAnalysis?.cefrLevel} />
                    </div>
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
          onOpen={() => setSidebarOpen(true)}
          wordsClicked={wordsClicked}
          wordsAddedToDeck={wordsAddedToDeck}
          activeTimeSpent={activeTimeSpent}
          segmentCount={transcriptSegments.length}
          analysis={nlpAnalysis}
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

      {/* ControlBar — always visible */}
      <ControlBar
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
        onExit={goBack}
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
        showEstimatedOnSubtitles={showEstimatedOnSubtitles}
        onToggleShowEstimated={toggleShowEstimated}
      />

      {/* Quiz Overlay */}
      {ENABLED_MODULES.podcastQuiz && showQuiz && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <h2 className="text-lg font-semibold">Learning Session</h2>
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
        onOpenChange={setSyncDialogOpen}
        episodeId={activeEpisode.id}
        currentTime={currentTime}
        segments={transcriptSegments}
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
        sourceLang={activeFeed?.language || 'en'}
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
        feedLanguage={activeFeed?.language ?? 'auto'}
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
      <KeyboardShortcuts
        enabled={!chatOpen && !noteDialogOpen && !feedbackOpen && !syncDialogOpen && !showQuiz && !wordDialogOpen}
        onToggleSubtitles={toggleSubtitles}
        onNote={handleOpenNote}
        onAnalyze={() => handleOpenChat(null)}
        onTranslate={() => handleOpenChat('translate')}
        onGrammar={() => handleOpenChat('grammar')}
        onSync={hasTranscript ? () => setSyncDialogOpen(true) : undefined}
        onFocus={toggleFocusMode}
        onHelp={() => setFeedbackOpen(true)}
        onExit={goBack}
      />
    </div>
  );
}
