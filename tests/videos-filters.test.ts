import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_VIEW,
  UP_NEXT_CHANNEL_SHARE,
  UP_NEXT_LIMIT,
  isMusicLocked,
  matchChannels,
  parseCatalogState,
  pickUpNext,
  serializeCatalogState,
  shouldLeadWithPinned,
  totalPages,
  upNextQueries,
  youtubeSubscribeUrl,
  type CatalogState,
} from '@/pages/videos/lib/videoFilters';
import { buildChannelsQuery, buildFiltersQuery, buildListQuery, isLoginRequired, type VideoChannel, type VideoSummary } from '@/pages/videos/lib/videosApi';
import { rememberVideoList, videoListHref } from '@/pages/videos/lib/listMemory';

const base: CatalogState = { q: '', view: DEFAULT_VIDEO_VIEW, page: 1 };
const url = (s: CatalogState) => serializeCatalogState(s).toString();
const parse = (qs: string) => parseCatalogState(new URLSearchParams(qs));

describe('catalogue filter state <-> URL', () => {
  it('keeps the untouched hub a bare URL', () => {
    expect(url(base)).toBe('');
    expect(parse('')).toEqual({ q: '', cefr: undefined, topic: undefined, duration: undefined, language: undefined, category: undefined, view: 'newest', page: 1 });
  });

  it('writes the page and the view as soon as anything is chosen (page=1 included)', () => {
    expect(url({ ...base, cefr: 'B1' })).toBe('cefr=B1&view=newest&page=1');
    expect(url({ ...base, view: 'shortest' })).toBe('view=shortest&page=1');
    expect(url({ ...base, page: 3 })).toBe('view=newest&page=3');
  });

  it('a search replaces the view: no view while q is set', () => {
    const qs = url({ ...base, q: 'inner french', cefr: 'A2', view: 'longest', page: 2 });
    expect(new URLSearchParams(qs).has('view')).toBe(false);
    expect(parse(qs)).toMatchObject({ q: 'inner french', cefr: 'A2', page: 2 });
  });

  it('round-trips every filter', () => {
    const s: CatalogState = { q: '', cefr: 'C1', topic: 'travel', duration: 20, language: 'fr', category: 'learning', view: 'longest', page: 4 };
    expect(parse(url(s))).toEqual(s);
  });

  it('ignores junk in the URL', () => {
    expect(parse('cefr=Z9&duration=7&view=oldest&page=-2')).toMatchObject({ cefr: undefined, duration: undefined, view: 'newest', page: 1 });
    expect(parse('page=abc').page).toBe(1);
  });

  it('leads with the pinned video only while no other filter is set', () => {
    expect(shouldLeadWithPinned({})).toBe(true);
    expect(shouldLeadWithPinned({ cefr: 'B1' })).toBe(false);
    expect(shouldLeadWithPinned({ topic: 'x' })).toBe(false);
    expect(shouldLeadWithPinned({ category: 'music' })).toBe(false);
    expect(shouldLeadWithPinned({ duration: 10 })).toBe(false);
  });

  it('counts pages from the total, never fewer than one', () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(24)).toBe(1);
    expect(totalPages(25)).toBe(2);
  });
});

describe('the API queries', () => {
  it('builds the list query the backend filters on', () => {
    const qs = new URLSearchParams(
      buildListQuery({ language: 'fr', levels: ['B1', 'B2'], q: 'x', tag: 't', channel: 'c', category: 'learning', sort: 'shortest', maxDuration: 10, limit: 24, offset: 48, pinned: true }),
    );
    expect(Object.fromEntries(qs)).toEqual({ action: 'list', language: 'fr', level: 'B1,B2', q: 'x', tag: 't', channel: 'c', category: 'learning', sort: 'shortest', max_duration: '10', limit: '24', offset: '48', pinned: '1' });
    expect(buildListQuery({})).toBe('action=list');
  });

  it('the filter counts use the list parameters under action=filters', () => {
    const qs = new URLSearchParams(buildFiltersQuery({ levels: ['A1'], language: 'en' }));
    expect(qs.get('action')).toBe('filters');
    expect(qs.get('level')).toBe('A1');
    expect(buildChannelsQuery({ language: 'fr', pinned: true })).toBe('action=channels&language=fr&pinned=1');
  });

  it('reads VIDEO_LOGIN_REQUIRED out of the cloud error', () => {
    expect(isLoginRequired('{"status":401,"error":"VIDEO_LOGIN_REQUIRED","code":"VIDEO_LOGIN_REQUIRED"}')).toBe(true);
    expect(isLoginRequired({ status: 401, code: 'VIDEO_LOGIN_REQUIRED' })).toBe(true);
    expect(isLoginRequired('{"status":404,"error":"NOT_FOUND"}')).toBe(false);
  });

  it('subscribe opens the channel with the subscribe prompt', () => {
    expect(youtubeSubscribeUrl('UC123')).toBe('https://www.youtube.com/channel/UC123?sub_confirmation=1');
  });
});

