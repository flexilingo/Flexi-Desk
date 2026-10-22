import { describe, it, expect } from 'vitest';
import {
  buildNotesForSave,
  cardExamples,
  cloneTitle,
  copiesOf,
  decideCloneMode,
  deckSourceLang,
  deckStatus,
  exploreFacets,
  extractYouTubeId,
  filterAndSortDecks,
  filterPublicDecks,
  inAuthorOrder,
  isAIGeneratedCard,
  isDeleteConfirmed,
  listableDecks,
  masteryPercent,
  ownedMeaningLanguages,
  parseCardNotes,
  publicDeckTitle,
  shareAvailability,
  splitLanguagePair,
  streakHint,
  withoutMeaningLanguage,
  type PublicDeckSummary,
} from '@/pages/review/lib/deckLogic';
import type { DeckWithStats } from '@/pages/review/types';

const deck = (over: Partial<DeckWithStats>): DeckWithStats => ({
  id: 'd',
  name: 'Deck',
  language: 'en',
  algorithm: 'fsrs',
  cardCount: 10,
  tags: [],
  isPublic: false,
  sourcePublic: false,
  totalClones: 0,
  createdAt: '2026-01-01 10:00:00',
  updatedAt: '2026-01-01 10:00:00',
  dueToday: 0,
  newCards: 0,
  mastered: 0,
  ...over,
});

describe('deck list', () => {
  const decks = [
    deck({ id: 'a', name: 'Toronto Words', isPublic: true, cardCount: 5, dueToday: 1, createdAt: '2026-01-01 10:00:00' }),
    deck({ id: 'b', name: 'Vancouver Phrases', cardCount: 50, dueToday: 9, createdAt: '2026-03-01 10:00:00', tags: ['travel'] }),
    deck({ id: 'c', name: 'Acme Corp Terms', description: 'office talk', cardCount: 20, createdAt: '2026-02-01 10:00:00' }),
  ];
  const ids = (l: DeckWithStats[]) => l.map((d) => d.id);

  it('searches name, description and tags, case-insensitively', () => {
    const run = (search: string) => ids(filterAndSortDecks(decks, { filter: 'all', search, sort: 'recent' }));
    expect(run('toronto')).toEqual(['a']);
    expect(run('OFFICE')).toEqual(['c']);
    expect(run('travel')).toEqual(['b']);
    expect(run('  ')).toHaveLength(3);
    expect(run('zzz')).toEqual([]);
  });

  it('filters by Private / Public', () => {
    expect(ids(filterAndSortDecks(decks, { filter: 'public', search: '', sort: 'recent' }))).toEqual(['a']);
    expect(ids(filterAndSortDecks(decks, { filter: 'private', search: '', sort: 'recent' })).sort()).toEqual(['b', 'c']);
  });

  it('sorts four ways', () => {
    const sort = (s: 'recent' | 'alpha' | 'cards' | 'due') => ids(filterAndSortDecks(decks, { filter: 'all', search: '', sort: s }));
    expect(sort('recent')).toEqual(['b', 'c', 'a']);
    expect(sort('alpha')).toEqual(['c', 'a', 'b']);
    expect(sort('cards')).toEqual(['b', 'c', 'a']);
    expect(sort('due')).toEqual(['b', 'a', 'c']);
  });

  it('does not reorder the caller\'s array', () => {
    const copy = ids(decks);
    filterAndSortDecks(decks, { filter: 'all', search: '', sort: 'alpha' });
    expect(ids(decks)).toEqual(copy);
  });

  it('derives card colour, mastery and the streak line', () => {
    expect(deckStatus({ dueToday: 2, mastered: 9 })).toBe('review');
    expect(deckStatus({ dueToday: 0, mastered: 1 })).toBe('good');
    expect(deckStatus({ dueToday: 0, mastered: 0 })).toBe('untouched');
    expect(masteryPercent({ mastered: 1, cardCount: 3 })).toBe(33);
    expect(masteryPercent({ mastered: 0, cardCount: 0 })).toBe(0);
    expect(streakHint(2, 5)).toEqual({ kind: 'toBest', days: 3 });
    expect(streakHint(5, 5)).toEqual({ kind: 'best', days: 0 });
    expect(streakHint(0, 0)).toEqual({ kind: 'start', days: 0 });
  });
});

