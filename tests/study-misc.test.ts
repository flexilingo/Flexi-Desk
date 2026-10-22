import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nearMissKind } from '../src/pages/study/lib/nearMiss';
import { singleFlight } from '../src/pages/study/lib/singleFlight';
import { frontLanguage, languageName, meaningLanguage, scriptLanguage } from '../src/pages/study/lib/cardLang';
import {
  defaultGroups,
  groupsFromNotes,
  groupsFromVerb,
  isFrenchVerbCard,
} from '../src/pages/study/lib/conjugation';
import { keepAliveWav } from '../src/pages/study/lib/audioKeepAlive';
import { criteriaOf } from '../src/pages/study/lib/scorecard';
import { scopeAvailability, defaultScope } from '../src/pages/study/lib/scopes';
import { normalizeExamples, stripEdgeEllipsis } from '../src/pages/study/lib/examples';
import type { DeckStatus } from '../src/pages/study/types';
import type { VerbDetail } from '../src/pages/cheatsheet/lib/types';

describe('one card per Continue', () => {
  it('ignores presses while the next card is loading', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const advance = singleFlight(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          release = resolve;
        }),
    );
    const first = advance();
    const second = advance(); // a second Continue / Enter while it loads
    const third = advance();
    expect(await Promise.all([second, third])).toEqual([false, false]);
    expect(calls).toBe(1);
    release();
    expect(await first).toBe(true);
    // Once the card has landed the next press is a real one again.
    void advance();
    expect(calls).toBe(2);
    release();
  });

  it('lets the next one through after a failure', async () => {
    let calls = 0;
    const advance = singleFlight(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    });
    await expect(advance()).rejects.toThrow('boom');
    await advance();
    expect(calls).toBe(2);
  });
});

describe('near misses on a typed word', () => {
  it('names an accent-only slip and a one-letter slip, never a different word', () => {
    expect(nearMissKind('cafe', 'café')).toBe('accent');
    expect(nearMissKind('Cafe', 'café')).toBe('accent');
    expect(nearMissKind('recieve', 'receive')).toBe('typo'); // swap
    expect(nearMissKind('maisson', 'maison')).toBe('typo'); // extra
    expect(nearMissKind('maion', 'maison')).toBe('typo'); // dropped
    expect(nearMissKind('maisan', 'maison')).toBe('typo'); // changed
    expect(nearMissKind('au', 'eau')).toBeNull(); // under four letters one edit is another word
    expect(nearMissKind('chat', 'maison')).toBeNull();
    expect(nearMissKind('maison', 'maison')).toBeNull();
    expect(nearMissKind('', 'maison')).toBeNull();
  });
});

describe('which language a card is read in', () => {
  it('the word follows its own declaration, then the deck, then its script', () => {
    expect(frontLanguage({ notesLang: 'fr', deckLanguage: 'en' }, 'bonjour')).toBe('fr');
    expect(frontLanguage({ deckLanguage: 'es-MX' }, 'hola')).toBe('es');
    expect(frontLanguage({}, 'привет')).toBe('ru');
    expect(frontLanguage({}, 'hello')).toBe('en');
  });

  it('the meaning is read in the language it is written in — any language, nothing left silent', () => {
    // Arabic-script text is written as escapes so no such script sits in a fixture.
    const arabicScript = '\u0645\u0631\u062D\u0628\u0627';
    const withFaLetter = '\u0686\u0637\u0648\u0631'; // contains a letter only 'fa' uses
    expect(meaningLanguage('hello', 'en', 'fa')).toBe('en');
    expect(meaningLanguage(arabicScript, 'fa', 'en')).toBe('fa'); // same script family: the deck's voice wins
    expect(meaningLanguage(arabicScript, 'ar', 'en')).toBe('ar');
    expect(meaningLanguage(arabicScript, null, 'en')).toBe('ar'); // no letter to tell them apart
    expect(meaningLanguage(withFaLetter, null, 'en')).toBe('fa');
    expect(meaningLanguage('你好', 'zh', 'en')).toBe('zh');
    expect(meaningLanguage('नमस्ते', 'hi', 'en')).toBe('hi');
    expect(meaningLanguage('bonjour', 'fa', 'fa')).toBe('en'); // Latin text under a non-Latin native language
    expect(meaningLanguage('bonjour', 'fr', 'en')).toBe('fr');
    expect(scriptLanguage('hello')).toBeNull();
  });

  it('names the language in the UI language, for the typed prompt', () => {
    expect(languageName('fr', 'en')).toBe('French');
    expect(languageName('fr', 'fr')).toBe('français');
    expect(languageName('', 'en')).toBeNull();
    expect(languageName(null, 'en')).toBeNull();
  });
});

