import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESTART_WINDOW_MS,
  afterSentence,
  atPageEnd,
  clampSentence,
  firstMove,
  listenEstimate,
  nextRate,
  pageSentences,
  parseListenPlace,
  sentenceOfParagraph,
  stepNext,
  stepPrev,
  type ListenFacts,
} from '@/pages/reader/text/listen-sequence';
import { listenKeyOf } from '@/pages/reader/listen/use-listen-keys';
import { speak, speakThrough, stop, type VoiceLike } from '@/lib/speech';
import { splitParagraphs, splitSentences } from '@/components/lookup/tokenize';

const PRO: ListenFacts = { hasNext: true, hasPrev: true, signedIn: true, pro: true };
const FREE: ListenFacts = { hasNext: true, hasPrev: true, signedIn: true, pro: false };
const SIGNED_OUT: ListenFacts = { hasNext: true, hasPrev: false, signedIn: false, pro: false };

const PAGE = 'Margaret arrived at noon. She put the bag down.\n\n"Thirty years," she said. Then she left.';

describe('a page as the player reads it', () => {
  it('sentence by sentence, exactly as the page shows them', () => {
    const sentences = pageSentences(PAGE);
    const shown = splitParagraphs(PAGE).flatMap((p) => splitSentences(p));
    expect(sentences.map((s) => s.text)).toEqual(shown);
    expect(sentences.map((s) => [s.paragraph, s.sentence])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(sentences.every((s) => s.pieces.length === 1 && s.pieces[0] === s.text)).toBe(true);
  });

  it('a run-on sentence is stepped through in the runs the page shows, each short enough for the voice', () => {
    const long = `${Array.from({ length: 120 }, () => 'word').join(' ')}.`;
    const sentences = pageSentences(long);
    expect(sentences.length).toBe(splitSentences(long).length);
    expect(sentences.length).toBeGreaterThan(1);
    expect(sentences.map((s) => s.text).join(' ')).toBe(long);
    expect(sentences.flatMap((s) => s.pieces).every((p) => p.length <= 440)).toBe(true);
  });

  it('«play from here» starts at the paragraph’s first sentence', () => {
    const sentences = pageSentences(PAGE);
    expect(sentenceOfParagraph(sentences, 0)).toBe(0);
    expect(sentenceOfParagraph(sentences, 1)).toBe(2);
    expect(sentenceOfParagraph(sentences, 9)).toBe(3);
  });

  it('a remembered place is kept on the page; «last» is the page’s last sentence', () => {
    expect(clampSentence(7, 4)).toBe(3);
    expect(clampSentence(-2, 4)).toBe(0);
    expect(clampSentence('last', 4)).toBe(3);
    expect(clampSentence(3, 0)).toBe(0);
  });
});

describe('what the listen strip promises', () => {
  it('the page’s sentences, and about how long they take at 150 words a minute', () => {
    const sentence = (i: number) =>
      `Sentence ${i} has exactly the right number of words to make the sums easy, ${'word '.repeat(23).trim()}.`;
    const text = Array.from({ length: 8 }, (_, i) => sentence(i + 1)).join(' ');
    expect(text.split(/\s+/)).toHaveLength(8 * 37);
    expect(listenEstimate(text)).toEqual({ sentences: 8, minutes: 2 });
  });

  it('a short page is still about a minute; an empty one is nothing', () => {
    expect(listenEstimate('Then she left.')).toEqual({ sentences: 1, minutes: 1 });
    expect(listenEstimate('')).toEqual({ sentences: 0, minutes: 0 });
  });

  it('counts words, not dashes or stray punctuation', () => {
    const words = Array.from({ length: 225 }, () => 'word').join(' — ');
    expect(listenEstimate(`${words}.`).minutes).toBe(2);
    expect(listenEstimate(`${words}.`, 75).minutes).toBe(3);
  });
});

describe('after a sentence', () => {
  it('the next sentence, then the page-end rule', () => {
    expect(afterSentence(0, 4, 'ended', false, FREE)).toEqual({ kind: 'speak', index: 1 });
    expect(afterSentence(3, 4, 'ended', false, PRO)).toEqual({ kind: 'turn' });
    expect(afterSentence(3, 4, 'ended', false, FREE)).toEqual({ kind: 'stop', reason: 'pro' });
    expect(afterSentence(3, 4, 'ended', false, SIGNED_OUT)).toEqual({ kind: 'stop', reason: 'signIn' });
    expect(afterSentence(3, 4, 'ended', false, { ...PRO, hasNext: false })).toEqual({ kind: 'stop', reason: 'end' });
  });

  it('repeat says the same sentence again — even the last one, without turning the page', () => {
    expect(afterSentence(1, 4, 'ended', true, PRO)).toEqual({ kind: 'speak', index: 1 });
    expect(afterSentence(3, 4, 'ended', true, PRO)).toEqual({ kind: 'speak', index: 3 });
  });

  it('cut off by another voice, or no voice at all: it stops there (repeat or not)', () => {
    expect(afterSentence(1, 4, 'cut', true, PRO)).toEqual({ kind: 'stop', reason: 'interrupted' });
    expect(afterSentence(1, 4, 'unavailable', false, PRO)).toEqual({ kind: 'stop', reason: 'silent' });
  });

  it('an empty page goes straight to the page-end rule', () => {
    expect(firstMove(0, 0, PRO)).toEqual({ kind: 'turn' });
    expect(firstMove(5, 4, PRO)).toEqual({ kind: 'speak', index: 3 });
  });
});

describe('the page-end rule (Pro)', () => {
  it('the last page ends the reading for everyone', () => {
    for (const f of [PRO, FREE, SIGNED_OUT]) {
      expect(atPageEnd({ ...f, hasNext: false })).toEqual({ kind: 'stop', reason: 'end' });
    }
  });
  it('Pro turns the page; without Pro it is offered; signed out, signing in comes first', () => {
    expect(atPageEnd(PRO)).toEqual({ kind: 'turn' });
    expect(atPageEnd(FREE)).toEqual({ kind: 'stop', reason: 'pro' });
    expect(atPageEnd(SIGNED_OUT)).toEqual({ kind: 'stop', reason: 'signIn' });
    expect(atPageEnd({ ...SIGNED_OUT, pro: true })).toEqual({ kind: 'stop', reason: 'signIn' });
  });
});

describe('next and previous', () => {
  it('next steps a sentence; on the page’s last sentence it follows the page-end rule', () => {
    expect(stepNext(0, 4, FREE)).toEqual({ kind: 'speak', index: 1 });
    expect(stepNext(3, 4, PRO)).toEqual({ kind: 'turn' });
    expect(stepNext(3, 4, FREE)).toEqual({ kind: 'stop', reason: 'pro' });
    expect(stepNext(3, 4, SIGNED_OUT)).toEqual({ kind: 'stop', reason: 'signIn' });
  });

  it('previous within 1.5 s of a sentence’s start goes to the one before', () => {
    expect(stepPrev(2, 0, PRO)).toEqual({ kind: 'speak', index: 1 });
    expect(stepPrev(2, RESTART_WINDOW_MS, PRO)).toEqual({ kind: 'speak', index: 1 });
  });

  it('previous later than 1.5 s into a sentence says it again from its start', () => {
    expect(stepPrev(2, RESTART_WINDOW_MS + 1, PRO)).toEqual({ kind: 'speak', index: 2 });
    expect(stepPrev(0, 4000, FREE)).toEqual({ kind: 'speak', index: 0 });
  });

  it('previous on a page’s first sentence goes back to the page before (free), or stays on the book’s first', () => {
    expect(stepPrev(0, 0, FREE)).toEqual({ kind: 'back' });
    expect(stepPrev(0, 0, SIGNED_OUT)).toEqual({ kind: 'speak', index: 0 });
  });
});

describe('speed and the remembered place', () => {
  it('speed goes round 1 → 1.25 → 0.75 → 1', () => {
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(1.25)).toBe(0.75);
    expect(nextRate(0.75)).toBe(1);
  });

  it('a stored place is read back, junk is not', () => {
    expect(parseListenPlace('{"page":3,"sentence":7}')).toEqual({ page: 3, sentence: 7 });
    expect(parseListenPlace('{"page":0,"sentence":1}')).toBeNull();
    expect(parseListenPlace('nope')).toBeNull();
    expect(parseListenPlace(null)).toBeNull();
  });
});

describe('the player keys', () => {
  const body = document.createElement('div');
  const input = document.createElement('input');
  const inDialog = document.createElement('button');
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.appendChild(inDialog);
  document.body.append(body, input, dialog);

  it('Space, ← → and R anywhere on the page', () => {
    expect(listenKeyOf({ key: ' ', target: body })).toBe('playPause');
    expect(listenKeyOf({ key: 'ArrowLeft', target: body })).toBe('prev');
    expect(listenKeyOf({ key: 'ArrowRight', target: body })).toBe('next');
    expect(listenKeyOf({ key: 'r', target: body })).toBe('repeat');
    expect(listenKeyOf({ key: 'R', target: body })).toBe('repeat');
    expect(listenKeyOf({ key: 'x', target: body })).toBeNull();
  });

  it('never while typing, in a dialog, with a modifier, or once something else took the key', () => {
    expect(listenKeyOf({ key: ' ', target: input })).toBeNull();
    expect(listenKeyOf({ key: 'r', target: inDialog })).toBeNull();
    expect(listenKeyOf({ key: 'ArrowLeft', target: body, metaKey: true })).toBeNull();
    expect(listenKeyOf({ key: ' ', target: body, defaultPrevented: true })).toBeNull();
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