describe('typed delete', () => {
  it('accepts the English word or the localized one, trimmed and case-insensitive', () => {
    expect(isDeleteConfirmed('delete', 'supprimer')).toBe(true);
    expect(isDeleteConfirmed('  DELETE ', 'supprimer')).toBe(true);
    expect(isDeleteConfirmed('Supprimer', 'supprimer')).toBe(true);
    expect(isDeleteConfirmed('حذف', 'حذف')).toBe(true);
  });
  it('rejects anything else, including nothing', () => {
    expect(isDeleteConfirmed('', 'supprimer')).toBe(false);
    expect(isDeleteConfirmed('del', 'supprimer')).toBe(false);
    expect(isDeleteConfirmed('delete it', 'supprimer')).toBe(false);
    expect(isDeleteConfirmed('', '')).toBe(false);
  });
});

describe('cards', () => {
  it('reads notes and drops owner-only origin fields', () => {
    const n = parseCardNotes(JSON.stringify({ ipa: '/x/', source_context: 'secret', video_url: 'u', video_id: 'v' }));
    expect(n).toEqual({ ipa: '/x/' });
    expect(parseCardNotes('plain text')).toBeNull();
    expect(parseCardNotes('[1,2]')).toBeNull();
    expect(parseCardNotes(null)).toBeNull();
  });

  it('recognises AI cards, new and legacy', () => {
    expect(isAIGeneratedCard({ generated_by: 'ai' })).toBe(true);
    expect(isAIGeneratedCard({ generated_by: 'smart_ai' })).toBe(true);
    expect(isAIGeneratedCard({ mode: 'smart' })).toBe(true);
    expect(isAIGeneratedCard({ generated_by: 'manual' })).toBe(false);
    expect(isAIGeneratedCard(null)).toBe(false);
  });

  it('reads examples in both the source/target and the en/tr shapes', () => {
    expect(cardExamples({ examples: [{ source: 'a', target: 'b' }, { en: 'c', tr: 'd' }, {}] })).toEqual([
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ]);
  });

  it('saving examples keeps every AI field and only rewrites examples', () => {
    const existing = JSON.stringify({ ipa: '/x/', definition: 'd', examples: [{ source: 'old', target: 'o' }] });
    const out = JSON.parse(buildNotesForSave(existing, [{ source: ' new ', target: '' }, { source: '', target: '' }]));
    expect(out).toEqual({ ipa: '/x/', definition: 'd', examples: [{ source: 'new', target: '' }] });
    const cleared = JSON.parse(buildNotesForSave(existing, []));
    expect(cleared).toEqual({ ipa: '/x/', definition: 'd' });
  });

  it('a card with no notes only gets JSON when it has examples', () => {
    expect(buildNotesForSave(null, [])).toBe('');
    expect(JSON.parse(buildNotesForSave(null, [{ source: 'a', target: 'b' }]))).toEqual({ examples: [{ source: 'a', target: 'b' }] });
    expect(buildNotesForSave('a plain note', [])).toBe('a plain note');
  });

  it('hides the meaning-language fields of a foreign deck', () => {
    const notes = {
      ipa: '/bɔ̃ʒuʁ/',
      definition: 'تعریف فارسی',
      translation: 'سلام',
      cefr_level: 'A1',
      examples: [{ source: 'Bonjour tout le monde', en: 'Hello everyone' }, { source: 'سلام', en: 'x' }],
    };
    const out = withoutMeaningLanguage(notes, 'bonjour');
    expect(out.definition).toBeUndefined();
    expect(out.translation).toBeUndefined();
    expect(out.ipa).toBe('/bɔ̃ʒuʁ/');
    expect(out.cefr_level).toBe('A1');
    expect(out.examples).toEqual([{ source: 'Bonjour tout le monde', en: 'Hello everyone' }]);
  });

  it('orders cards the way the author did', () => {
    expect(inAuthorOrder([{ order_index: 2 }, { order_index: 0 }, { order_index: null }]).map((c) => c.order_index)).toEqual([0, null, 2]); // a missing index counts as 0, ties keep their order
  });
});

describe('language pair', () => {
  it('splits a pair with fallbacks', () => {
    expect(splitLanguagePair('fr-fa', { learning: 'en', native: 'en' })).toEqual({ learning: 'fr', native: 'fa' });
    expect(splitLanguagePair('fr', { learning: 'en', native: 'ar' })).toEqual({ learning: 'fr', native: 'ar' });
    expect(splitLanguagePair('', { learning: 'en', native: 'ar' })).toEqual({ learning: 'en', native: 'ar' });
    expect(deckSourceLang('FR-fa')).toBe('fr');
    expect(deckSourceLang(null)).toBe('en');
  });
  it('drops a translated copy\'s language tag for viewers', () => {
    expect(publicDeckTitle('Toronto Words [VI]')).toBe('Toronto Words');
    expect(publicDeckTitle('Toronto Words')).toBe('Toronto Words');
  });
});

