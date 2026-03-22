// ── Cloud / Discovery Types ─────────────────────────────

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type TopicCategory =
  | 'education'
  | 'news'
  | 'arts'
  | 'science'
  | 'society'
  | 'technology'
  | 'storytelling'
  | 'conversation'
  | 'culture';

export interface CuratedPodcast {
  id: string;
  feed_id: number;
  title: string;
  author: string | null;
  description: string | null;
  image_url: string | null;
  rss_url: string | null;
  language: string;
  is_active: boolean;
  learning_score: number | null;
  cefr_level: CefrLevel | null;
  accent_type: string | null;
  avg_wpm: number | null;
  topic_category: TopicCategory | null;
  total_episodes: number;
  transcribed_episodes: number;
  last_rss_check_at: string | null;
  last_new_episode_at: string | null;
  created_at: string;
  website_url: string | null;
  podcast_guid: string | null;
  owner_name: string | null;
  itunes_id: number | null;
  categories: Record<string, string> | null;
  is_explicit: boolean;
  episode_count_feed: number;
}

export interface FlexiLingoInfo {
  cefr_level: string | null;
  learning_score: number | null;
  transcribed_episodes: number;
  total_episodes: number;
}

export interface PodcastIndexFeed {
  id: number;
  title: string;
  author: string;
  description: string;
  image: string;
  language: string;
  categories: Record<string, string>;
  episodeCount: number;
  newestItemPublishTime: number;
  newestItemPubdate: number;
  websiteUrl?: string;
  rssUrl?: string;
  itunesId?: number | null;
  ownerName?: string;
  isExplicit?: boolean;
  flexilingo?: FlexiLingoInfo | null;
}

export interface CuratedListResponse {
  podcasts: CuratedPodcast[];
  total: number;
  page: number;
  limit: number;
  source?: 'db' | 'podcastindex';
}

export interface SearchResponse {
  feeds: PodcastIndexFeed[];
  count: number;
}

export interface TrendingResponse {
  feeds: PodcastIndexFeed[];
  count: number;
}

export interface FollowedPodcastsResponse {
  podcasts: (CuratedPodcast & { auto_transcribe: boolean; followed_at: string })[];
}

// ── Local Types ─────────────────────────────────────────

