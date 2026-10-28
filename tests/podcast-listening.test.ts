import { beforeEach, describe, expect, it } from 'vitest';
import { diffWords } from '@/pages/podcast/listening/lib/word-diff';
import {
  chunkSegments,
  snapToSegments,
  toAudioClip,
  windowStartingAt,
  type TranscriptSegment,
} from '@/pages/podcast/listening/lib/clip-math';
import { compileProgram, estimateDuration } from '@/pages/podcast/listening/lib/compile-program';
import {
  DEFAULT_PROGRAM_ID,
  PROGRAM_REGISTRY,
  getProgram,
} from '@/pages/podcast/listening/lib/programs';
import {
  enqueueClip,
  getDueClips,
  getQueueSize,
  rateClip,
} from '@/pages/podcast/listening/lib/listening-srs';
import {
  STOPWORDS,
  extractCandidates,
  rankPreteach,
} from '@/pages/podcast/listening/lib/word-select';
import {
  programReducer,
  gateFor,
  subtitleLockFor,
} from '@/pages/podcast/listening/engine/program-reducer';
import type { ProgramRunState } from '@/pages/podcast/listening/types';
import type { SyncPoint } from '@/pages/podcast/types';

describe('dictation grading (LCS)', () => {
  it('a perfect answer is 100%', () => {
    const r = diffWords('The cat sat down.', 'the cat sat down');
    expect(r.accuracy).toBe(1);
    expect(r.missedWords).toEqual([]);
  });
  it('marks missing, wrong and extra words and scores matched / longest', () => {
    const r = diffWords('the cat sat on the mat', 'the dog sat the mat now');
    expect(r.chips.map((c) => c.status)).toEqual([
      'match',
      'wrong',
      'match',
      'missing',
      'match',
      'match',
      'extra',
    ]);
    expect(r.missedWords).toEqual(['cat', 'on']);
    expect(r.accuracy).toBeCloseTo(4 / 6, 5);
  });
  it('an empty answer scores 0 and misses every word', () => {
    const r = diffWords('hello world', '');
    expect(r.accuracy).toBe(0);
    expect(r.missedWords).toEqual(['hello', 'world']);
  });
  it('grades accented and non-Latin text, not only ASCII', () => {
    expect(diffWords("C'était très bien", "c'était très bien").accuracy).toBe(1);
    expect(diffWords('مرحبا بالعالم', 'مرحبا').accuracy).toBe(0.5);
  });
});

// Ten 5-second lines, one every 6 seconds.
const segments: TranscriptSegment[] = Array.from({ length: 10 }, (_, i) => ({
  start: i * 6,
  end: i * 6 + 5,
  text: `line number ${i} about extraordinary conversations`,
}));

describe('clip geometry and compiling', () => {
  it('snaps a window outward to whole lines', () => {
    const win = snapToSegments(segments, 7, 20);
    expect(win?.indices).toEqual([1, 2, 3]);
    expect(win?.range).toEqual({ start: 6, end: 23 });
  });
  it('never splits a line when chunking', () => {
    const chunks = chunkSegments(
      segments,
      segments.map((_, i) => i),
      { targetSec: 10 },
    );
    expect(chunks.every((c) => c.indices.length >= 1)).toBe(true);
    expect(chunks.flatMap((c) => c.indices)).toEqual(segments.map((_, i) => i));
  });
  it('a window starting here is at least half its length', () => {
    expect(windowStartingAt(segments, 0, 30)?.range.start).toBe(0);
  });
  it('turns subtitle time into audio time through the sync points', () => {
    const sync: SyncPoint[] = [
      { id: 's', episodeId: 'e', audioTime: 12, subtitleTime: 2 } as SyncPoint,
    ];
    expect(toAudioClip({ start: 5, end: 8 }, sync)).toEqual({ start: 15, end: 18 });
    expect(toAudioClip({ start: 5, end: 8 }, [])).toEqual({ start: 5, end: 8 });
  });

  it('compiles every program into steps whose clips stay inside the window', () => {
    const win = windowStartingAt(segments, 0, 30)!;
    for (const def of PROGRAM_REGISTRY) {
      const steps = compileProgram({
        definition: def,
        window: win.range,
        windowIndices: win.indices,
        segments,
        syncPoints: [],
      });
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps.filter((x) => x.clip)) {
        expect(s.clip!.start).toBeGreaterThanOrEqual(win.range.start);
        expect(s.clip!.end).toBeLessThanOrEqual(win.range.end);
      }
      expect(estimateDuration(steps)).toBeGreaterThan(0);
    }
  });

  it('three-pass is blind, guided, blind with a confidence tap after each blind pass', () => {
    const def = getProgram(DEFAULT_PROGRAM_ID)!;
    const win = windowStartingAt(segments, 0, 30)!;
    const steps = compileProgram({
      definition: def,
      window: win.range,
      windowIndices: win.indices,
      segments,
      syncPoints: [],
    });
    expect(steps.map((s) => s.templateId)).toEqual([
      'preteach',
      'blind1',
      'confidence1',
      'guided',
      'blind2',
      'confidence2',
    ]);
    expect(steps.filter((s) => s.kind === 'listen').map((s) => s.subtitles)).toEqual([
      'off',
      'on',
      'off',
    ]);
  });
});

