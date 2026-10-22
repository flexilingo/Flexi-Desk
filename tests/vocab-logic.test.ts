import { describe, expect, it } from 'vitest';
import {
  cefrInBand,
  filterWords,
  mergeWords,
  normalizeCefr,
  pageWindow,
  paginate,
  recommendWords,
  sortWords,
  splitByStore,
  wordStats,
  wordsToCsv,
  wordsToJson,
  type AccountWordRow,
  type LocalWordRow,
} from '@/pages/vocabulary/vocabLogic';

const local = (over: Partial<LocalWordRow> = {}): LocalWordRow => ({
  id: 1, word: 'maison', language: 'fr', pos: 'noun', cefr_level: 'A1', translation: 'house', definition: null, context_sentence: 'La maison est grande.',
  source_module: 'dictionary', created_at: '2026-10-01 10:00:00', last_seen_at: '2026-10-05 10:00:00', lookup_count: 3, deck_count: 0, status: 'new', level: 0, ...over,
});
const account = (over: Partial<AccountWordRow> = {}): AccountWordRow => ({
  id: 'a1', word: 'Maison', translation: null, lookup_count: 5, first_seen_at: '2026-09-20T10:00:00.000Z', last_seen_at: '2026-10-09T10:00:00.000Z',
  cefrLevel: 'unknown', sourceLang: 'fr', status: 'in_deck', leitnerBox: 2, videoContexts: ['Dans la maison'], ...over,
});
const NOW = Date.UTC(2026, 9, 10);

describe('vocabulary: merge by word', () => {
  it('joins the account row to the local word and keeps the better of each fact', () => {
    const [m] = mergeWords([local()], [account()]);
    expect(m.inAccount).toBe(true);
    expect(m.local?.id).toBe(1);
    expect(m.lookups).toBe(5); // the larger, not 3 + 5: a signed-in lookup is recorded in both places
    expect(m.status).toBe('learning'); // the account has it in a deck, this computer does not
    expect(m.level).toBe(2);
    expect(m.translation).toBe('house');
    expect(m.cefr).toBe('A1');
    expect(m.firstMs).toBe(Date.UTC(2026, 8, 20, 10));
    expect(m.lastMs).toBe(Date.UTC(2026, 9, 9, 10));
    expect(m.contexts).toEqual(['La maison est grande.', 'Dans la maison']);
  });

  it('never lowers the status: a mastered local word stays mastered', () => {
    const [m] = mergeWords([local({ status: 'mastered', level: 5 })], [account({ status: 'new', leitnerBox: 0 })]);
    expect(m.status).toBe('mastered');
    expect(m.level).toBe(5);
  });

  it('keeps words that only one place knows, and does not merge across languages', () => {
    const merged = mergeWords([local(), local({ id: 2, word: 'chat' })], [account({ id: 'a2', word: 'maison', sourceLang: 'en' }), account({ id: 'a3', word: 'zebra', sourceLang: null })]);
    expect(merged.map((m) => `${m.language}:${m.word}`).sort()).toEqual(['en:maison', 'fr:chat', 'fr:maison', 'null:zebra']);
    expect(merged.find((m) => m.word === 'zebra')!.local).toBeNull();
    // An account word with no language joins a local word of the same spelling.
    const [joined] = mergeWords([local()], [account({ sourceLang: null })]);
    expect(joined.local?.id).toBe(1);
    expect(mergeWords([], [])).toEqual([]);
  });

  it('normalises levels', () => {
    expect(normalizeCefr(' b2 ')).toBe('B2');
    expect(normalizeCefr('PHRASE')).toBe('unknown');
    expect(normalizeCefr(null)).toBe('unknown');
  });
});

