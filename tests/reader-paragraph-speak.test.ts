import { describe, expect, it } from 'vitest';
import { paragraphChunks } from '../src/components/lookup/ParagraphSpeakButton';

describe('paragraph read-aloud chunks', () => {
  it('packs whole sentences up to the voice limit, in order', () => {
    const s = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here and it is a little longer than before.`);
    const chunks = paragraphChunks(s);
    expect(chunks.join(' ')).toBe(s.join(' '));
    expect(chunks.every((c) => c.length <= 440)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('cuts one run-on sentence at a space, never mid-word', () => {
    const long = Array.from({ length: 120 }, () => 'word').join(' ');
    const chunks = paragraphChunks([long]);
    expect(chunks.every((c) => c.length <= 440 && !c.startsWith(' ') && !c.endsWith(' '))).toBe(true);
    expect(chunks.join(' ')).toBe(long);
  });

  it('a short paragraph is one piece', () => {
    expect(paragraphChunks(['Hello there.', 'How are you?'])).toEqual(['Hello there. How are you?']);
  });
});
