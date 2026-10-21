import { describe, it, expect } from 'vitest';
import { readerCandidates } from '@/pages/reader/lib/candidates';
import { STOPWORDS, STOPWORDS_BY_LANG, CHARACTER_LANGUAGES } from '@/pages/reader/lib/stopwords';
import { extractCandidates, rankPreteach, type WordOccurrence, type LevelBucket } from '@/pages/reader/lib/word-select';

describe('stopword lists', () => {
  it('cover the five curated languages and hold only lowercase words', () => {
    expect(Object.keys(STOPWORDS_BY_LANG).sort()).toEqual(['de', 'es', 'fr', 'it', 'pt']);
    for (const list of Object.values(STOPWORDS_BY_LANG)) {
      expect(list.length).toBeGreaterThan(20);
      for (const word of list) expect(word).toBe(word.toLowerCase());
    }
    expect(STOPWORDS.has('the')).toBe(true);
    expect(CHARACTER_LANGUAGES.has('zh')).toBe(true);
  });
});

describe('readerCandidates', () => {
  it('drops function words, keeps accents whole, and carries the ORIGINAL sentence as context', () => {
    const page = "Le café est ouvert. Le développement des villes est rapide, et le café est cher.";
    const found = readerCandidates(page, 'fr');
    const words = found.map((c) => c.word);
    expect(words).toContain('café');
    expect(words).toContain('développement');
    expect(words).not.toContain('est');
    expect(words).not.toContain('des');
    expect(words).not.toContain('caf');
    const cafe = found.find((c) => c.word === 'café')!;
    expect(cafe.occurrences).toBe(2);
    // The first sentence, punctuation and capital intact — not the space-joined tokens.
    expect(cafe.sentence).toBe('Le café est ouvert.');
  });

  it('uses the English list for English and finds nothing on an empty page', () => {
    const found = readerCandidates('The quick brown fox jumps over the lazy dog.', 'en').map((c) => c.word);
    expect(found).toContain('quick');
    expect(found).not.toContain('the');
    expect(readerCandidates('', 'en')).toEqual([]);
  });

  it('keeps single characters for Chinese (a character is a word)', () => {
    const found = readerCandidates('我喜欢学习中文。', 'zh');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((c) => c.word.length >= 1)).toBe(true);
  });
});

describe('extractCandidates / rankPreteach', () => {
  it('flags a mid-sentence capital as a proper noun until a lowercase sighting clears it', () => {
    const found = extractCandidates(['I met Marcel yesterday.', 'Later the marcel returned.']);
    expect(found.find((c) => c.word === 'marcel')!.looksProper).toBe(false);
    const only = extractCandidates(['I met Marcel yesterday.']);
    expect(only.find((c) => c.word === 'marcel')!.looksProper).toBe(true);
  });

  it('ranks harder levels first, and respects the count', () => {
    const level: Record<string, LevelBucket> = { simple: 'A1', difficult: 'C2', medium: 'B2' };
    const candidates: WordOccurrence[] = ['simple', 'difficult', 'medium'].map((word) => ({
      word, occurrences: 1, looksProper: false, sentence: `${word}.`,
    }));
    const ranked = rankPreteach(candidates, { levelOf: (w) => level[w], count: 2 });
    expect(ranked.map((w) => w.word)).toEqual(['difficult', 'medium']);
  });
});
