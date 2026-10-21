import { describe, it, expect } from 'vitest';
import { cleanWord, splitParagraphs, splitSentences, tokenize, uniqueWords } from '@/components/lookup/tokenize';

describe('tokenize', () => {
  it('emits every character exactly once, in order', () => {
    const input = "Well-known l'eau, don’t (stop)! 3.14";
    expect(
      tokenize(input)
        .map((t) => t.text)
        .join(''),
    ).toBe(input);
  });

  it('keeps apostrophes and hyphens inside a word', () => {
    const words = tokenize("peut-être l'eau don’t")
      .filter((t) => t.word)
      .map((t) => t.text);
    expect(words).toEqual(['peut-être', "l'eau", 'don’t']);
  });

  it('splits Han text one character at a time but keeps mixed tokens apart', () => {
    const words = tokenize('iPhone手机')
      .filter((t) => t.word)
      .map((t) => t.text);
    expect(words).toEqual(['iPhone', '手', '机']);
  });

  it('cleans joiners off the edges of a looked-up word only', () => {
    expect(cleanWord("-pen-")).toBe('pen');
    expect(cleanWord("'l'eau'")).toBe("l'eau");
    expect(cleanWord('well-known')).toBe('well-known');
  });

  it('splits sentences without cutting 3.14 or abbreviations followed by a word', () => {
    expect(splitSentences('It costs 3.14 dollars. Is it cheap? Yes!')).toEqual([
      'It costs 3.14 dollars.',
      'Is it cheap?',
      'Yes!',
    ]);
  });

  it('breaks an over-long un-punctuated run at spaces', () => {
    const long = Array.from({ length: 120 }, () => 'word').join(' ');
    const parts = splitSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 320)).toBe(true);
  });

  it('splits paragraphs on blank lines only', () => {
    expect(splitParagraphs('one\ntwo\n\nthree')).toEqual(['one\ntwo', 'three']);
  });

  it('lists distinct lower-cased words in first-appearance order', () => {
    expect(uniqueWords('The cat. the Dog, a cat')).toEqual(['the', 'cat', 'dog', 'a']);
  });
});
