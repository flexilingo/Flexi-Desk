import { describe, expect, it } from 'vitest';
import {
  DURATION_MAX_MINUTES,
  applyReading,
  hasActiveFilter,
  parseHubParams,
  serializeHubParams,
  type HubParams,
} from '@/pages/podcast/utils/hubParams';
import {
  MIN_SEMANTIC_SIMILARITY,
  keepSemanticHits,
  laneOrder,
  planSearchLanes,
  stamp,
} from '@/pages/podcast/utils/semantic';
import { exactTitleFirst } from '@/pages/podcast/utils/exactTitle';
import {
  fitSpeedKey,
  isUnsupportedLanguage,
  showShares,
  topShare,
} from '@/pages/podcast/utils/levelFit';
import { isSaved, mergeFavourites, mergeHistory } from '@/pages/podcast/utils/accountMerge';
import type { PodcastReading, SemanticHit } from '@/pages/podcast/services/podcastSearch';
import type { FavoriteEpisode, HistoryEpisode } from '@/pages/podcast/services/podcastAccount';

const parse = (qs: string) => parseHubParams(new URLSearchParams(qs));
const base: HubParams = { q: '', view: 'analyzed', page: 1 };

describe('hub filters in the URL', () => {
  it('the untouched hub is a bare URL', () => {
    expect(serializeHubParams(base)).toBe('');
    expect(parse('')).toEqual(base);
  });

  it('round-trips every filter, the view and the page', () => {
    const p: HubParams = {
      q: '',
      cefr: 'B1',
      topic: 'news',
      language: 'fr',
      duration: 20,
      view: 'latest',
      page: 3,
    };
    const qs = serializeHubParams(p);
    expect(qs).toBe('cefr=B1&topic=news&language=fr&duration=20&view=latest&page=3');
    expect(parse(qs)).toEqual(p);
  });

  it('writes page=1 once anything is chosen, and the view only without a search', () => {
    expect(serializeHubParams({ ...base, cefr: 'A2' })).toBe('cefr=A2&view=analyzed&page=1');
    expect(serializeHubParams({ ...base, q: 'coffee', cefr: 'A2' })).toBe(
      'cefr=A2&q=coffee&page=1',
    );
    expect(serializeHubParams({ ...base, view: 'popular' })).toBe('view=popular&page=1');
  });

  it('drops values the hub cannot draw', () => {
    const p = parse('cefr=Z9&topic=cooking&duration=15&view=nope&page=-4');
    expect(p).toEqual(base);
  });

  it('length only counts as a filter on episode views', () => {
    expect(hasActiveFilter({ ...base, duration: 10 }, 'podcasts')).toBe(false);
    expect(hasActiveFilter({ ...base, duration: 10 }, 'latest')).toBe(true);
  });
});

describe('a typed sentence read by the shared reading', () => {
  const filters = (u: Partial<PodcastReading['understood']>): PodcastReading => ({
    as: 'filters',
    understood: { language: null, level: null, topic: null, section: null, duration: null, ...u },
    matched: [],
    unknown: [],
  });

  it('until the reading arrives, the sentence is a name', () => {
    const eff = applyReading({ ...base, q: 'hardcore history' }, undefined);
    expect(eff.searchTerm).toBe('hardcore history');
    expect(eff.described).toBe(false);
  });

  it('a described query becomes filters and stops searching titles', () => {
    const eff = applyReading(
      { ...base, q: 'beginner news in french' },
      filters({ level: 'A2', topic: 'news', language: 'fr' }),
    );
    expect(eff).toMatchObject({
      level: 'A2',
      topic: 'news',
      language: 'fr',
      searchTerm: undefined,
      described: true,
    });
  });

  it('the words beat the pills only where they spoke', () => {
    const eff = applyReading(
      { ...base, q: 'french', cefr: 'C1', language: 'en' },
      filters({ language: 'fr' }),
    );
    expect(eff.language).toBe('fr');
    expect(eff.level).toBe('C1');
  });

  it('a topic or level this build cannot draw is dropped', () => {
    const eff = applyReading({ ...base, q: 'x' }, filters({ level: 'D9', topic: 'cooking' }));
    expect(eff.level).toBeUndefined();
    expect(eff.topic).toBeUndefined();
  });

  it('a spoken length becomes the upper bound; a length alone is flagged', () => {
    const eff = applyReading({ ...base, q: 'short' }, filters({ duration: 's' }));
    expect(eff.duration).toBe(DURATION_MAX_MINUTES.s);
    expect(eff.durationOnly).toBe(true);
    expect(
      applyReading({ ...base, q: 'short', cefr: 'A1' }, filters({ duration: 's' })).durationOnly,
    ).toBe(false);
  });

  it('a browse category carries its section', () => {
    expect(applyReading({ ...base, q: 'kids' }, filters({ section: 'kids' })).section).toBe('kids');
    expect(
      applyReading({ ...base, q: 'best podcasts' }, { ...filters({}), as: 'browse' }).browsing,
    ).toBe(true);
  });
});

