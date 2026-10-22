import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '../stores/playerStore';
import { usePodcastStore } from '../stores/podcastStore';
import { useJobStore } from '@/stores/jobStore';
import { VideoHost } from '@/pages/videos/player/VideoHost';
import { BookMiniPlayer } from '@/pages/reader/book/BookMiniPlayer';
import { WordDialog } from '@/components/WordDialog';
import { episodeSourceLang } from '../utils/difficulty';
import {
  getEffectiveOffset,
  mapSyncPoint,
  mapTranscriptSegment,
  type PodcastTranscriptSegment,
  type RawPodcastTranscriptSegment,
  type RawSyncPoint,
  type SyncPoint,
} from '../types';
import { MiniPlayerBar } from './mini/MiniPlayerBar';
import { MiniSubtitleLine } from './mini/MiniSubtitleLine';

/**
 * The persistent mini player (website: `GlobalMiniPlayer`). A podcast docks a full-width bar under
 * every page, with an opt-in (CC) subtitle line whose words open the word dialog; a catalogue video
 * keeps its picture in a floating box (YouTube needs a visible player); a book track uses the same
 * bar in book mode (line steps, the book's own subtitles, the listen count).
 */
export function MiniPlayer() {
  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  if (!currentEpisode) return null;
  if (currentEpisode.youtubeId) return <VideoHost />;
  if (currentEpisode.bookTrack) return <BookMiniPlayer />;
  return <PodcastMiniPlayer />;
}

function PodcastMiniPlayer() {
  const navigate = useNavigate();
  const episode = usePlayerStore((s) => s.currentEpisode)!;
  const feed = usePlayerStore((s) => s.currentFeed);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const playError = usePlayerStore((s) => s.playError);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const seek = usePlayerStore((s) => s.seek);
  const skipBack = usePlayerStore((s) => s.skipBack);
  const skipForward = usePlayerStore((s) => s.skipForward);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const stop = usePlayerStore((s) => s.stop);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const loadEpisode = usePodcastStore((s) => s.loadEpisode);
  const isProcessing = useJobStore((s) =>
    Object.values(s.jobs).some(
      (j) => j.episodeId === episode.id && j.type === 'transcribe' && j.status === 'running',
    ),
  );

  const [cc, setCc] = useState(false);
  const [word, setWord] = useState<string | null>(null);
  const [segments, setSegments] = useState<PodcastTranscriptSegment[]>([]);
  const [syncPoints, setSyncPoints] = useState<SyncPoint[]>([]);

  // The episode's lines (this computer's copy) and the listener's sync points.
  useEffect(() => {
    let live = true;
    setSegments([]);
    setSyncPoints([]);
    setCc(false);
    setWord(null);
    invoke<RawPodcastTranscriptSegment[]>('podcast_get_transcript_segments', {
      episodeId: episode.id,
    })
      .then((raw) => live && setSegments(raw.map(mapTranscriptSegment)))
      .catch(() => {});
    invoke<RawSyncPoint[]>('podcast_get_sync_points', { episodeId: episode.id })
      .then((raw) => live && setSyncPoints(raw.map(mapSyncPoint)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [episode.id, isProcessing]);

  const line = useMemo(() => {
    if (!cc || segments.length === 0) return null;
    const ms = (currentTime - getEffectiveOffset(currentTime, syncPoints)) * 1000;
    return segments.find((s) => ms >= s.startMs && ms <= s.endMs) ?? null;
  }, [cc, segments, syncPoints, currentTime]);

  const expand = () => {
    loadEpisode(episode, feed ?? undefined);
    navigate(`/podcast/player/${episode.id}`);
  };
  const hasTranscription = segments.length > 0;

  return (
    <>
      <MiniPlayerBar
        title={episode.title}
        showName={feed?.title}
        image={episode.imageUrl ?? feed?.artworkUrl}
        isPlaying={isPlaying}
        isLoading={isBuffering && isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        playbackError={!!playError}
        onPlayPause={togglePlayPause}
        onSkip={(s) => (s < 0 ? skipBack(-s) : skipForward(s))}
        onSeek={seek}
        onVolumeChange={setVolume}
        onExpand={expand}
        onExit={stop}
        hasTranscription={hasTranscription}
        ccEnabled={cc}
        onToggleCC={() => setCc((v) => !v)}
        isProcessing={isProcessing}
        // The subtitles are made where the web makes them: in the player's status card.
        onTranscribe={!hasTranscription && !isProcessing ? expand : undefined}
        subtitleLine={
          line ? (
            <MiniSubtitleLine
              text={line.text}
              onWordClick={(w) => {
                pause();
                setWord(w);
              }}
            />
          ) : null
        }
      />
      <WordDialog
        word={word ?? ''}
        open={!!word}
        onOpenChange={(open) => {
          if (open) return;
          setWord(null);
          resume();
        }}
        episodeId={episode.id}
        sourceLang={episodeSourceLang(episode, feed)}
        sentenceContext={line?.text}
      />
    </>
  );
}