describe('vocabulary: filter, sort, page', () => {
  const items = mergeWords(
    [
      local({ id: 1, word: 'maison', status: 'new', lookup_count: 3, cefr_level: 'A1', last_seen_at: '2026-10-05 10:00:00' }),
      local({ id: 2, word: 'beaucoup', status: 'learning', lookup_count: 9, cefr_level: 'B2', translation: 'a lot', last_seen_at: '2026-10-07 10:00:00' }),
      local({ id: 3, word: 'zèbre', status: 'mastered', lookup_count: 1, cefr_level: 'C1', last_seen_at: '2026-10-01 10:00:00' }),
      local({ id: 4, word: 'ami', status: 'new', lookup_count: 1, cefr_level: null, last_seen_at: '2026-10-03 10:00:00' }),
    ],
    [],
  );
  const words = (list: { word: string }[]) => list.map((i) => i.word);

  it('filters by status, level band and search (word or translation)', () => {
    const f = { status: 'all' as const, cefr: 'all' as const, search: '' };
    expect(words(filterWords(items, { ...f, status: 'new' })).sort()).toEqual(['ami', 'maison']);
    expect(words(filterWords(items, { ...f, cefr: 'B1' }))).toEqual(['beaucoup']);
    expect(words(filterWords(items, { ...f, cefr: 'A1' }))).toEqual(['maison']);
    expect(words(filterWords(items, { ...f, search: 'a lot' }))).toEqual(['beaucoup']);
    expect(words(filterWords(items, { ...f, search: 'MAIS' }))).toEqual(['maison']);
    expect(words(filterWords(items, { status: 'new', cefr: 'C1', search: '' }))).toEqual([]);
    expect(cefrInBand('unknown', 'A1')).toBe(false);
    expect(cefrInBand('unknown', 'all')).toBe(true);
  });

  it('sorts by recency, by most looked up, and alphabetically', () => {
    expect(words(sortWords(items, 'recent'))).toEqual(['beaucoup', 'maison', 'ami', 'zèbre']);
    expect(words(sortWords(items, 'most_clicked'))).toEqual(['beaucoup', 'maison', 'ami', 'zèbre']);
    expect(words(sortWords(items, 'alphabetical'))).toEqual(['ami', 'beaucoup', 'maison', 'zèbre']);
  });

  it('pages by 20 and clamps the page', () => {
    const many = Array.from({ length: 45 }, (_, i) => i);
    expect(paginate(many, 1)).toMatchObject({ total: 45, totalPages: 3, page: 1 });
    expect(paginate(many, 3).items).toHaveLength(5);
    expect(paginate(many, 99).page).toBe(3);
    expect(paginate(many, 0).page).toBe(1);
    expect(paginate([], 1)).toMatchObject({ totalPages: 1, items: [] });
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(8, 20)).toEqual([1, 'gap', 7, 8, 9, 'gap', 20]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 'gap', 20]);
  });

  it('counts the stat cards', () => {
    const s = wordStats(items, Date.UTC(2026, 9, 8));
    expect(s).toEqual({ total: 4, inDeck: 2, mastered: 1, newThisWeek: 4, masteryPct: 25 });
    expect(wordStats(items, Date.UTC(2027, 0, 1)).newThisWeek).toBe(0);
    expect(wordStats([], NOW).masteryPct).toBe(0);
  });

  it('recommends words looked up twice or more that are in no deck, most looked up first', () => {
    const rec = mergeWords(
      [local({ id: 1, word: 'a', lookup_count: 4 }), local({ id: 2, word: 'b', lookup_count: 7 }), local({ id: 3, word: 'c', lookup_count: 9, status: 'learning' }), local({ id: 4, word: 'd', lookup_count: 1 })],
      [],
    );
    expect(words(recommendWords(rec))).toEqual(['b', 'a']);
    const lots = mergeWords(Array.from({ length: 15 }, (_, i) => local({ id: i + 1, word: `w${i}`, lookup_count: 2 + i })), []);
    expect(recommendWords(lots)).toHaveLength(10);
  });
});

describe('vocabulary: selection and export', () => {
  const items = mergeWords([local()], [account({ id: 'a9', word: 'only', sourceLang: 'en' })]);

  it('splits a selection into what this computer can delete and what only the account has', () => {
    const { local: l, accountOnly } = splitByStore(items);
    expect(words(l)).toEqual(['maison']);
    expect(words(accountOnly)).toEqual(['only']);
  });

  it('exports the list as CSV and JSON', () => {
    const csv = wordsToCsv(items).split('\n');
    expect(csv[0]).toBe('"word","language","translation","cefr","status","lookups","first_seen","last_seen"');
    expect(csv).toHaveLength(3);
    const json = JSON.parse(wordsToJson(items)) as { word: string; onThisComputer: boolean; inAccount: boolean }[];
    expect(json.find((j) => j.word === 'only')).toMatchObject({ onThisComputer: false, inAccount: true });
  });
});

function words(list: { word: string }[]) {
  return list.map((i) => i.word);
}