describe('verb conjugation on a card', () => {
  const verb: VerbDetail = {
    lemma: 'aimer',
    gloss: 'to love',
    level: 'A1',
    family: 'er',
    ipa: null,
    predicted: false,
    forms: [
      { mood: 'indicatif', tense: 'passé-composé', forms: [{ pr: 'je', form: "j'ai aimé", ipa: '' }] },
      { mood: 'indicatif', tense: 'présent', forms: [{ pr: 'je', form: "j'aime", ipa: '' }, { pr: 'tu', form: 'aimes', ipa: '' }] },
    ],
    form_glosses: { 'indicatif|présent|je': 'I love' },
    complement: [],
    complement_note: null,
    examples: [],
    collocations: [],
    tips: [],
  };

  it('reshapes the cheatsheet paradigm, each person with its meaning', () => {
    const groups = groupsFromVerb(verb);
    expect(groups).toHaveLength(2);
    expect(groups[1].forms[0]).toMatchObject({ pr: 'je', form: "j'aime", gloss: 'I love' });
    expect(groups[1].forms[1].gloss).toBeUndefined();
    expect(defaultGroups(groups).map((g) => g.tense)).toEqual(['présent']); // Présent first, the rest behind "more"
    expect(defaultGroups([groups[0]]).map((g) => g.tense)).toEqual(['passé-composé']);
  });

  it("prefers the card's own notes, and drops empty groups", () => {
    const notes = { conjugations: { groups: [{ mood: 'm', tense: 'présent', forms: [{ form: 'je suis' }] }, { tense: 'x', forms: [] }] } };
    expect(groupsFromNotes(notes)).toHaveLength(1);
    expect(groupsFromNotes(null)).toEqual([]);
  });

  it('looks a card up only when it is a French verb', () => {
    expect(isFrenchVerbCard({ part_of_speech: 'verb' }, 'fr', 'aimer')).toBe(true);
    expect(isFrenchVerbCard({ part_of_speech: 'verbe' }, 'fr-CA', 'aimer')).toBe(true);
    expect(isFrenchVerbCard({ part_of_speech: 'noun' }, 'fr', 'maison')).toBe(false);
    expect(isFrenchVerbCard({ part_of_speech: 'verb' }, 'en', 'run')).toBe(false);
    expect(isFrenchVerbCard({ part_of_speech: 'verb' }, 'fr', 'prendre froid')).toBe(false);
    expect(isFrenchVerbCard(null, 'fr', 'aimer')).toBe(false);
  });
});

describe('the judge scorecard', () => {
  it('marks each criterion, and leaves elision out for languages without it', () => {
    const card = {
      accepted: false,
      score: 40,
      criteria: { meaning: true, grammar: false, spelling: 'accents' as const, elision: null },
      hints: {},
    };
    expect(criteriaOf(card)).toEqual([
      { key: 'meaning', mark: 'pass' },
      { key: 'grammar', mark: 'fail' },
      { key: 'spelling', mark: 'near' },
    ]);
    expect(criteriaOf({ ...card, criteria: { ...card.criteria, elision: false, spelling: 'typos' } }).map((c) => c.mark)).toEqual([
      'pass',
      'fail',
      'fail',
      'fail',
    ]);
  });
});

