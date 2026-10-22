// Pure helpers behind the catalogue: the filter state <-> URL contract, channel search, labels and
// the "up next" choice. No React, no I/O — everything here is unit-tested.

import { VALID_CEFR, type CefrLabel, type VideoChannel, type VideoSummary } from './videosApi';

export type VideoViewKey = 'newest' | 'shortest' | 'longest';
export const VIDEO_VIEW_KEYS: VideoViewKey[] = ['newest', 'shortest', 'longest'];
export const DEFAULT_VIDEO_VIEW: VideoViewKey = 'newest';
/** Rows of 6 on xl — 24 keeps every breakpoint's grid flush. */
export const VIDEO_PAGE_SIZE = 24;
/** Same ceilings the podcast bar offers. */
export const DURATION_CEILINGS = [10, 20, 30, 60] as const;
/** A language with fewer videos than this is noise in the menu (one stray upload). */
export const MIN_VIDEOS_PER_LANGUAGE = 5;
/** Matching channels shown above the search results before "See all". */
export const SEARCH_CHANNEL_SHELF = 6;

export function parseCefr(v: string | null | undefined): CefrLabel | undefined {
  return v && (VALID_CEFR as string[]).includes(v) ? (v as CefrLabel) : undefined;
}

export interface CatalogState {
  q: string;
  cefr?: CefrLabel;
  topic?: string;
  duration?: number;
  language?: string;
  category?: string;
  view: VideoViewKey;
  page: number;
}

/** Every filter starts FROM the URL, so a refresh or a back from a video opens the same list. */
export function parseCatalogState(sp: URLSearchParams): CatalogState {
  const dur = parseInt(sp.get('duration') ?? '', 10);
  const view = sp.get('view');
  const page = parseInt(sp.get('page') ?? '1', 10);
  return {
    q: sp.get('q') ?? '',
    cefr: parseCefr(sp.get('cefr')),
    topic: sp.get('topic') || undefined,
    duration: (DURATION_CEILINGS as readonly number[]).includes(dur) ? dur : undefined,
    language: sp.get('language') || undefined,
    category: sp.get('category') || undefined,
    view: VIDEO_VIEW_KEYS.includes(view as VideoViewKey)
      ? (view as VideoViewKey)
      : DEFAULT_VIDEO_VIEW,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/**
 * Mirrors the state back into the URL, exactly as the website does: the untouched hub stays a bare
 * URL; once anything is chosen the page is always written (page=1 included); a search replaces the
 * view, so `view` is dropped while `q` is set.
 */
export function serializeCatalogState(s: CatalogState): URLSearchParams {
  const params = new URLSearchParams();
  const any = () => params.toString() !== '';
  if (s.cefr) params.set('cefr', s.cefr);
  if (s.topic) params.set('topic', s.topic);
  if (s.language) params.set('language', s.language);
  if (s.category) params.set('category', s.category);
  if (s.duration) params.set('duration', String(s.duration));
  if (s.q) params.set('q', s.q);
  else if (any() || s.view !== DEFAULT_VIDEO_VIEW || s.page > 1) params.set('view', s.view);
  if (any() || s.page > 1) params.set('page', String(s.page));
  return params;
}

/** Music is invisible to the anon role; asking for it signed-out is a sign-in card, not an empty grid. */
export function isMusicLocked(
  category: string | undefined,
  signedIn: boolean,
  authLoading: boolean,
): boolean {
  return category === 'music' && !authLoading && !signedIn;
}

/** "Pinned" leads the hub only while no other filter is a question it may not answer. */
export function shouldLeadWithPinned(
  s: Pick<CatalogState, 'cefr' | 'topic' | 'duration' | 'category'>,
): boolean {
  return !s.cefr && !s.topic && !s.duration && !s.category;
}

/** The server's one-list-at-a-time pager. */
export function totalPages(total: number, pageSize = VIDEO_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Case, accents, spaces and punctuation dropped: "inner french" finds innerFrench. */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The channels whose name or handle contains the query, those that START with it first. */
export function matchChannels(channels: VideoChannel[], query: string): VideoChannel[] {
  const q = fold(query);
  if (!q) return [];
  const leading: VideoChannel[] = [];
  const inner: VideoChannel[] = [];
  for (const c of channels) {
    const name = fold(c.name);
    const handle = fold(c.id);
    if (name.startsWith(q) || handle.startsWith(q)) leading.push(c);
    else if (name.includes(q) || handle.includes(q)) inner.push(c);
  }
  return [...leading, ...inner];
}

/** The language's own name for itself — "Français", "English". */
export function nativeLanguageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    /* unknown code */
  }
  return code.toUpperCase();
}

export function durationLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function youtubeChannelUrl(channelId: string): string {
  return `https://www.youtube.com/${channelId.startsWith('UC') ? `channel/${channelId}` : `@${channelId}`}`;
}

/** Tauri cannot render YouTube's own Subscribe button, so this opens the same subscribe prompt. */
export function youtubeSubscribeUrl(youtubeChannelId: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(youtubeChannelId)}?sub_confirmation=1`;
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
}

// ── Up next ─────────────────────────────────────────────────────────────────

export const UP_NEXT_LIMIT = 12;
/** More from the same channel first, but never the whole list — the rest is same language and level. */
export const UP_NEXT_CHANNEL_SHARE = 6;

/** Query args for the two lists the end-of-video overlay draws from. */
export function upNextQueries(video: VideoSummary) {
  return {
    channel: video.channel_id
      ? ({ channel: video.channel_id, limit: UP_NEXT_CHANNEL_SHARE + 1 } as const)
      : null,
    level: {
      language: video.language,
      levels: video.cefr_level ? [video.cefr_level] : undefined,
      // Music stays with music, everything else with everything else.
      category: video.category === 'music' ? 'music' : undefined,
      limit: UP_NEXT_LIMIT + UP_NEXT_CHANNEL_SHARE + 1,
    },
  };
}

/** Same channel first (up to 6), then same language and level; never the video itself, never a repeat. */
export function pickUpNext(
  video: Pick<VideoSummary, 'id'>,
  channelItems: VideoSummary[] | undefined,
  levelItems: VideoSummary[] | undefined,
): VideoSummary[] {
  const seen = new Set<string>([video.id]);
  const pick = (items: VideoSummary[] | undefined, max: number) => {
    const out: VideoSummary[] = [];
    for (const item of items ?? []) {
      if (out.length >= max) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  };
  const fromChannel = pick(channelItems, UP_NEXT_CHANNEL_SHARE);
  const fromLevel = pick(levelItems, UP_NEXT_LIMIT - fromChannel.length);
  return [...fromChannel, ...fromLevel];
}
