import { describe, expect, it } from 'vitest';
import {
  buildHaystack,
  buildVerbRows,
  excerpt,
  filterVerbs,
  formsInVerbs,
  highlightAt,
  localHits,
  mergeHits,
  offerConjugation,
  pageCount,
  pageList,
  pageSlice,
  plainLine,
  searchBodies,
  verbLevelCounts,
  PER_PAGE,
} from '@/pages/cheatsheet/lib/search';
import { infinitiveIn } from '@/pages/cheatsheet/lib/onDemand';
import { normalise } from '@/pages/cheatsheet/lib/normalise';
import { buildSidebarTree, type Topic, type TopicSummary, type VerbDetail } from '@/pages/cheatsheet/lib/types';

const summary = (slug: string, title: string, extra: Partial<TopicSummary> = {}): TopicSummary => ({
  slug, title, subtitle: '', section: 'grammaire', category: 'nom', order: 0, level: 'A1', tags: [], related: [], headings: [], ...extra,
});

const topic = (slug: string, body: string, title = slug): Topic => ({ ...summary(slug, title), body });

describe('search layer 1: the local filter', () => {
  const topics = [
    summary('petits-mots', 'The small words', { tags: ['préposition'], headings: ['The table'] }),
    summary('subjonctif', 'The subjunctive', { subtitle: 'que je fasse' }),
  ];
  const hay = buildHaystack(topics);

  it('matches title, subtitle, tags and headings, accent- and case-blind', () => {
    expect(localHits(hay, normalise('SMALL')).map((h) => h.slug)).toEqual(['petits-mots']);
    expect(localHits(hay, normalise('preposition')).map((h) => h.slug)).toEqual(['petits-mots']);
    expect(localHits(hay, normalise('table')).map((h) => h.slug)).toEqual(['petits-mots']);
    expect(localHits(hay, normalise('fasse')).map((h) => h.slug)).toEqual(['subjonctif']);
    expect(localHits(hay, '')).toEqual([]);
  });

  it('server hits replace local ones for the same page; a stale answer adds nothing', () => {
    const local = localHits(hay, normalise('the'));
    const remote = { q: 'the', hits: [{ slug: 'subjonctif', title: 'The subjunctive', line: 'row', heading: 'H', matches: 2 }] };
    const merged = mergeHits(remote, local, 'the');
    expect(merged.map((h) => h.slug)).toEqual(['subjonctif', 'petits-mots']);
    expect(merged[0].line).toBe('row');
    expect(mergeHits({ q: 'old', hits: remote.hits }, local, 'the').map((h) => h.slug)).toEqual(['petits-mots', 'subjonctif']);
    expect(mergeHits(remote, local, '')).toEqual([]);
  });

  it('caps the list at 24', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ slug: `s${i}`, title: `t${i}` }));
    expect(mergeHits({ q: 'x', hits: [] }, many, 'x')).toHaveLength(24);
  });
});

describe('search layer 2 offline: stored bodies', () => {
  const stored = [
    topic('depuis', '## When\n\n| a | b |\n|---|---|\n| `depuis` trois ans | since |\n\nSee `depuis` again.', 'Depuis and pendant'),
    topic('articles', '## Basics\n\nNothing here.'),
  ];

  it('finds the matching row with its heading and the number of matching lines', () => {
    const [hit] = searchBodies(stored, 'depuis');
    expect(hit.slug).toBe('depuis');
    expect(hit.heading).toBe('When');
    expect(hit.line).toContain('depuis');
    expect(hit.matches).toBe(2);
  });

  it('needs two characters and skips pages without a match', () => {
    expect(searchBodies(stored, 'd')).toEqual([]);
    expect(searchBodies(stored, 'zzz')).toEqual([]);
  });
});

