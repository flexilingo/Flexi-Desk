import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Captions, CaptionsOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePodcastStore } from '../stores/podcastStore';
import { usePlayerStore } from '../stores/playerStore';
import { episodeSourceLang } from '../utils/difficulty';
import { ControlBar } from './ControlBar';
import { SubtitleStack, displayIndexAt } from './SubtitleStack';
import { EpisodeCompleteOverlay } from './EpisodeCompleteOverlay';
import { SubtitleSyncDialog } from './SubtitleSyncDialog';
import { SentenceChatSheet } from './SentenceChatSheet';
import { AddToDeckDialog } from './AddToDeckDialog';
import { FeedbackDialog } from './FeedbackDialog';
import { XPToast } from './XPToast';
import { TranscriptSourceButton } from './TranscriptSourceButton';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { PipWindow } from './PipWindow';
import { CardActions } from './now-playing/CardActions';
import { EpisodesDialog } from './now-playing/EpisodesDialog';
import { NowPlayingArtwork } from './now-playing/NowPlayingArtwork';
import { NowPlayingBadges } from './now-playing/NowPlayingBadges';
import { PlayerStatusCard, type PlayerStatusKind } from './now-playing/PlayerStatusCard';
import { TranscribingMore } from './now-playing/TranscribingMore';
import { VocabDialog } from './now-playing/VocabDialog';
import { LinesSkeleton } from './now-playing/LinesSkeleton';
import { LocalSubtitleTools } from './now-playing/LocalSubtitleTools';
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
import { publicEpisodeUrl } from '../utils/publicUrl';
import type { SyncPoint, RawSyncPoint, RawPodcastTranscriptSegment } from '../types';
import { mapSyncPoint, getEffectiveOffset, mapTranscriptSegment } from '../types';
import type { RawModelCompatibility } from '@/pages/caption/types';
import { ModelSuggestionDialog } from './ModelSuggestionDialog';
import { WhisperSettingsDialog } from './WhisperSettingsDialog';
import { CloudSyncDialog } from './CloudSyncDialog';
import { useJobStore } from '@/stores/jobStore';

/**
 * The full podcast player — the website's now-playing layout (10-09/10-10): a card with what is
 * playing (the way back, save, episodes, share; the cover; title, show, level · length · words; the
 * transport and the tools in at most two balanced rows) beside a card with the lines and nothing
 * else. No lines yet: one centred card with why, and how to get them.
 */