describe('search lanes and the semantic fallback order', () => {
  const eff = (q: string, read?: PodcastReading) => applyReading({ ...base, q }, read);

  it('every search runs episodes; a name also runs shows, PodcastIndex and semantic', () => {
    expect(planSearchLanes('coffee', eff('coffee'))).toEqual({
      episodes: true,
      podcasts: true,
      discover: true,
      semantic: true,
    });
  });

  it('no search, no lanes', () => {
    expect(planSearchLanes('  ', eff(''))).toEqual({
      episodes: false,
      podcasts: false,
      discover: false,
      semantic: false,
    });
  });

  it('a described query never searches titles on PodcastIndex', () => {
    const read: PodcastReading = {
      as: 'filters',
      understood: { language: 'fr', level: 'A2', topic: null, section: null, duration: null },
      matched: [],
      unknown: [],
    };
    const plan = planSearchLanes('beginner french', eff('beginner french', read));
    expect(plan.discover).toBe(false);
    expect(plan.podcasts).toBe(true);
    expect(plan.semantic).toBe(true);
  });

  it('semantic stays silent with a topic set, for a browse ask, a length-only ask and a category', () => {
    const mk = (u: Partial<PodcastReading['understood']>): PodcastReading => ({
      as: 'filters',
      understood: { language: null, level: null, topic: null, section: null, duration: null, ...u },
      matched: [],
      unknown: [],
    });
    expect(
      planSearchLanes('x', applyReading({ ...base, q: 'x', topic: 'news' }, undefined)).semantic,
    ).toBe(false);
    expect(planSearchLanes('x', eff('x', { ...mk({}), as: 'browse' })).semantic).toBe(false);
    expect(planSearchLanes('x', eff('x', mk({ duration: 's' }))).semantic).toBe(false);
    expect(planSearchLanes('x', eff('x', mk({ section: 'kids' }))).semantic).toBe(false);
  });

  it('lane order: an exact show only PodcastIndex has goes first', () => {
    expect(laneOrder(false)).toEqual(['podcasts', 'episodes', 'discover']);
    expect(laneOrder(true)).toEqual(['discover', 'podcasts', 'episodes']);
  });

  it('the exact-title show moves to the front of its lane', () => {
    const shows = [{ t: 'The Daily Show' }, { t: 'The Daily.' }, { t: 'Other' }];
    const r = exactTitleFirst(shows, (s) => s.t, 'the daily');
    expect(r.found).toBe(true);
    expect(r.items[0].t).toBe('The Daily.');
    expect(exactTitleFirst(shows, (s) => s.t, 'nothing').found).toBe(false);
    expect(exactTitleFirst([{ t: 'Français' }], (s) => s.t, 'francais').found).toBe(true);
  });

  it('keeps only hits above the similarity floor', () => {
    const hit = (similarity: number) => ({ similarity }) as SemanticHit;
    const kept = keepSemanticHits([hit(0.44), hit(MIN_SEMANTIC_SIMILARITY), hit(0.71)]);
    expect(kept.map((h) => h.similarity)).toEqual([MIN_SEMANTIC_SIMILARITY, 0.71]);
    expect(keepSemanticHits(undefined)).toEqual([]);
  });

  it('formats a moment timestamp', () => {
    expect(stamp(272)).toBe('4:32');
    expect(stamp(3725)).toBe('1:02:05');
  });
});