describe('the scope sheet', () => {
  const deck = (over: Partial<DeckStatus>): DeckStatus =>
    ({ deck_id: 'd', deck_title: 'D', total_cards: 10, due_count: 0, untouched_count: 0, leech_count: 0 }) as DeckStatus & typeof over;

  it('"review even if not due" unlocks the due scope when nothing is due', () => {
    const finished = { ...deck({}), total_cards: 10, due_count: 0, untouched_count: 0 } as DeckStatus;
    expect(scopeAvailability(finished, false).due.available).toBe(false);
    expect(scopeAvailability(finished, true).due).toEqual({ count: 10, available: true });
    expect(scopeAvailability(finished, false).random).toEqual({ count: 10, available: true });
  });

  it('opens on the first scope that has cards, and sizes none for today\'s mix', () => {
    expect(defaultScope(null)).toBe('due');
    expect(defaultScope({ ...deck({}), due_count: 0, untouched_count: 4 } as DeckStatus)).toBe('due');
    expect(defaultScope({ ...deck({}), due_count: 0, untouched_count: 0 } as DeckStatus)).toBe('weak');
    expect(scopeAvailability(null, false).new.count).toBeNull();
  });
});

describe('example sentences', () => {
  it('drops the edge ellipses clipped excerpts carry, and rows with no sentence', () => {
    expect(stripEdgeEllipsis('... the bridge …')).toBe('the bridge');
    expect(stripEdgeEllipsis('wait... for me')).toBe('wait... for me');
    expect(normalizeExamples([{ en: '…hello…', tr: 'salut' }, { source: '', target: 'x' }, { source: 'Bonjour', target: 'Hello' }])).toEqual([
      { text: 'hello', translation: 'salut' },
      { text: 'Bonjour', translation: 'Hello' },
    ]);
  });
});

describe('keeping a hands-free run alive in a hidden window', () => {
  it('builds a valid, looping one-second WAV with a real (inaudible) signal, not silence', () => {
    const buf = keepAliveWav();
    const view = new DataView(buf);
    const ascii = (o: number, n: number) => String.fromCharCode(...new Uint8Array(buf, o, n));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(buf.byteLength).toBe(44 + 16_000);
    let peak = 0;
    for (let i = 0; i < 8000; i++) peak = Math.max(peak, Math.abs(view.getInt16(44 + i * 2, true)));
    expect(peak).toBeGreaterThan(50);
    expect(peak).toBeLessThan(200); // far below anything audible
  });
});

describe('study strings exist in all six languages, with the same keys and placeholders', () => {
  const load = (loc: string) =>
    JSON.parse(readFileSync(resolve(process.cwd(), `src/i18n/locales/${loc}/study.json`), 'utf8')) as Record<string, unknown>;
  const flat = (o: unknown, prefix = ''): Record<string, string> =>
    Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
      if (v && typeof v === 'object') Object.assign(acc, flat(v, `${prefix}${k}.`));
      else acc[`${prefix}${k}`] = String(v);
      return acc;
    }, {});
  const en = flat(load('en'));
  const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');

  it.each(['fa', 'ar', 'fr', 'hi', 'zh'])('%s has every English key and keeps its placeholders', (loc) => {
    const other = flat(load(loc));
    const missing = Object.keys(en).filter((k) => !(k in other));
    expect(missing).toEqual([]);
    const broken = Object.keys(en).filter((k) => placeholders(en[k]) !== placeholders(other[k] ?? ''));
    expect(broken).toEqual([]);
  });

  it('uses the i18next placeholder syntax, never the website\'s single braces', () => {
    for (const loc of ['en', 'fa', 'ar', 'fr', 'hi', 'zh']) {
      const bad = Object.entries(flat(load(loc))).filter(([, v]) => /(^|[^{])\{\w+\}($|[^}])/.test(v));
      expect(bad).toEqual([]);
    }
  });

  it('the new surfaces are really translated, not copied from English', () => {
    const enFlat = en;
    for (const loc of ['fa', 'ar', 'fr', 'hi', 'zh']) {
      const other = flat(load(loc));
      for (const k of ['shadowing.gap', 'shadowing.start', 'report.recallTitle', 'tour.steps.intro.title', 'scorecard.title', 'runner.typeIn']) {
        expect(other[k], `${loc} ${k}`).not.toBe(enFlat[k]);
      }
    }
  });
});
