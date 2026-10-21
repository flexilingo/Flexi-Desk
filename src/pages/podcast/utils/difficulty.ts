import type { CefrLevel, CuratedEpisodeLite, PodcastEpisode, PodcastFeed } from '../types';

/**
 * The spoken language of an episode's audio, used for BOTH Whisper transcription
 * and word translation.
 *
 * `transcriptLang` — the language the on-screen transcript was actually made in,
 * stamped at transcription/fetch time — is authoritative. Then the episode's
 * cloud-detected `difficultyLang`, then the feed's declared `language`, which RSS
 * publishers routinely get wrong (and which desk stores as 'en' when the RSS has
 * no language tag at all — the bug that sent en→fa translation requests for
 * French words). Mirrors `episode_analysis_lang` in Rust — keep the two in step.
 */
export function episodeSourceLang(
  episode?: PodcastEpisode | null,
  feed?: PodcastFeed | null,
): string {
  return episode?.transcriptLang || episode?.difficultyLang || feed?.language || 'en';
}

/**
 * Which difficulty numbers to trust for an episode.
 *
 * The v2 model scores each episode individually (`difficulty_band` + a 0–100
 * `difficulty_score`), but the scorer reports its own `difficulty_confidence`.
 * Below `high`, the band is a guess, so we fall back to the v1 feed-level CEFR
 * and learning score rather than showing a confident-looking wrong number.
 */
export function episodeDifficulty(ep: CuratedEpisodeLite): {
  level: CefrLevel | null;
  score: number | null;
} {
  const hasV2 = !!ep.difficulty_band && ep.difficulty_confidence === 'high';
  return hasV2
    ? { level: ep.difficulty_band ?? null, score: ep.difficulty_score ?? null }
    : { level: ep.cefr_level, score: ep.learning_score };
}