describe('explore', () => {
  const mk = (id: string, pair: string, over: Partial<PublicDeckSummary> = {}): PublicDeckSummary => ({
    id,
    title: `Deck ${id}`,
    description: null,
    card_count: 10,
    language_pair: pair,
    created_at: `2026-0${Number(id) || 1}-01T00:00:00Z`,
    total_clones: 0,
    ...over,
  });
  const decks = [
    mk('1', 'en-fa', { official: true, total_clones: 2 }),
    mk('2', 'fr-en', { total_clones: 9 }),
    mk('3', 'en-fr'),
    mk('4', 'es-en', { card_count: 3 }),
  ];

  it('hides decks under the minimum card count', () => {
    expect(listableDecks(decks).map((d) => d.id)).toEqual(['1', '2', '3']);
  });

  it('counts languages under the other filters and sorts by size', () => {
    const f = exploreFacets(listableDecks(decks), { query: '', source: '', language: '' });
    expect(f.languages).toEqual([['en', 2], ['fr', 1]]);
    expect(f.sources).toEqual({ '': 3, official: 1, users: 2 });
    const official = exploreFacets(listableDecks(decks), { query: '', source: 'official', language: '' });
    expect(official.languages).toEqual([['en', 1]]);
    const french = exploreFacets(listableDecks(decks), { query: '', source: '', language: 'fr' });
    expect(french.sources['']).toBe(1);
  });

  it('filters, and sorts Popular by clones then recency', () => {
    const base = listableDecks(decks);
    const run = (over: Partial<Parameters<typeof filterPublicDecks>[1]>) =>
      filterPublicDecks(base, { query: '', source: '', language: '', sort: 'recent', ...over }).map((d) => d.id);
    expect(run({})).toEqual(['1', '2', '3']);
    expect(run({ language: 'en' })).toEqual(['1', '3']);
    expect(run({ source: 'users' })).toEqual(['2', '3']);
    expect(run({ query: 'deck 2' })).toEqual(['2']);
    expect(run({ sort: 'popular' })).toEqual(['2', '1', '3']);
  });
});

describe('saving a public deck', () => {
  it('copies when the meaning language matches, translates otherwise', () => {
    expect(decideCloneMode('fa', 'fa')).toBe('copy');
    expect(decideCloneMode('fa', 'fr')).toBe('translate');
    expect(decideCloneMode('en', 'en-US')).toBe('copy');
    expect(decideCloneMode('EN', 'en_gb')).toBe('copy');
  });

  it('knows which languages the learner already holds, per source deck', () => {
    const lib = [
      deck({ id: 'x', originalDeckId: 'pub', language: 'en', nativeLanguage: 'fa', createdAt: '2026-01-01' }),
      deck({ id: 'y', originalDeckId: 'pub', language: 'en', nativeLanguage: 'fr', createdAt: '2026-02-01' }),
      deck({ id: 'z', originalDeckId: 'other', language: 'en', nativeLanguage: 'ar' }),
      deck({ id: 'w', language: 'en' }),
    ];
    const copies = copiesOf(lib, 'pub');
    expect(copies.map((c) => c.id)).toEqual(['y', 'x']);
    expect([...ownedMeaningLanguages(copies, 'en')].sort()).toEqual(['fa', 'fr']);
    expect(ownedMeaningLanguages(copies, 'es').size).toBe(0);
    expect(copiesOf(lib, null)).toEqual([]);
  });

  it('titles a translated copy with its language and keeps an exact copy\'s title', () => {
    expect(cloneTitle('Toronto Words [FA]', 'translate', 'vi')).toBe('Toronto Words [VI]');
    expect(cloneTitle('Toronto Words [FA]', 'copy', 'fa')).toBe('Toronto Words');
  });
});

describe('sharing', () => {
  it('says what Publish / Share can do right now', () => {
    expect(shareAvailability({ signedIn: false, cardCount: 5 })).toBe('sign-in');
    expect(shareAvailability({ signedIn: true, cardCount: 0 })).toBe('empty');
    expect(shareAvailability({ signedIn: true, cardCount: 5 })).toBe('needs-publish');
    expect(shareAvailability({ signedIn: true, cardCount: 5, cloudDeckId: 'c' })).toBe('ready');
  });

  it('finds the YouTube id behind a source URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://example.com/page')).toBeNull();
    expect(extractYouTubeId(null)).toBeNull();
  });
});