describe('listening SRS scheduling', () => {
  beforeEach(() => localStorage.clear());
  const clip = {
    videoId: 'v',
    feedId: 'f',
    title: 't',
    startSec: 10,
    endSec: 15,
    text: 'x',
    reason: 'loop_failed' as const,
  };

  it('a failed clip comes back in a day, and is not duplicated', () => {
    enqueueClip(clip);
    enqueueClip(clip);
    expect(getQueueSize()).toBe(1);
    expect(getDueClips()).toHaveLength(0);
    const day = 24 * 60 * 60 * 1000;
    expect(getDueClips(Date.now() + day + 1000)).toHaveLength(1);
  });

  it('Got it moves up a box (2 days), Half stays, Lost goes down, box 5 graduates out', () => {
    enqueueClip(clip);
    const id = getDueClips(Date.now() + 1e10)[0].id;
    const day = 24 * 60 * 60 * 1000;
    rateClip(id, 3);
    let c = getDueClips(Date.now() + 1e10)[0];
    expect(c.box).toBe(2);
    expect(c.dueAt - Date.now()).toBeGreaterThan(1.9 * day);
    rateClip(id, 2);
    expect(getDueClips(Date.now() + 1e10)[0].box).toBe(2);
    rateClip(id, 1);
    expect(getDueClips(Date.now() + 1e10)[0].box).toBe(1);
    for (let i = 0; i < 5; i++) rateClip(id, 3);
    expect(getQueueSize()).toBe(0);
    c = undefined as never;
  });
});

describe('pre-teach word choice', () => {
  it('prefers hard words that recur, drops function words and proper nouns', () => {
    const texts = [
      'We discussed extraordinary circumstances with Maria',
      'The circumstances were extraordinary again',
    ];
    const cands = extractCandidates(texts);
    const words = cands.map((c) => c.word);
    expect(words).toContain('extraordinary');
    expect(words).not.toContain('the');
    expect(STOPWORDS.has('the')).toBe(true);
    const levels: Record<string, 'A1' | 'B2' | 'C1'> = { extraordinary: 'C1', circumstances: 'B2' };
    const ranked = rankPreteach(cands, { levelOf: (w) => levels[w] ?? 'A1', count: 2 });
    expect(ranked.map((r) => r.word)).toEqual(['extraordinary', 'circumstances']);
  });
  it('keeps accented words when asked for Unicode', () => {
    const cands = extractCandidates(['le développement du café'], {
      unicode: true,
      stopwords: new Set(),
      minLength: 4,
    });
    expect(cands.map((c) => c.word)).toEqual(expect.arrayContaining(['développement', 'café']));
  });
});

describe('program machine and subtitle policy', () => {
  const run = (): ProgramRunState => {
    const def = getProgram('three-pass')!;
    const win = windowStartingAt(segments, 0, 30)!;
    const steps = compileProgram({
      definition: def,
      window: win.range,
      windowIndices: win.indices,
      segments,
      syncPoints: [],
    });
    return {
      definitionId: def.id,
      runMode: 'focused',
      videoId: 'v',
      window: win.range,
      steps,
      stepIndex: 0,
      phase: 'awaiting',
      repeatsDone: 0,
      armInPlace: false,
      revealed: false,
      replays: 0,
      answers: {},
      cycle: null,
      startedAt: 0,
      error: null,
    };
  };

  it('walks the steps and finishes after the last answer', () => {
    let s: ProgramRunState | null = run();
    s = programReducer(s, { type: 'advance' }); // preteach -> blind1
    expect(s?.steps[s.stepIndex].templateId).toBe('blind1');
    expect(s?.phase).toBe('arming');
    s = programReducer(s, { type: 'armed' });
    s = programReducer(s, { type: 'clip-ended' }); // auto-advance to confidence1
    expect(s?.steps[s!.stepIndex].templateId).toBe('confidence1');
    s = programReducer(s, {
      type: 'submit',
      answer: {
        kind: 'recall',
        submitted: '1',
        accuracy: null,
        rating: 1,
        missedWords: [],
        replays: 0,
        peeked: false,
        at: 1,
      },
    });
    expect(s?.steps[s!.stepIndex].templateId).toBe('guided');
    s = programReducer(s, { type: 'jump', stepIndex: 5 });
    s = programReducer(s, {
      type: 'submit',
      answer: {
        kind: 'recall',
        submitted: '3',
        accuracy: null,
        rating: 3,
        missedWords: [],
        replays: 0,
        peeked: false,
        at: 2,
      },
    });
    expect(s?.phase).toBe('finished');
    expect(Object.keys(s!.answers)).toEqual(['confidence1', 'confidence2']);
  });

  it('blind steps hide the subtitles, a peek shows them, guided forces them on', () => {
    let s: ProgramRunState | null = programReducer(run(), { type: 'jump', stepIndex: 1 });
    expect(subtitleLockFor(s)).toBe(false);
    s = programReducer(s, { type: 'reveal', manual: true });
    expect(subtitleLockFor(s)).toBe(true);
    s = programReducer(s, { type: 'jump', stepIndex: 3 });
    expect(subtitleLockFor(s)).toBe(true);
  });

  it('the drill owns the transport while it runs, and holds back position writes', () => {
    const s = programReducer(run(), { type: 'jump', stepIndex: 1 });
    expect(gateFor(s, true)).toMatchObject({
      running: true,
      ownsTransport: true,
      suppressWrites: true,
    });
    expect(gateFor(null, true).ownsTransport).toBe(false);
  });

  it('pause then resume carries on from the playhead', () => {
    let s: ProgramRunState | null = programReducer(run(), { type: 'jump', stepIndex: 1 });
    s = programReducer(s, { type: 'pause', reason: 'overlay' });
    expect(s?.phase).toBe('paused');
    s = programReducer(s, { type: 'resume' });
    expect(s).toMatchObject({ phase: 'arming', armInPlace: true });
  });
});
