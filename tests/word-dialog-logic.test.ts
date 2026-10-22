import { describe, it, expect, beforeEach } from 'vitest';
import {
  chooseLookupOrigin,
  dialogSpeakers,
  effectiveTab,
  errorCodeOf,
  lookupKeyFor,
  pairFor,
  resolveSourceLanguage,
  splitTranslation,
  tabsFor,
} from '@/components/WordDialog/logic';
import { fromLocalTranslation } from '@/components/WordDialog/api';
import { parseLastDeck, readLastDeck, rememberDeck } from '@/components/WordDialog/lastDeck';
import { readLastTab, rememberTab } from '@/components/WordDialog/lastTab';
import { voiceFor, readAutoPronounce } from '@/components/WordDialog/pronounce';
import { bumpSeen } from '@/components/WordDialog/lookupCounts';
import { grammarForms, grammarQueryFor } from '@/components/WordDialog/WordGrammar';

beforeEach(() => window.localStorage.clear());

describe('language pair resolution', () => {
  it('the document language wins over every setting', () => {
    expect(resolveSourceLanguage({ explicit: 'fr', learning: 'es' })).toBe('fr');
    expect(resolveSourceLanguage({ explicit: undefined, learning: 'es' })).toBe('es');
    expect(resolveSourceLanguage({ explicit: null, learning: null })).toBe('en');
  });

  it('a word in the translation language is read back into the word language', () => {
    const ctx = { source: 'en', target: 'fr' };
    expect(pairFor('fr', ctx)).toEqual({ source: 'fr', target: 'en' });
    expect(pairFor('en', ctx)).toEqual({ source: 'en', target: 'fr' });
    expect(pairFor('fr', { source: 'fr', target: 'fr' })).toBeNull();
    expect(pairFor('fa', { source: 'en', target: 'fa' })).toBeNull();
    expect(pairFor('en', { source: 'fr', target: null })).toBeNull();
  });
});

describe('where a lookup is answered', () => {
  it('signed out always uses the local path; signed in uses the cloud for pairs it reads', () => {
    expect(chooseLookupOrigin({ signedIn: false, source: 'fr', target: 'en' })).toBe('local');
    expect(chooseLookupOrigin({ signedIn: true, source: 'fr', target: 'en' })).toBe('cloud');
    expect(chooseLookupOrigin({ signedIn: true, source: 'tr', target: 'en' })).toBe('local');
    expect(chooseLookupOrigin({ signedIn: true, source: 'en', target: 'xx' })).toBe('local');
  });
});

describe('tabs', () => {
  it('English dictionaries only for English words', () => {
    expect(tabsFor('en')).toEqual(['google', 'ai', 'dictionary', 'merriam-webster']);
    expect(tabsFor('fr')).toEqual(['google', 'ai']);
    expect(effectiveTab('dictionary', 'fr')).toBe('google');
    expect(effectiveTab('ai', 'fr')).toBe('ai');
  });

  it('remembers the last tab and ignores junk', () => {
    expect(readLastTab()).toBeNull();
    rememberTab('ai');
    expect(readLastTab()).toBe('ai');
    window.localStorage.setItem('flexi.wordDialog.tab', 'nonsense');
    expect(readLastTab()).toBeNull();
  });
});

describe('pronunciation in the word language', () => {
  it('a French word gets the French regions, never US or UK', () => {
    const labels = dialogSpeakers('fr').map((s) => s.label);
    expect(labels).toEqual(['FR', 'CA']);
    expect(dialogSpeakers('fr').map((s) => s.voice)).toEqual(['fr-FR', 'fr-CA']);
  });

  it('English gets US and UK; the learner\'s own voice goes first', () => {
    expect(dialogSpeakers('en').map((s) => s.label)).toEqual(['US', 'UK']);
    expect(dialogSpeakers('en', 'en-GB').map((s) => s.label)).toEqual(['UK', 'US']);
    expect(dialogSpeakers('fr', 'fr-CA').map((s) => s.voice)).toEqual(['fr-CA', 'fr-FR']);
  });

  it('a language without regions gets one speaker labelled with its own code', () => {
    expect(dialogSpeakers('de')).toEqual([{ label: 'DE', voice: 'de' }]);
  });

  it('settings default off and only accept a region the language has', () => {
    expect(readAutoPronounce()).toBe(false);
    window.localStorage.setItem('flexi.wordDialog.voices', JSON.stringify({ fr: 'en-GB', en: 'en-GB' }));
    expect(voiceFor('fr')).toBeNull();
    expect(voiceFor('en')).toBe('en-GB');
  });
});

describe('small helpers', () => {
  it('splits a translation from its bracketed gloss', () => {
    expect(splitTranslation('storm (a violent weather event)')).toEqual({ main: 'storm', note: 'a violent weather event' });
    expect(splitTranslation('hello')).toEqual({ main: 'hello', note: null });
  });

  it('keys an answer by word, context, pair', () => {
    expect(lookupKeyFor({ word: 'a', source: 'fr', target: null })).toBeNull();
    expect(lookupKeyFor({ word: 'a', context: 'b', source: 'fr', target: 'en' })).toBe('a\u0000b\u0000en\u0000fr');
  });

  it('maps thrown errors to codes', () => {
    expect(errorCodeOf(JSON.stringify({ status: 429, error: 'RATE_LIMITED', code: 'RATE_LIMITED' }))).toBe('RATE_LIMITED');
    expect(errorCodeOf('OLLAMA_NOT_RUNNING')).toBe('OLLAMA_NOT_RUNNING');
    expect(errorCodeOf('Translation request failed: error sending request')).toBe('NETWORK_ERROR');
    expect(errorCodeOf('boom')).toBe('UNKNOWN_ERROR');
  });

  it('last deck: one tap target and remembered mode', () => {
    expect(readLastDeck()).toBeNull();
    rememberDeck({ deckId: 'd1', mode: 'smart' });
    expect(readLastDeck()).toEqual({ deckId: 'd1', mode: 'smart' });
    expect(parseLastDeck('{"deckId":"x"}')).toEqual({ deckId: 'x', mode: 'basic' });
    expect(parseLastDeck('not json')).toBeNull();
  });

  it('local Google answer becomes the dialog shape with the source language CEFR', () => {
    const d = fromLocalTranslation({
      word: 'maison',
      translation: 'house',
      alternatives: [{ pos: 'noun', words: ['house', 'home'] }],
      examples: ['La maison est grande.'],
      cefr_level: 'A1',
    });
    expect(d).toMatchObject({ translation: 'house', alternativeTranslations: ['home'], cefr: 'A1', pos: 'noun' });
    expect(d.examples).toEqual([{ source: 'La maison est grande.', target: '' }]);
  });

  it('counts lookups per language', () => {
    expect(bumpSeen('fr', 'Maison')).toBe(1);
    expect(bumpSeen('fr', 'maison')).toBe(2);
    expect(bumpSeen('en', 'maison')).toBe(1);
  });

  it('grammar is asked only for single French words', () => {
    expect(grammarQueryFor('suis', 'fr')).toEqual({ word: 'suis', lang: 'fr' });
    expect(grammarQueryFor('suis', 'en')).toBeNull();
    expect(grammarQueryFor('je suis', 'fr')).toBeNull();
    expect(
      grammarForms({
        lang: 'fr',
        word: 'suis',
        noun: null,
        verb: { lemma: 'être', forms: [{ mood: 'indicatif', tense: 'présent', forms: [{ pr: 'je', form: 'je suis', ipa: '' }] }] },
      }),
    ).toEqual(['être', 'suis']);
  });
});
