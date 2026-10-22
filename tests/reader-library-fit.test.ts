import { describe, expect, it } from 'vitest';
import {
  dominantLevel,
  episodePlace,
  joinList,
  openingSeason,
  seasonName,
  seriesFit,
  seriesTile,
} from '@/pages/reader/library/series-fit';
import { EMPTY_PROGRESS } from '@/pages/reader/library/series-progress';
import type { CefrLevel, LibraryBook, LibrarySeriesCard } from '@/pages/reader/services/libraryService';

const ep = (order: number, level: CefrLevel, words = 1500) => ({
  series_order: order,
  level,
  word_count: words,
});

describe('the series fit card', () => {
  const seasons = [
    { number: 1, requires_login: false, episodes: [ep(1, 'B1'), ep(2, 'B1', 1700), ep(3, 'B1')] },
    { number: 2, requires_login: true, episodes: [ep(4, 'B2', 1300), ep(5, 'B1')] },
  ];

  it('splits the episodes across levels, easiest first, and names the main one', () => {
    const fit = seriesFit(seasons);
    expect(fit.shares).toEqual([
      { level: 'B1', value: 4 },
      { level: 'B2', value: 1 },
    ]);
    expect(fit.top).toEqual({ level: 'B1', percent: 80 });
    expect(fit.lowest).toBe('B1');
    expect(fit.highest).toBe('B2');
  });

  it('averages the reading time of one episode', () => {
    // 15 + 17 + 15 + 13 + 15 minutes at 100 words a minute.
    expect(seriesFit(seasons).avgMinutes).toBe(15);
  });

  it('says which seasons are free and whether any needs an account', () => {
    expect(seriesFit(seasons)).toMatchObject({ freeSeasons: [1], anyLogin: true });
    expect(seriesFit([seasons[0]])).toMatchObject({ freeSeasons: [1], anyLogin: false });
  });

  it('has nothing to say about a series without episodes', () => {
    expect(seriesFit([{ number: 1, requires_login: false, episodes: [] }])).toMatchObject({
      shares: null,
      top: null,
      lowest: null,
      highest: null,
      avgMinutes: null,
    });
  });

  it('a tie goes to the easier level', () => {
    expect(dominantLevel(['B2', 'A2', 'B2', 'A2'])).toBe('A2');
    expect(dominantLevel([])).toBeNull();
  });

  it('lists the free seasons in the reader’s language', () => {
    expect(joinList(['1', '2', '3'], 'en')).toBe('1, 2, and 3');
    expect(joinList(['1'], 'fr')).toBe('1');
  });
});

describe('the season tab a series page opens on', () => {
  const seasons = [
    { number: 1, episodes: [{ series_order: 1 }, { series_order: 2 }] },
    { number: 2, episodes: [{ series_order: 3 }, { series_order: 4 }] },
  ];
  const progress = (last: number, finished: number[] = []) => ({
    opened: new Set([last, ...finished]),
    finished: new Set(finished),
    last,
  });

  it('nothing read yet: the first season', () => {
    expect(openingSeason(seasons, EMPTY_PROGRESS)).toBe(1);
  });

  it('a returning reader: the season of the episode they carry on with', () => {
    expect(openingSeason(seasons, progress(3))).toBe(2);
    // The last of season 1 was finished: the next one is in season 2.
    expect(openingSeason(seasons, progress(2, [2]))).toBe(2);
    expect(openingSeason(seasons, progress(1, [1]))).toBe(1);
  });

  it('the whole series read: back to the first season', () => {
    expect(openingSeason(seasons, progress(4, [1, 2, 3, 4]))).toBe(1);
  });
});

describe('season names on the tabs', () => {
  it('drops the "Season n:" lead-in the tab already says', () => {
    expect(seasonName('Season 1: Room 4')).toBe('Room 4');
    expect(seasonName('Saison 2 — La relève')).toBe('La relève');
    expect(seasonName('The Last Class')).toBe('The Last Class');
    expect(seasonName(null)).toBeNull();
  });
});

describe('a series tile', () => {
  const card: LibrarySeriesCard = {
    slug: 'night',
    language: 'en',
    title: 'The Night Shift',
    summary: '',
    cover_path: null,
    episode_count: 3,
    season_count: 1,
    levels: ['A2'],
  };
  const book = (over: Partial<LibraryBook>): LibraryBook => ({
    id: 'x', slug: 'x', language: 'en', title: 'X', author: 'FlexiLingo', kind: 'original', level: 'A2',
    summary: '', series_slug: 'night', series_title: 'The Night Shift', series_order: 1, tags: [],
    cover_path: null, word_count: 800, page_count: 2, license: 'own', source_url: null,
    attribution: null, published_at: null, updated_at: '2026-01-01', ...over,
  });

  it("uses the series' own cover first", () => {
    expect(seriesTile({ ...card, cover_path: '/c/night.jpg' }, [book({})]).cover).toBe('/c/night.jpg');
  });

  it('else the first episode with artwork, else the first episode’s generated cover', () => {
    const books = [
      book({ id: 'b2', slug: 'night-02', series_order: 2, cover_path: '/c/2.jpg', level: 'B1' }),
      book({ id: 'b1', slug: 'night-01', series_order: 1, level: 'B1' }),
      book({ id: 'b3', slug: 'night-03', series_order: 3 }),
    ];
    expect(seriesTile(card, books)).toEqual({ cover: '/c/2.jpg', level: 'B1' });
    expect(seriesTile(card, [books[1]]).cover).toBe('/library/covers/en/night-01.v2.jpg');
  });

  it('no cover and no episode on the shelf: nothing to show', () => {
    expect(seriesTile(card, [])).toEqual({ cover: null, level: 'A2' });
    // Another language's series with the same slug is not this one.
    expect(seriesTile(card, [book({ language: 'fr' })]).cover).toBeNull();
  });
});

describe('where an episode sits', () => {
  const series = [
    { id: 'a', series_order: 1, series_season: 1, series_episode: 1 },
    { id: 'b', series_order: 2, series_season: 1, series_episode: 2 },
    { id: 'c', series_order: 3, series_season: 2, series_episode: 1 },
  ];

  it('within its season when the series has seasons', () => {
    expect(episodePlace(series, 'c')).toEqual({ n: 1, total: 1, season: 2 });
    expect(episodePlace(series, 'b')).toEqual({ n: 2, total: 2, season: 1 });
  });

  it('within the whole series when it has none', () => {
    const flat = series.slice(0, 2).map(({ id, series_order }) => ({ id, series_order }));
    expect(episodePlace(flat, 'b')).toEqual({ n: 2, total: 2, season: null });
    expect(episodePlace(flat, 'zz')).toBeNull();
  });
});