describe('show fit card helpers', () => {
  it('buckets pace', () => {
    expect(fitSpeedKey(100)).toBe('fitSpeedSlow');
    expect(fitSpeedKey(145)).toBe('fitSpeedNatural');
    expect(fitSpeedKey(180)).toBe('fitSpeedFast');
    expect(fitSpeedKey(null)).toBeNull();
  });
  it('splits episodes across levels and names the main one', () => {
    const shares = showShares(['B1', 'B1', 'A2', null, 'B1']);
    expect(shares).toEqual([
      { level: 'A2', value: 1 },
      { level: 'B1', value: 3 },
    ]);
    expect(topShare(shares)).toEqual({ level: 'B1', percent: 75 });
    expect(showShares([null])).toBeNull();
  });
  it('knows an unsupported-language failure', () => {
    expect(isUnsupportedLanguage('UNSUPPORTED_LANGUAGE:xx')).toBe(true);
    expect(isUnsupportedLanguage('timeout')).toBe(false);
  });
});

describe('account and local merge', () => {
  const h = (over: Partial<HistoryEpisode>): HistoryEpisode => ({
    id: 'h1',
    episode_id: 1,
    feed_id: 1,
    video_id: 'v1',
    title: 'Cloud title',
    audio_url: null,
    image_url: null,
    duration_seconds: 600,
    status: 'ready',
    difficulty_score: null,
    difficulty_band: null,
    cefr_level: null,
    podcast_title: 'Show',
    podcast_image: null,
    listen_progress_seconds: 100,
    is_completed: false,
    completed_at: null,
    last_played_at: '2026-10-20T10:00:00Z',
    ...over,
  });
  const local = (over = {}) => ({
    id: 'L1',
    title: 'Local',
    image_url: null,
    position_seconds: 300,
    duration_seconds: 600,
    last_played_at: '2026-10-21 09:00:00',
    ...over,
  });

  it('one row per episode: the newer side decides the resume second', () => {
    const merged = mergeHistory([h({})], [local()], { L1: 'v1' });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      source: 'both',
      progressSeconds: 300,
      localEpisodeId: 'L1',
      videoId: 'v1',
    });
  });

  it('an older local copy does not override the account', () => {
    const merged = mergeHistory([h({ last_played_at: '2026-10-22T10:00:00Z' })], [local()], {
      L1: 'v1',
    });
    expect(merged[0].progressSeconds).toBe(100);
  });

  it('keeps unrelated rows, newest first', () => {
    const merged = mergeHistory([h({})], [local({ id: 'L2' })], {});
    expect(merged.map((m) => m.source)).toEqual(['local', 'cloud']);
  });

  const fav = (over: Partial<FavoriteEpisode>): FavoriteEpisode => ({
    id: 'f1',
    videoId: 'v1',
    createdAt: '2026-10-01T00:00:00Z',
    available: true,
    podcastTitle: 'Show',
    status: 'ready',
    feedId: 1,
    title: 'Fav',
    imageUrl: null,
    audioUrl: 'a',
    durationSeconds: 60,
    publishDate: null,
    cefrLevel: null,
    difficultyBand: null,
    learningScore: null,
    ...over,
  });
  const lf = (over = {}) => ({
    localEpisodeId: 'L1',
    videoId: 'v1',
    title: 'Fav',
    showTitle: null,
    imageUrl: null,
    durationSeconds: 60,
    savedAt: Date.parse('2026-10-05T00:00:00Z'),
    ...over,
  });

  it('a saved episode on both sides shows once and is playable locally', () => {
    const merged = mergeFavourites([fav({ available: false })], [lf()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ source: 'both', available: true, localEpisodeId: 'L1' });
  });

  it('signed out: only the local saves show; cloud-only stays cloud', () => {
    expect(mergeFavourites([], [lf()])[0].source).toBe('local');
    expect(mergeFavourites([fav({})], [])[0].source).toBe('cloud');
  });

  it('knows whether an episode is saved', () => {
    const saved = mergeFavourites([fav({})], []);
    expect(isSaved(saved, { id: 'x', videoId: 'v1' })).toBe(true);
    expect(isSaved(saved, { id: 'x', videoId: 'v2' })).toBe(false);
  });
});
