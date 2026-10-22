import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { usePodcastStore } from '../stores/podcastStore';
import { getEpisodeMetadata } from '../services/podcastCloud';
import type { CloudEpisodeInput, CuratedEpisodeLite, EpisodeByLevel } from '../types';
import type { SemanticHit } from '../services/podcastSearch';
import type { FavoriteEpisode, HistoryEpisode } from '../services/podcastAccount';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `curated_episode_id` must be the `curated_episodes.id` UUID — it's the key the
 * cloud progress heartbeat posts against. Episodes that only exist in RSS carry a
 * synthetic id (`pi_1234`) and must store null instead, or the heartbeat 400s.
 */
const curatedIdOrNull = (id: string): string | null => (UUID_RE.test(id) ? id : null);

/**
 * Turns a *cloud* episode into a *local* one, then opens the player.
 *
 * The hub lists cloud episodes, but every local capability — the player,
 * downloads, Whisper transcription, bookmarks, NLP, add-to-deck — operates on
 * rows in local SQLite. `podcast_import_cloud_episode` is the bridge: it upserts
 * the feed + episode (idempotently, never clobbering local listening state) and
 * hands back the local episode id we can route to.
 *
 * Previously the hub had to subscribe to a podcast's whole RSS feed just to play
 * one episode. It doesn't any more.
 */