export function PlayerView() {
  const {
    activeEpisode,
    activeFeed,
    transcriptSegments,
    isLoadingTranscript,
    nlpAnalysis,
    downloadEpisode,
    transcribeEpisode,
    error: podcastError,
    clearError,
    transcriptSourceInfo,
    isFetchingCloudTranscript,
    fetchTranscriptSourceInfo,
    fetchCloudTranscript,
    setTranscriptSource,
  } = usePodcastStore();
  const navigate = useNavigate();
  const { t } = useTranslation('podcastUi');

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
  const downloadPercent = useJobStore((s) => {
    const job = Object.values(s.jobs).find(
      (j) => j.episodeId === activeEpisode?.id && j.type === 'download' && j.status === 'running',
    );
    return job?.progress ?? -1;
  });
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
  const fontSize = usePlayerStore((s) => s.fontSize);
  const contextLines = usePlayerStore((s) => s.contextLines);
  const showCompleteOverlay = usePlayerStore((s) => s.showCompleteOverlay);
  const wordsClicked = usePlayerStore((s) => s.wordsClicked);
  const wordsAddedToDeck = usePlayerStore((s) => s.wordsAddedToDeck);
  const activeTimeSpent = usePlayerStore((s) => s.activeTimeSpent);
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const playError = usePlayerStore((s) => s.playError);
  const autoPauseOnBoundary = usePlayerStore((s) => s.autoPauseOnBoundary);
  const pauseOnHover = usePlayerStore((s) => s.pauseOnHover);

  const play = usePlayerStore((s) => s.play);
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

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutoAction, setChatAutoAction] = useState<'translate' | 'grammar' | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [xpVisible, setXpVisible] = useState(false);
  const [addToDeckWords, setAddToDeckWords] = useState<string[]>([]);
  const [addToDeckOpen, setAddToDeckOpen] = useState(false);
  const [whisperSettingsOpen, setWhisperSettingsOpen] = useState(false);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [wordDialogOpen, setWordDialogOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);

  useEffect(() => {
    if (!activeEpisode) return;
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId: activeEpisode.id })
      .then((raw) => setSyncPoints(raw.map(mapSyncPoint)))
      .catch(() => {});
  }, [activeEpisode?.id]);

  const syncOffset = getEffectiveOffset(currentTime, syncPoints);

  const programSegments = useMemo<TranscriptSegment[]>(
    () =>
      transcriptSegments.map((s) => ({
        start: s.startMs / 1000,
        end: s.endMs / 1000,
        text: s.text,
      })),
    [transcriptSegments],
  );

  const [searchParams, setSearchParams] = useSearchParams();
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
    ? t('pipSubtitlesOff')
    : transcriptSegments.length > 0
      ? t('pipIdle')
      : t('pipNoTranscript');
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

  // Save the episode (here and, with a catalogue id and an account, on the account).
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const favoriteError = useFavoritesStore((s) => s.error);
  const clearFavoriteError = useFavoritesStore((s) => s.clearError);
  const favoritePending = useFavoritesStore(
    (s) => !!activeEpisode && s.pendingId === activeEpisode.id,
  );
  const isFavorite = useFavoritesStore((s) =>
    activeEpisode ? s.local.some((l) => l.localEpisodeId === activeEpisode.id) : false,
  );

  // ?t= (a search moment) and ?resume= (history, Notes): start there once, then drop the parameter.
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

  // Which transcripts exist, after a local transcription finishes.
  useEffect(() => {
    if (activeEpisode) fetchTranscriptSourceInfo(activeEpisode.id);
  }, [activeEpisode?.id, activeEpisode?.transcriptStatus, fetchTranscriptSourceInfo]);

  // Lines streamed in while this computer makes the subtitles.
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

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      usePlayerStore.setState((s) => ({ activeTimeSpent: s.activeTimeSpent + 1000 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // XP (1 per 5 min, max 12), shown when the episode ends.
  const xpEarned = Math.min(12, Math.floor(activeTimeSpent / (5 * 60 * 1000)));
  useEffect(() => {
    if (showCompleteOverlay && xpEarned > 0) setXpVisible(true);
  }, [showCompleteOverlay, xpEarned]);

  const [whisperAvailable, setWhisperAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    invoke<{ is_available: boolean }>('caption_check_whisper')
      .then((info) => setWhisperAvailable(info.is_available))
      .catch(() => setWhisperAvailable(false));
  }, []);
  const [showModelSuggestion, setShowModelSuggestion] = useState(false);
  const [modelCompatibility, setModelCompatibility] = useState<RawModelCompatibility | null>(null);

  // A dialog over the player pauses it, and the player carries on when every one is closed
  // (website: the overlay pause). Lena only pauses: her sheet is a stop-and-study place.
  const overlayOpen =
    vocabOpen || wordDialogOpen || addToDeckOpen || feedbackOpen || showCompleteOverlay;
  const wasPlayingRef = useRef(false);
  const overlayWasOpenRef = useRef(false);
  const programOwnsRef = useRef(false);
  useEffect(() => {
    if (programOwnsRef.current) {
      overlayWasOpenRef.current = overlayOpen;
      return;
    }
    const st = usePlayerStore.getState();
    if (overlayOpen && !overlayWasOpenRef.current) {
      wasPlayingRef.current = st.isPlaying;
      if (st.isPlaying) st.pause();
    } else if (!overlayOpen && overlayWasOpenRef.current && wasPlayingRef.current) {
      st.resume();
    }
    overlayWasOpenRef.current = overlayOpen;
  }, [overlayOpen]);

  if (!activeEpisode) return null;

  const sourceLang = episodeSourceLang(activeEpisode, activeFeed);
  const time = isCurrentEpisode ? currentTime : 0;
  const knownDuration = isCurrentEpisode && duration > 0 ? duration : activeEpisode.durationSeconds;

  const handlePlay = () => play(activeEpisode, activeFeed ?? undefined);
  const handlePlayPause = () => (isCurrentEpisode ? togglePlayPause() : handlePlay());
  const handleSeek = (seconds: number) => {
    if (!isCurrentEpisode) handlePlay();
    seek(Math.max(0, Math.min(currentTime + seconds, duration)));
  };
  const handleSeekTo = (to: number) => {
    if (!isCurrentEpisode) handlePlay();
    seek(to);
  };
  const handleToggleMute = () => setVolume(volume > 0 ? 0 : 1);
  const handleBack = () => navigate(-1);

  // Make the subtitles on this computer (desk only): the model is checked against the language,
  // and the audio is downloaded first when it is not here yet.
  const handleTranscribe = async () => {
    if (whisperAvailable === false) {
      usePodcastStore.setState((s) => ({ ...s, error: t('player.whisperNotConfigured') }));
      return;
    }
    try {
      const compat = await invoke<RawModelCompatibility>('caption_check_model_for_language', {
        language: sourceLang,
      });
      if (!compat.is_compatible) {
        setModelCompatibility(compat);
        setShowModelSuggestion(true);
        return;
      }
    } catch {
      // The check is advisory: go ahead.
    }
    if (!activeEpisode.isDownloaded) {
      useJobStore.getState().queueTranscribeAfterDownload(activeEpisode.id);
      downloadEpisode(activeEpisode.id);
      return;
    }
    transcribeEpisode(activeEpisode.id);
  };

  const transcribingHere = isTranscribing || activeEpisode.transcriptStatus === 'processing';
  const segments = transcriptSegments;
  const displayIndex = displayIndexAt(segments, (time - syncOffset) * 1000);
  const hasCurrentSegment = segments.length > 0 && displayIndex >= 0;
  const currentSegment = hasCurrentSegment ? segments[displayIndex] : undefined;
  const currentSentence = currentSegment?.text ?? '';
  const prevSentence = displayIndex > 0 ? segments[displayIndex - 1]?.text : undefined;
  const nextSentence = displayIndex >= 0 ? segments[displayIndex + 1]?.text : undefined;
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

  const sourceButton = (
    <TranscriptSourceButton
      info={transcriptSourceInfo}
      isTranscribing={transcribingHere}
      isDownloading={isDownloading}
      isFetchingCloud={isFetchingCloudTranscript}
      isDownloaded={activeEpisode.isDownloaded}
      onTranscribeLocally={handleTranscribe}
      onUseCloud={() => fetchCloudTranscript(activeEpisode.id)}
      onSwitchToSource={(source) => setTranscriptSource(activeEpisode.id, source)}
    />
  );
  const localTools = (withShare: boolean) => (
    <LocalSubtitleTools
      isDownloaded={activeEpisode.isDownloaded}
      isDownloading={isDownloading && !transcribingHere}
      downloadPercent={downloadPercent >= 0 ? downloadPercent : null}
      onDownload={() => downloadEpisode(activeEpisode.id)}
      onWhisperSettings={transcribingHere ? undefined : () => setWhisperSettingsOpen(true)}
      onShareToCloud={
        withShare && activeEpisode.transcriptStatus === 'completed'
          ? () => setCloudSyncOpen(true)
          : undefined
      }
    />
  );

  const subtitlesOn = subtitlesEnabled;
  const loading = isLoadingTranscript && segments.length === 0;
  const noLinesYet = segments.length === 0 && !loading;
  const firstLineIn = segments.length > 0 ? segments[0].startMs / 1000 + syncOffset - time : 0;

  const noLinesKind: PlayerStatusKind =
    transcribingHere || isDownloading
      ? 'processing'
      : activeEpisode.transcriptStatus === 'failed'
        ? 'failed'
        : 'noTranscript';

  const controlProps: ComponentProps<typeof ControlBar> = {
    layout: 'card',
    isPlaying: isCurrentEpisode && isPlaying,
    isLoading: isCurrentEpisode && isPlaying && isBuffering,
    currentTime: time,
    duration: isCurrentEpisode ? duration : 0,
    fallbackDuration: activeEpisode.durationSeconds,
    volume,
    playbackRate,
    onPlayPause: handlePlayPause,
    onSeek: handleSeek,
    onSeekTo: handleSeekTo,
    onPrevLine: lineSteps ? prevLine : undefined,
    onNextLine: lineSteps ? nextLine : undefined,
    onToggleMute: handleToggleMute,
    onSpeedChange: setPlaybackRate,
    onVolumeChange: setVolume,
    hasCurrentSegment,
    onVocab: () => setVocabOpen(true),
    onTranslateSentence: () => openLena('translate'),
    onAnalyzeSentence: () => openLena(null),
    onSyncClick: segments.length > 0 ? () => setSyncDialogOpen(true) : undefined,
    onPictureInPicture: pip.supported ? pip.toggle : undefined,
    pipActive: pip.active,
    onOpenProgram: programSegments.length >= 2 ? () => setPracticeOpen(true) : undefined,
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
    subtitleSourceSlot: (
      <>
        <span className="text-sm font-medium text-foreground">{t('np.subtitleSourceHeading')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {sourceButton}
          {localTools(true)}
        </div>
      </>
    ),
  };

  const cardActions = (
    <CardActions
      onBack={handleBack}
      onToggleFavorite={() => toggleFavorite(activeEpisode, activeFeed)}
      isFavorite={isFavorite}
      favoritePending={favoritePending}
      episodes={
        activeFeed ? <EpisodesDialog feed={activeFeed} currentId={activeEpisode.id} /> : undefined
      }
      shareUrl={publicEpisodeUrl(activeEpisode)}
    />
  );
  const artwork = activeEpisode.imageUrl ?? activeFeed?.artworkUrl;
  const titleBlock = (
    <div>
      <h1 dir="auto" className="line-clamp-3 text-[22px] font-bold leading-tight text-foreground">
        {activeEpisode.title}
      </h1>
      {activeFeed?.title && (
        <p dir="auto" className="mt-1 truncate text-base text-muted-foreground">
          {activeFeed.title}
        </p>
      )}
      <NowPlayingBadges
        className="mt-3"
        level={
          activeEpisode.difficultyBand ?? activeEpisode.cefrLevel ?? nlpAnalysis?.cefrLevel ?? null
        }
        durationSeconds={knownDuration || null}
        uniqueWords={nlpAnalysis?.uniqueWords ?? null}
      />
    </div>
  );
  const subtitlesOffNotice = (
    <div className="flex flex-col items-center gap-3 text-center">
      <CaptionsOff className="h-6 w-6 text-primary" />
      <p className="text-sm text-muted-foreground">{t('np.npSubtitlesOff')}</p>
      <Button variant="outline" size="sm" onClick={toggleSubtitles}>
        <Captions className="h-4 w-4" />
        {t('np.npTurnOnSubtitles')}
      </Button>
    </div>
  );
  const transcribingMore =
    transcribingHere && segments.length > 0 ? (
      <TranscribingMore
        percent={transcribePercent > 0 ? Math.min(99, Math.round(transcribePercent)) : null}
      />
    ) : null;

  const card = 'rounded-md border border-border bg-card shadow-md';

  let body: ReactNode;
  if (noLinesYet) {
    // No lines, and none coming without making them or a wait: one centred card.
    body = (
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-5 pb-5 pt-5">
        <div className={`my-auto flex w-full max-w-[480px] flex-col gap-5 p-5 ${card}`}>
          {cardActions}
          <NowPlayingArtwork
            image={artwork}
            alt={activeEpisode.title}
            className="aspect-square w-[min(100%,34vh)] shrink-0 self-center rounded-md shadow-md"
          />
          <div className="px-1">{titleBlock}</div>
          {subtitlesOn && (
            <PlayerStatusCard
              kind={noLinesKind}
              percent={transcribingHere ? Math.round(transcribePercent) : null}
              className="w-full"
              action={
                noLinesKind === 'processing' ? undefined : (
                  <>
                    {sourceButton}
                    {localTools(false)}
                  </>
                )
              }
            />
          )}
          <div className="px-1">
            <ControlBar
              {...controlProps}
              onVocab={undefined}
              onTranslateSentence={undefined}
              onAnalyzeSentence={undefined}
              onSyncClick={undefined}
              onFontSizeChange={undefined}
              onOpenProgram={undefined}
            />
          </div>
        </div>
      </div>
    );
  } else {
    const readingPane = loading ? (
      <LinesSkeleton className="pb-6" />
    ) : !subtitlesOn ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-10 pb-10">
        {subtitlesOffNotice}
      </div>
    ) : !hasCurrentSegment ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-10 pb-10">
        <PlayerStatusCard
          kind="startsIn"
          secondsLeft={firstLineIn}
          className="w-full max-w-[440px]"
        />
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
        <SubtitleStack
          segments={segments}
          currentTime={time}
          syncOffset={syncOffset}
          fontSize={fontSize}
          maxContext={contextLines}
          roomy
          episodeId={activeEpisode.id}
          sourceLang={sourceLang}
          autoPauseOnBoundary={autoPauseOnBoundary}
          pauseOnHover={pauseOnHover}
          waitingLabel={t('np.waitingForSubtitle')}
          onSeek={handleSeekTo}
          onAddToDeck={addWords}
          onDialogOpenChange={setWordDialogOpen}
        />
      </div>
    );
    body = (
      <div className="flex min-h-0 flex-1 gap-5 px-5 pb-5 pt-5">
        <aside
          className={`flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto p-4 xl:w-[380px] ${card}`}
        >
          {cardActions}
          <div className="flex flex-1 flex-col justify-center gap-6 px-2 pb-2">
            <NowPlayingArtwork
              image={artwork}
              alt={activeEpisode.title}
              className="aspect-square w-[min(100%,36vh)] shrink-0 self-center rounded-md shadow-md"
            />
            {titleBlock}
            <ControlBar {...controlProps} />
          </div>
        </aside>
        <section className={`flex min-w-0 flex-1 flex-col overflow-hidden ${card}`}>
          <div className="relative flex min-h-0 flex-1 flex-col pt-6">
            {readingPane}
            {transcribingMore}
          </div>
        </section>
      </div>
    );
  }

  return (
    <ProgramProvider
      videoId={activeEpisode.id}
      enabled={!activeEpisode.youtubeId}
      segments={programSegments}
      syncPoints={syncPoints}
    >
      <ProgramOwnsTransport ownsRef={programOwnsRef} />
      <div className="relative flex h-full flex-col overflow-hidden bg-background">
        {(pip.failed || favoriteError || playError || podcastError) && (
          <div className="mx-5 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error">
            <span className="flex-1 break-words">
              {pip.failed ? t('pipFailed') : (favoriteError ?? podcastError ?? playError)}
            </span>
            <button
              type="button"
              aria-label={t('dismiss')}
              onClick={
                pip.failed ? pip.dismissFailure : favoriteError ? clearFavoriteError : clearError
              }
              className="shrink-0 text-error/70 hover:text-error"
            >
              &times;
            </button>
          </div>
        )}

        {body}

        <ProgramLayer
          meta={{
            videoId: activeEpisode.id,
            feedId: activeEpisode.feedId,
            title: activeEpisode.title,
            image: artwork ?? undefined,
          }}
          lang={sourceLang}
          onAddWords={addWords}
        />

        {showCompleteOverlay && (
          <EpisodeCompleteOverlay
            analysis={nlpAnalysis}
            level={activeEpisode.difficultyBand ?? nlpAnalysis?.cefrLevel ?? null}
            wordsClicked={wordsClicked}
            wordsAddedToDeck={wordsAddedToDeck}
            activeTimeSpent={activeTimeSpent}
            xpEarned={xpEarned}
            currentVideoId={activeEpisode.videoId}
            onDismiss={dismissCompleteOverlay}
          />
        )}

        {practiceOpen && (
          <ProgramLauncher
            onClose={() => setPracticeOpen(false)}
            currentTime={Math.max(0, currentTime - syncOffset)}
          />
        )}
        <ProgramOverlayBridge
          open={
            chatOpen ||
            feedbackOpen ||
            syncDialogOpen ||
            addToDeckOpen ||
            wordDialogOpen ||
            vocabOpen
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
              isPlaying={isCurrentEpisode && isPlaying}
              onTogglePlay={handlePlayPause}
              onPrevLine={prevLine}
              onNextLine={nextLine}
            />,
            pip.container,
          )}

        <VocabDialog
          open={vocabOpen}
          onOpenChange={setVocabOpen}
          analysis={nlpAnalysis}
          onAddToDeck={(words) => {
            setVocabOpen(false);
            addWords(words);
          }}
        />

        <SubtitleSyncDialog
          open={syncDialogOpen}
          onClose={() => setSyncDialogOpen(false)}
          episodeId={activeEpisode.id}
          segments={segments}
          currentTime={time}
          duration={isCurrentEpisode ? duration : activeEpisode.durationSeconds}
          isPlaying={isCurrentEpisode && isPlaying}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSeekTo={handleSeekTo}
          onSyncPointsChanged={setSyncPoints}
        />

        <SentenceChatSheet
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          sentence={currentSentence}
          prevSentence={prevSentence}
          nextSentence={nextSentence}
          episodeId={activeEpisode.id}
          cloudVideoId={activeEpisode.videoId}
          autoAction={chatAutoAction}
        />

        <AddToDeckDialog
          open={addToDeckOpen}
          onClose={() => setAddToDeckOpen(false)}
          words={addToDeckWords}
          episodeId={activeEpisode.id}
          sentenceContext={currentSentence}
        />

        <FeedbackDialog
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          episodeId={activeEpisode.id}
        />

        <ModelSuggestionDialog
          open={showModelSuggestion}
          onClose={() => setShowModelSuggestion(false)}
          compatibility={modelCompatibility}
          feedLanguage={sourceLang}
          onModelSwitched={() => {
            setShowModelSuggestion(false);
            transcribeEpisode(activeEpisode.id);
          }}
        />

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

        <XPToast
          visible={xpVisible}
          earned={xpEarned}
          breakdown={{ time: xpEarned, words: wordsClicked, clicks: wordsAddedToDeck }}
          onHide={() => setXpVisible(false)}
        />

        <GatedShortcuts
          enabled={
            !chatOpen &&
            !feedbackOpen &&
            !syncDialogOpen &&
            !wordDialogOpen &&
            !addToDeckOpen &&
            !vocabOpen
          }
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
          onAnalyze={() => openLena(null)}
          onTranslate={() => openLena('translate')}
          onGrammar={() => openLena('grammar')}
          onSync={segments.length > 0 ? () => setSyncDialogOpen(true) : undefined}
          onHelp={() => setFeedbackOpen(true)}
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

/** While a drill owns the playhead, the player's own overlay pause keeps its hands off. */
function ProgramOwnsTransport({ ownsRef }: { ownsRef: { current: boolean } }) {
  const { ownsTransport } = useProgramGate();
  useEffect(() => {
    ownsRef.current = ownsTransport;
  }, [ownsRef, ownsTransport]);
  return null;
}

/** The keyboard map, minus the transport keys while a drill owns the playhead. */
function GatedShortcuts(props: ComponentProps<typeof KeyboardShortcuts>) {
  const gate = useProgramGate();
  return (
    <KeyboardShortcuts {...props} transport={gate.ownsTransport ? undefined : props.transport} />
  );
}