describe('music gate', () => {
  it('shows the sign-in card for music only when signed out and the session is known', () => {
    expect(isMusicLocked('music', false, false)).toBe(true);
    expect(isMusicLocked('music', true, false)).toBe(false);
    expect(isMusicLocked('music', false, true)).toBe(false); // still finding out who is signed in
    expect(isMusicLocked('learning', false, false)).toBe(false);
    expect(isMusicLocked(undefined, false, false)).toBe(false);
  });
});

const ch = (id: string, name: string, levels: Record<string, number> = {}): VideoChannel => ({ id, name, language: 'fr', videos: 3, levels, dominant_level: null, cover: null });

describe('channel search', () => {
  const list = [ch('innerFrench', 'Inner French'), ch('fluidite', 'Français avec Fluidité'), ch('xFrenchX', 'Learn Francais')];
  it('ignores case, accents, spaces and punctuation', () => {
    expect(matchChannels(list, 'inner french').map((c) => c.id)).toEqual(['innerFrench']);
    expect(matchChannels(list, 'francais').map((c) => c.id)).toEqual(['fluidite', 'xFrenchX']);
  });
  it('puts channels that START with the query first', () => {
    expect(matchChannels(list, 'fr').map((c) => c.id)).toEqual(['fluidite', 'innerFrench', 'xFrenchX']);
  });
  it('an empty query matches nothing', () => {
    expect(matchChannels(list, '  ')).toEqual([]);
  });
});

const vid = (id: string, over: Partial<VideoSummary> = {}): VideoSummary => ({
  id, youtube_id: `yt${id}`, title: `Video ${id}`, language: 'fr', duration_sec: 300, cefr_level: 'B1', topic_tags: [], channel: 'C', channel_id: 'c', category: 'learning', thumbnail: '', ...over,
});

describe('up next', () => {
  it('takes the same channel first, then language + level, never the video itself nor a repeat', () => {
    const channel = ['1', '2', '3', '4', '5', '6', '7', '8'].map((i) => vid(i));
    const level = ['3', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'].map((i) => vid(i));
    const out = pickUpNext({ id: '1' }, channel, level).map((v) => v.id);
    expect(out.slice(0, UP_NEXT_CHANNEL_SHARE)).toEqual(['2', '3', '4', '5', '6', '7']);
    expect(out).not.toContain('1');
    expect(new Set(out).size).toBe(out.length);
    expect(out.length).toBe(UP_NEXT_LIMIT);
    expect(out[UP_NEXT_CHANNEL_SHARE]).toBe('9'); // '3' was already taken from the channel
  });

  it('copes with empty lists', () => {
    expect(pickUpNext({ id: '1' }, undefined, undefined)).toEqual([]);
  });

  it('keeps music with music and asks for the video\'s own level', () => {
    expect(upNextQueries(vid('1', { category: 'music' })).level).toMatchObject({ language: 'fr', levels: ['B1'], category: 'music' });
    expect(upNextQueries(vid('1')).level.category).toBeUndefined();
    expect(upNextQueries(vid('1', { channel_id: null })).channel).toBeNull();
  });
});

describe('Back returns to the same filtered list', () => {
  beforeEach(() => sessionStorage.clear());

  it('remembers the catalogue with its filters', () => {
    rememberVideoList('/videos?cefr=B1&view=newest&page=2');
    expect(videoListHref()).toBe('/videos?cefr=B1&view=newest&page=2');
  });
  it('remembers a channel page and the channel list', () => {
    rememberVideoList('/videos/channel/innerFrench?cefr=A2');
    expect(videoListHref()).toBe('/videos/channel/innerFrench?cefr=A2');
    rememberVideoList('/videos/channels');
    expect(videoListHref()).toBe('/videos/channels');
  });
  it('falls back to the catalogue for nothing, a watch page or a foreign path', () => {
    expect(videoListHref()).toBe('/videos');
    rememberVideoList('/videos/watch/abc');
    expect(videoListHref()).toBe('/videos');
    rememberVideoList('/podcast');
    expect(videoListHref()).toBe('/videos');
    rememberVideoList('/videosX');
    expect(videoListHref()).toBe('/videos');
  });
});
