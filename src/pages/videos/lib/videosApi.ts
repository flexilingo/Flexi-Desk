// The video catalogue — one typed wrapper per `/videos?action=…` Edge Function call.
// Mirrors flexi-lingo-front `store/videosApi.ts` + `store/videoListQuery.ts`. Everything goes
// through supabaseCall() (never fetch() from JS). The video plays in YouTube's own iframe; the
// transcript is ours (CEFR-scored words) and renders in the shared subtitle bar.

import { supabaseCall } from '@/lib/supabase';

export type CefrLabel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const VALID_CEFR: CefrLabel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface VideoSummary {
  id: string;
  youtube_id: string;
  title: string;
  language: string;
  duration_sec: number | null;
  cefr_level: CefrLabel | null;
  topic_tags: string[];
  channel: string | null;
  /** Channel handle — the key the channel pages use. */
  channel_id: string | null;
  /** learning | stories | music | … — music only ever reaches signed-in users. */
  category: string | null;
  thumbnail: string;
  pinned?: boolean;
}

export interface VideoChannel {
  id: string;
  name: string;
  language: string;
  videos: number;
  levels: Record<string, number>;
  dominant_level: CefrLabel | null;
  cover: string | null;
  pinned?: boolean;
  /** The channel's YouTube id (UC…), for the Subscribe button. Null when we do not follow it. */
  youtube_channel_id?: string | null;
}

export interface VideoChannelsResponse {
  channels: VideoChannel[];
  total: number;
}

export interface VideoTranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: { word: string; idx: number; hard?: boolean }[];
}

export interface VideoListResponse {
  items: VideoSummary[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface VideoDetailResponse {
  video: VideoSummary & { channel_youtube_id?: string | null };
  transcript: { segments: VideoTranscriptSegment[]; source: string | null } | null;
}

/** Faceted counts: each menu counts under every OTHER filter passed in. */
export interface VideoFiltersResponse {
  categories: { category: string; count: number; locked: boolean }[];
  languages: { code: string; count: number; catalogue_count?: number }[];
  levels: { level: CefrLabel; count: number }[];
  tags: { tag: string; count: number }[];
  total: number;
}

export interface VideoListArgs {
  language?: string;
  levels?: CefrLabel[];
  q?: string;
  tag?: string;
  sort?: 'newest' | 'shortest' | 'longest';
  channel?: string;
  category?: string;
  /** Ceiling on video length, in MINUTES. */
  maxDuration?: number;
  limit?: number;
  offset?: number;
  /** Lead with the video pinned for this language (server honours it only with no other filter). */
  pinned?: boolean;
}

export interface VideoChannelsArgs {
  language?: string;
  pinned?: boolean;
}

export type VideoFilterArgs = Pick<
  VideoListArgs,
  'language' | 'levels' | 'q' | 'tag' | 'category' | 'maxDuration'
>;

export function buildListQuery(args: VideoListArgs): string {
  const p = new URLSearchParams({ action: 'list' });
  if (args.language) p.set('language', args.language);
  if (args.levels?.length) p.set('level', args.levels.join(','));
  if (args.q) p.set('q', args.q);
  if (args.tag) p.set('tag', args.tag);
  if (args.channel) p.set('channel', args.channel);
  if (args.category) p.set('category', args.category);
  if (args.sort) p.set('sort', args.sort);
  if (args.maxDuration != null) p.set('max_duration', String(args.maxDuration));
  if (args.limit != null) p.set('limit', String(args.limit));
  if (args.offset != null) p.set('offset', String(args.offset));
  if (args.pinned) p.set('pinned', '1');
  return p.toString();
}

export function buildChannelsQuery(args: VideoChannelsArgs = {}): string {
  const p = new URLSearchParams({ action: 'channels' });
  if (args.language) p.set('language', args.language);
  if (args.pinned) p.set('pinned', '1');
  return p.toString();
}

export function buildFiltersQuery(args: VideoFilterArgs = {}): string {
  const p = new URLSearchParams(buildListQuery(args));
  p.set('action', 'filters');
  return p.toString();
}

export const getVideos = (args: VideoListArgs) =>
  supabaseCall<VideoListResponse>('GET', `/videos?${buildListQuery(args)}`);

export const getVideo = (id: string) =>
  supabaseCall<VideoDetailResponse>('GET', `/videos?action=get&id=${encodeURIComponent(id)}`);

export const getVideoChannels = (args: VideoChannelsArgs = {}) =>
  supabaseCall<VideoChannelsResponse>('GET', `/videos?${buildChannelsQuery(args)}`);

export const getVideoFilters = (args: VideoFilterArgs = {}) =>
  supabaseCall<VideoFiltersResponse>('GET', `/videos?${buildFiltersQuery(args)}`);

/** Our catalogue copy of a YouTube video — `{ video: null }` when we do not have it. */
export const getVideoByYoutubeId = (youtubeId: string) =>
  supabaseCall<{ video: { id: string; title: string } | null }>(
    'GET',
    `/videos?action=by-youtube&youtube_id=${encodeURIComponent(youtubeId)}`,
  );

/** The backend answers 401 VIDEO_LOGIN_REQUIRED for a music video asked for signed-out. */
export function isLoginRequired(err: unknown): boolean {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : JSON.stringify(err ?? '');
  return raw.includes('VIDEO_LOGIN_REQUIRED');
}