describe('find-form mapping', () => {
  const verb = (lemma: string, forms: [string, string][]): VerbDetail => ({
    lemma, gloss: 'to like', level: 'A1', family: 'group-1-er', ipa: null, predicted: false, form_glosses: {},
    complement: [], complement_note: null, examples: [], collocations: [], tips: [],
    forms: [{ mood: 'indicatif', tense: 'présent', forms: forms.map(([pr, form]) => ({ pr, form, ipa: '/x/' })) }],
  });
  const aimer = verb('aimer', [['je', "j'aime"], ['ils', 'ils aiment']]);

  it('traces a conjugated form back to its verb, with or without the pronoun', () => {
    expect(formsInVerbs([aimer], 'aiment')[0]).toMatchObject({ lemma: 'aimer', form: 'ils aiment', pr: 'ils', tense: 'présent' });
    expect(formsInVerbs([aimer], 'ils aiment')).toHaveLength(1);
    expect(formsInVerbs([aimer], 'AIMENT')).toHaveLength(1);
    expect(formsInVerbs([aimer], 'xyz')).toEqual([]);
  });

  it('offers to conjugate only an unknown infinitive, once the lookups answered', () => {
    expect(infinitiveIn('conjugaison du verbe googler')).toBe('googler');
    expect(infinitiveIn('aiment')).toBeNull();
    expect(offerConjugation({ asked: 'googler', answered: true, lemmas: ['aimer'] })).toBe(true);
    expect(offerConjugation({ asked: 'googler', answered: false, lemmas: [] })).toBe(false);
    expect(offerConjugation({ asked: 'aimer', answered: true, lemmas: ['aimer'] })).toBe(false);
    expect(offerConjugation({ asked: 'préférer', answered: true, lemmas: ['preferer'] })).toBe(false);
    expect(offerConjugation({ asked: null, answered: true, lemmas: [] })).toBe(false);
  });
});

describe('result rows', () => {
  it('cleans a markdown line and cuts an excerpt around a late match', () => {
    expect(plainLine('> **Note** | `a` | b')).toBe('Note · a · b');
    const long = `${'word '.repeat(30)}needle ${'tail '.repeat(30)}`;
    expect(excerpt(long, 'needle').startsWith('…')).toBe(true);
    expect(excerpt(long, 'needle')).toContain('needle');
    expect(excerpt('short needle', 'needle')).toBe('short needle');
  });

  it('highlights on the original text even when folding changed the length', () => {
    expect(highlightAt('Les élèves', 'eleves')).toBeGreaterThanOrEqual(0);
    expect(highlightAt('abc', 'zzz')).toBe(-1);
  });
});

describe('verb index: filter, level chips, paging', () => {
  const verbs = [
    { lemma: 'aimer', gloss: 'to like', level: 'A1', family: 'g1' },
    { lemma: 'avoir', gloss: 'to have', level: 'A1', family: 'irr' },
    { lemma: 'préférer', gloss: 'to prefer', level: 'A2', family: 'g1' },
  ];
  const rows = buildVerbRows(verbs, ['abaisser', 'zébrer']);

  it('filters as you type on the infinitive and on the meaning, accent-blind', () => {
    expect(filterVerbs(rows, normalise('prefer'), null).map((v) => v.lemma)).toEqual(['préférer']);
    expect(filterVerbs(rows, normalise('to have'), null).map((v) => v.lemma)).toEqual(['avoir']);
    expect(filterVerbs(rows, normalise('zebr'), null).map((v) => v.lemma)).toEqual(['zébrer']);
    expect(filterVerbs(rows, '', null)).toHaveLength(5);
  });

  it('lists glossed verbs first, then the rest by name, and the level chip narrows to glossed ones', () => {
    expect(rows.map((v) => v.extra)).toEqual([false, false, false, true, true]);
    expect(filterVerbs(rows, '', 'A2').map((v) => v.lemma)).toEqual(['préférer']);
    expect(verbLevelCounts(verbs)).toEqual([{ level: 'A1', count: 2 }, { level: 'A2', count: 1 }]);
  });

  it('pages 36 at a time and draws 1 … 4 5 6 … 61', () => {
    const all = Array.from({ length: 7320 }, (_, i) => i);
    expect(PER_PAGE).toBe(36);
    expect(pageCount(7320)).toBe(204);
    expect(pageCount(0)).toBe(1);
    expect(pageSlice(all, 1)).toHaveLength(36);
    expect(pageSlice(all, 204)).toHaveLength(7320 - 203 * 36);
    expect(pageList(5, 61)).toEqual([1, null, 4, 5, 6, null, 61]);
    expect(pageList(1, 3)).toEqual([1, 2, 3]);
  });
});

describe('sidebar tree', () => {
  it('stacks topics by section, then category, in the taxonomy order', () => {
    const tree = buildSidebarTree([
      summary('salutations', 's', { section: 'communication', category: 'communication' }),
      summary('articles', 'a', { section: 'grammaire', category: 'nom' }),
      summary('alphabet', 'b', { section: 'grammaire', category: 'prononciation' }),
    ]);
    expect(tree.map((s) => [s.id, s.categories.map((c) => c.id)])).toEqual([
      ['grammaire', ['prononciation', 'nom']],
      ['communication', ['communication']],
    ]);
  });
});
