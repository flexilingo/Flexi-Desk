import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  atPageEnd,
  firstMove,
  nextMove,
  pagePieces,
  pieceAfter,
  pieceFrom,
  type ListenFacts,
} from '@/pages/reader/text/listen-sequence';
import { speak, speakThrough, stop, type VoiceLike } from '@/lib/speech';

const PRO: ListenFacts = { hasNext: true, signedIn: true, pro: true };
const FREE: ListenFacts = { hasNext: true, signedIn: true, pro: false };
const SIGNED_OUT: ListenFacts = { hasNext: true, signedIn: false, pro: false };

describe('a page as the voice reads it', () => {
  it('one entry per paragraph on screen, in the paragraph speaker’s pieces', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1} of a long paragraph in Toronto.`).join(' ');
    const pieces = pagePieces(`First one. Still first.\n\n${long}\n\nLast.`);
    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toEqual(['First one. Still first.']);
    expect(pieces[1].length).toBeGreaterThan(1);
    expect(pieces[1].join(' ')).toBe(long);
    expect(pieces[2]).toEqual(['Last.']);
  });

  it('goes piece by piece, then paragraph by paragraph, skipping ones with nothing to say', () => {
    const pieces = [['a1', 'a2'], [], ['c1']];
    expect(pieceFrom(pieces, { paragraph: 0, chunk: 0 })).toEqual({ paragraph: 0, chunk: 0 });
    expect(pieceAfter(pieces, { paragraph: 0, chunk: 0 })).toEqual({ paragraph: 0, chunk: 1 });
    expect(pieceAfter(pieces, { paragraph: 0, chunk: 1 })).toEqual({ paragraph: 2, chunk: 0 });
    expect(pieceAfter(pieces, { paragraph: 2, chunk: 0 })).toBeNull();
    expect(pieceFrom([[], []], { paragraph: 0, chunk: 0 })).toBeNull();
  });
});

describe('the end of a page', () => {
  it('the last page ends the reading (the next-episode button is there)', () => {
    for (const f of [PRO, FREE, SIGNED_OUT]) {
      expect(atPageEnd({ ...f, hasNext: false })).toEqual({ kind: 'stop', reason: 'end' });
    }
  });

  it('Pro turns to the next page by itself', () => {
    expect(atPageEnd(PRO)).toEqual({ kind: 'turn' });
  });

  it('a signed-in reader without Pro is offered Pro; a signed-out reader is asked to sign in first', () => {
    expect(atPageEnd(FREE)).toEqual({ kind: 'stop', reason: 'pro' });
    expect(atPageEnd(SIGNED_OUT)).toEqual({ kind: 'stop', reason: 'signIn' });
    // Even with Pro set, no account means signing in comes first.
    expect(atPageEnd({ hasNext: true, signedIn: false, pro: true })).toEqual({ kind: 'stop', reason: 'signIn' });
  });
});

describe('the next move', () => {
  const pieces = [['a1', 'a2'], ['b1']];

  it('reading the page on screen is free for everyone', () => {
    for (const f of [SIGNED_OUT, FREE, PRO]) {
      expect(firstMove(pieces, { paragraph: 0, chunk: 0 }, f)).toEqual({
        kind: 'speak',
        at: { paragraph: 0, chunk: 0 },
      });
    }
  });

  it('after a piece that ran to its end: the next piece, then the page-end rule', () => {
    expect(nextMove(pieces, { paragraph: 0, chunk: 0 }, 'ended', FREE)).toEqual({
      kind: 'speak',
      at: { paragraph: 0, chunk: 1 },
    });
    expect(nextMove(pieces, { paragraph: 0, chunk: 1 }, 'ended', FREE)).toEqual({
      kind: 'speak',
      at: { paragraph: 1, chunk: 0 },
    });
    expect(nextMove(pieces, { paragraph: 1, chunk: 0 }, 'ended', PRO)).toEqual({ kind: 'turn' });
    expect(nextMove(pieces, { paragraph: 1, chunk: 0 }, 'ended', FREE)).toEqual({ kind: 'stop', reason: 'pro' });
    expect(nextMove(pieces, { paragraph: 1, chunk: 0 }, 'ended', SIGNED_OUT)).toEqual({
      kind: 'stop',
      reason: 'signIn',
    });
  });

  it('something else speaking, or no voice at all, stops the reading', () => {
    expect(nextMove(pieces, { paragraph: 0, chunk: 0 }, 'cut', PRO)).toEqual({ kind: 'stop', reason: 'interrupted' });
    expect(nextMove(pieces, { paragraph: 0, chunk: 0 }, 'unavailable', PRO)).toEqual({
      kind: 'stop',
      reason: 'silent',
    });
  });

  it('resume says the interrupted piece again; an empty page goes straight to the page-end rule', () => {
    expect(firstMove(pieces, { paragraph: 0, chunk: 1 }, PRO)).toEqual({ kind: 'speak', at: { paragraph: 0, chunk: 1 } });
    expect(firstMove([], { paragraph: 0, chunk: 0 }, PRO)).toEqual({ kind: 'turn' });
  });
});

describe('speakThrough: did the piece run to its end?', () => {
  const voices: VoiceLike[] = [{ name: 'Alex', lang: 'en-US', localService: true, default: true }];
  let utterances: Array<{ text: string; onstart?: () => void; onend?: () => void }> = [];

  beforeEach(() => {
    utterances = [];
    class Utterance {
      lang = '';
      voice: unknown;
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        getVoices: () => voices,
        speak: (u: Utterance) => utterances.push(u),
      },
    });
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it('ended: it was heard to the end', async () => {
    const done = speakThrough('Good morning.', 'en');
    utterances[0].onstart?.();
    utterances[0].onend?.();
    expect(await done).toBe('ended');
  });

  it('cut: anything else speaking takes the voice', async () => {
    const done = speakThrough('Good morning.', 'en');
    utterances[0].onstart?.();
    void speak('word', 'en');
    expect(await done).toBe('cut');
  });

  it('cut: stop pressed anywhere', async () => {
    const done = speakThrough('Good morning.', 'en');
    stop();
    expect(await done).toBe('cut');
  });

  it('unavailable: no sound ever came out', async () => {
    const done = speakThrough('Good morning.', 'en');
    utterances[0].onend?.();
    expect(await done).toBe('unavailable');
  });
});