export function useImportAndPlay() {
  const navigate = useNavigate();
  const loadEpisodeById = usePodcastStore((s) => s.loadEpisodeById);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importAndPlay = useCallback(
    async (input: CloudEpisodeInput, key: string, startAt?: number) => {
      setImportingId(key);
      setError(null);
      try {
        const localId = await invoke<string>('podcast_import_cloud_episode', { episode: input });
        await loadEpisodeById(localId);
        navigate(
          startAt != null && startAt > 0
            ? `/podcast/player/${localId}?t=${Math.floor(startAt)}`
            : `/podcast/player/${localId}`,
        );
      } catch (e) {
        setError(String(e));
      } finally {
        setImportingId(null);
      }
    },
    [loadEpisodeById, navigate],
  );

  /** Level-browse card → player. Already carries the full v2 difficulty payload. */
  const playEpisodeByLevel = useCallback(
    (ep: EpisodeByLevel) =>
      importAndPlay(
        {
          remote_feed_id: ep.feed_id,
          podcast_title: ep.podcast_title,
          podcast_author: ep.podcast_author,
          podcast_image_url: ep.image_url,
          podcast_language: ep.difficulty_lang,
          video_id: ep.video_id,
          curated_episode_id: curatedIdOrNull(ep.id),
          title: ep.title,
          description: ep.description,
          audio_url: ep.audio_url ?? '',
          duration_seconds: ep.duration_seconds,
          published_at: ep.publish_date,
          image_url: ep.image_url,
          difficulty_band: ep.difficulty_band,
          difficulty_score: ep.difficulty_score,
          difficulty_range_low: ep.difficulty_range_low,
          difficulty_range_high: ep.difficulty_range_high,
          difficulty_confidence: ep.difficulty_confidence,
          difficulty_lang: ep.difficulty_lang,
          speech_rate_wpm: ep.speech_rate_wpm,
        },
        ep.id,
      ),
    [importAndPlay],
  );

  /**
   * Curated rows ("Hot this week", "Just analyzed", the detail page) sometimes
   * arrive without difficulty fields, and never carry `podcast_language` — which
   * is what drives both Whisper's source language and word translation. When the
   * episode has a `video_id` we can fill both gaps from `get-episode`.
   */
  const playCuratedEpisode = useCallback(
    async (ep: CuratedEpisodeLite, startAt?: number) => {
      let language: string | null = null;
      let metaCuratedId: string | null = null;
      let difficulty: Partial<CloudEpisodeInput> = {
        difficulty_band: ep.difficulty_band ?? null,
        difficulty_score: ep.difficulty_score ?? null,
        difficulty_range_low: ep.difficulty_range_low ?? null,
        difficulty_range_high: ep.difficulty_range_high ?? null,
        difficulty_confidence: ep.difficulty_confidence ?? null,
        difficulty_lang: ep.difficulty_lang ?? null,
        speech_rate_wpm: ep.speech_rate_wpm,
      };

      if (ep.video_id) {
        try {
          const { episode: meta } = await getEpisodeMetadata(ep.video_id);
          language = meta.podcast_language;
          metaCuratedId = meta.curated_episode_id ?? null;
          difficulty = {
            difficulty_band: meta.difficulty_band,
            difficulty_score: meta.difficulty_score,
            difficulty_range_low: meta.difficulty_range_low,
            difficulty_range_high: meta.difficulty_range_high,
            difficulty_confidence: meta.difficulty_confidence,
            difficulty_lang: meta.difficulty_lang,
            speech_rate_wpm: meta.speech_rate_wpm,
          };
        } catch {
          // Metadata is an enrichment — never block playback on it.
        }
      }

      return importAndPlay(
        {
          remote_feed_id: ep.feed_id,
          podcast_title: ep.podcast_title ?? null,
          podcast_image_url: ep.podcast_image ?? ep.image_url,
          podcast_language: language,
          video_id: ep.video_id,
          curated_episode_id: curatedIdOrNull(ep.id) ?? curatedIdOrNull(metaCuratedId ?? ''),
          title: ep.title,
          description: ep.description ?? null,
          audio_url: ep.audio_url ?? '',
          duration_seconds: ep.duration_seconds,
          published_at: ep.publish_date,
          image_url: ep.image_url,
          ...difficulty,
        },
        ep.id,
        startAt,
      );
    },
    [importAndPlay],
  );

  /** A saved episode from the account (no curated id in the row: `get-episode` fills it in). */
  const playFavoriteEpisode = useCallback(
    (f: FavoriteEpisode) =>
      playCuratedEpisode({
        id: '',
        episode_id: 0,
        feed_id: f.feedId ?? 0,
        title: f.title ?? '',
        audio_url: f.audioUrl,
        image_url: f.imageUrl,
        publish_date: f.publishDate,
        duration_seconds: f.durationSeconds,
        learning_score: f.learningScore,
        cefr_level: (f.cefrLevel as CuratedEpisodeLite['cefr_level']) ?? null,
        speech_rate_wpm: null,
        status: f.status ?? 'ready',
        video_id: f.videoId,
        podcast_title: f.podcastTitle ?? undefined,
      }),
    [playCuratedEpisode],
  );

  /** An episode already in the local database (saved or in progress here): open its player. */
  const openLocalEpisode = useCallback(
    async (localId: string, startAt?: number) => {
      setImportingId(localId);
      setError(null);
      try {
        const ep = await loadEpisodeById(localId);
        if (!ep) throw new Error('EPISODE_NOT_FOUND');
        navigate(
          startAt != null && startAt > 0
            ? `/podcast/player/${localId}?resume=${Math.floor(startAt)}`
            : `/podcast/player/${localId}`,
        );
      } catch (e) {
        setError(String(e));
      } finally {
        setImportingId(null);
      }
    },
    [loadEpisodeById, navigate],
  );

  /** A semantic-search hit (optionally at the second its moment starts) -> player. */
  const playSemanticHit = useCallback(
    (hit: SemanticHit, startAt?: number) => {
      const ep = hit.episode;
      if (!ep?.feed_id || !ep.video_id || !ep.audio_url) return Promise.resolve();
      return importAndPlay(
        {
          remote_feed_id: ep.feed_id,
          podcast_title: ep.podcast_title,
          podcast_image_url: ep.image_url,
          podcast_language: hit.language,
          video_id: ep.video_id,
          curated_episode_id: curatedIdOrNull(hit.content_id),
          title: hit.title ?? '',
          description: null,
          audio_url: ep.audio_url,
          duration_seconds: ep.duration_seconds,
          published_at: ep.publish_date,
          image_url: ep.image_url,
          difficulty_band: hit.difficulty_band ?? null,
        },
        hit.content_id,
        startAt,
      );
    },
    [importAndPlay],
  );

  /** A history row from the account: resumes at the second it stopped (`?resume=`). */
  const resumeHistoryEpisode = useCallback(
    (h: HistoryEpisode) =>
      playCuratedEpisode(
        {
          id: h.id,
          episode_id: h.episode_id,
          feed_id: h.feed_id,
          title: h.title,
          audio_url: h.audio_url,
          image_url: h.image_url,
          publish_date: null,
          duration_seconds: h.duration_seconds,
          learning_score: null,
          cefr_level: (h.cefr_level as CuratedEpisodeLite['cefr_level']) ?? null,
          speech_rate_wpm: null,
          status: h.status,
          video_id: h.video_id,
          podcast_title: h.podcast_title ?? undefined,
          podcast_image: h.podcast_image ?? undefined,
        },
        h.is_completed ? undefined : h.listen_progress_seconds,
      ),
    [playCuratedEpisode],
  );

  return {
    importAndPlay,
    playEpisodeByLevel,
    playCuratedEpisode,
    playSemanticHit,
    playFavoriteEpisode,
    openLocalEpisode,
    resumeHistoryEpisode,
    importingId,
    error,
  };
}