export interface PodcastFeed {
  id: string;
  title: string;
  author?: string;
  description?: string;
  feedUrl: string;
  websiteUrl?: string;
  artworkUrl?: string;
  language: string;
  category?: string;
  episodeCount: number;
  lastRefreshed?: string;
  isSubscribed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PodcastEpisode {
  id: string;
  feedId: string;
  guid?: string;
  title: string;
  description?: string;
  audioUrl: string;
  durationSeconds: number;
  publishedAt?: string;
  fileSize?: number;
  isDownloaded: boolean;
  localPath?: string;
  playPosition: number;
  isPlayed: boolean;
  transcript?: string;
  transcriptStatus: 'none' | 'processing' | 'completed' | 'failed';
  cefrLevel?: string;
  wordCount?: number;
  createdAt: string;
}

export interface PodcastBookmark {
  id: string;
  episodeId: string;
  positionMs: number;
  label?: string;
  note?: string;
  createdAt: string;
}

export interface ITunesSearchResult {
  title: string;
  author: string;
  feedUrl: string;
  artworkUrl: string;
  genre: string;
}

// ── Raw IPC types (snake_case) ──────────────────────────

export interface RawPodcastFeed {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  feed_url: string;
  website_url: string | null;
  artwork_url: string | null;
  language: string;
  category: string | null;
  episode_count: number;
  last_refreshed: string | null;
  is_subscribed: boolean;
  created_at: string;
  updated_at: string;
}

export interface RawPodcastEpisode {
  id: string;
  feed_id: string;
  guid: string | null;
  title: string;
  description: string | null;
  audio_url: string;
  duration_seconds: number;
  published_at: string | null;
  file_size: number | null;
  is_downloaded: boolean;
  local_path: string | null;
  play_position: number;
  is_played: boolean;
  transcript: string | null;
  transcript_status: string;
  cefr_level: string | null;
  word_count: number | null;
  created_at: string;
}

export interface RawPodcastBookmark {
  id: string;
  episode_id: string;
  position_ms: number;
  label: string | null;
  note: string | null;
  created_at: string;
}

export interface RawITunesSearchResult {
  title: string;
  author: string;
  feed_url: string;
  artwork_url: string;
  genre: string;
}

// ── Mappers ─────────────────────────────────────────────

export function mapFeed(raw: RawPodcastFeed): PodcastFeed {
  return {
    id: raw.id,
    title: raw.title,
    author: raw.author ?? undefined,
    description: raw.description ?? undefined,
    feedUrl: raw.feed_url,
    websiteUrl: raw.website_url ?? undefined,
    artworkUrl: raw.artwork_url ?? undefined,
    language: raw.language,
    category: raw.category ?? undefined,
    episodeCount: raw.episode_count,
    lastRefreshed: raw.last_refreshed ?? undefined,
    isSubscribed: raw.is_subscribed,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapEpisode(raw: RawPodcastEpisode): PodcastEpisode {
  return {
    id: raw.id,
    feedId: raw.feed_id,
    guid: raw.guid ?? undefined,
    title: raw.title,
    description: raw.description ?? undefined,
    audioUrl: raw.audio_url,
    durationSeconds: raw.duration_seconds,
    publishedAt: raw.published_at ?? undefined,
    fileSize: raw.file_size ?? undefined,
    isDownloaded: raw.is_downloaded,
    localPath: raw.local_path ?? undefined,
    playPosition: raw.play_position,
    isPlayed: raw.is_played,
    transcript: raw.transcript ?? undefined,
    transcriptStatus: raw.transcript_status as PodcastEpisode['transcriptStatus'],
    cefrLevel: raw.cefr_level ?? undefined,
    wordCount: raw.word_count ?? undefined,
    createdAt: raw.created_at,
  };
}

export function mapBookmark(raw: RawPodcastBookmark): PodcastBookmark {
  return {
    id: raw.id,
    episodeId: raw.episode_id,
    positionMs: raw.position_ms,
    label: raw.label ?? undefined,
    note: raw.note ?? undefined,
    createdAt: raw.created_at,
  };
}

export function mapITunesResult(raw: RawITunesSearchResult): ITunesSearchResult {
  return { ...raw, feedUrl: raw.feed_url, artworkUrl: raw.artwork_url };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTimeMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Download Progress ──────────────────────────────────

export interface EpisodeDownloadProgress {
  episodeId: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface RawEpisodeDownloadProgress {
  episode_id: string;
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export function mapEpisodeDownloadProgress(
  raw: RawEpisodeDownloadProgress,
): EpisodeDownloadProgress {
  return {
    episodeId: raw.episode_id,
    downloadedBytes: raw.downloaded_bytes,
    totalBytes: raw.total_bytes,
    percent: raw.percent,
  };
}

// ── Transcript Segment ─────────────────────────────────

export interface PodcastWordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface PodcastTranscriptSegment {
  id: string;
  episodeId: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  language: string;
  words: PodcastWordTimestamp[];
}

export interface RawPodcastWordTimestamp {
  word: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface RawPodcastTranscriptSegment {
  id: string;
  episode_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  language: string;
  words: RawPodcastWordTimestamp[];
}

export function mapTranscriptSegment(raw: RawPodcastTranscriptSegment): PodcastTranscriptSegment {
  return {
    id: raw.id,
    episodeId: raw.episode_id,
    text: raw.text,
    startMs: raw.start_ms,
    endMs: raw.end_ms,
    confidence: raw.confidence,
    language: raw.language,
    words: (raw.words ?? []).map((w) => ({
      word: w.word,
      startMs: w.start_ms,
      endMs: w.end_ms,
      confidence: w.confidence,
    })),
  };
}

// ── Translation ─────────────────────────────────────────

export interface TranslationAlternative {
  pos: string;
  words: string[];
}

export interface TranslationResult {
  word: string;
  translation: string;
  sourceLang: string;
  targetLang: string;
  alternatives: TranslationAlternative[];
  examples: string[];
  cefrLevel: string;
}

export interface RawTranslationResult {
  word: string;
  translation: string;
  source_lang: string;
  target_lang: string;
  alternatives: { pos: string; words: string[] }[];
  examples: string[];
  cefr_level: string;
}

export function mapTranslationResult(raw: RawTranslationResult): TranslationResult {
  return {
    word: raw.word,
    translation: raw.translation,
    sourceLang: raw.source_lang,
    targetLang: raw.target_lang,
    alternatives: raw.alternatives,
    examples: raw.examples,
    cefrLevel: raw.cefr_level,
  };
}

// ── NLP Analysis ───────────────────────────────────────

export interface NlpAnalysis {
  id: string;
  episodeId: string;
  totalWords: number;
  uniqueWords: number;
  cefrLevel?: string;
  cefrDistribution?: string;
  avgSentenceLength: number;
  vocabularyRichness: number;
  topWords?: string;
  createdAt: string;
}

export interface RawNlpAnalysis {
  id: string;
  episode_id: string;
  total_words: number;
  unique_words: number;
  cefr_level: string | null;
  cefr_distribution: string | null;
  avg_sentence_length: number;
  vocabulary_richness: number;
  top_words: string | null;
  created_at: string;
}

export function mapNlpAnalysis(raw: RawNlpAnalysis): NlpAnalysis {
  return {
    id: raw.id,
    episodeId: raw.episode_id,
    totalWords: raw.total_words,
    uniqueWords: raw.unique_words,
    cefrLevel: raw.cefr_level ?? undefined,
    cefrDistribution: raw.cefr_distribution ?? undefined,
    avgSentenceLength: raw.avg_sentence_length,
    vocabularyRichness: raw.vocabulary_richness,
    topWords: raw.top_words ?? undefined,
    createdAt: raw.created_at,
  };
}

// ── Sync Points ─────────────────────────────────────────

export interface SyncPoint {
  id: number;
  episodeId: string;
  audioTime: number;
  subtitleTime: number;
}

export interface RawSyncPoint {
  id: number;
  episode_id: string;
  audio_time: number;
  subtitle_time: number;
}

export function mapSyncPoint(raw: RawSyncPoint): SyncPoint {
  return {
    id: raw.id,
    episodeId: raw.episode_id,
    audioTime: raw.audio_time,
    subtitleTime: raw.subtitle_time,
  };
}

/**
 * Interpolate effective subtitle offset from sync points.
 * Given sorted sync points and current audio time, returns
 * the offset to apply to subtitle timestamps.
 */
export function getEffectiveOffset(currentTime: number, syncPoints: SyncPoint[]): number {
  if (syncPoints.length === 0) return 0;
  if (syncPoints.length === 1) {
    return syncPoints[0].audioTime - syncPoints[0].subtitleTime;
  }

  // Before first sync point
  if (currentTime <= syncPoints[0].audioTime) {
    return syncPoints[0].audioTime - syncPoints[0].subtitleTime;
  }

  // After last sync point
  if (currentTime >= syncPoints[syncPoints.length - 1].audioTime) {
    const last = syncPoints[syncPoints.length - 1];
    return last.audioTime - last.subtitleTime;
  }

  // Interpolate between two surrounding sync points
  for (let i = 0; i < syncPoints.length - 1; i++) {
    const a = syncPoints[i];
    const b = syncPoints[i + 1];
    if (currentTime >= a.audioTime && currentTime <= b.audioTime) {
      const t = (currentTime - a.audioTime) / (b.audioTime - a.audioTime);
      const offsetA = a.audioTime - a.subtitleTime;
      const offsetB = b.audioTime - b.subtitleTime;
      return offsetA + t * (offsetB - offsetA);
    }
  }

  return 0;
}
