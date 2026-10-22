import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeServer, type ServerOptions } from './helpers/sentencesServer';

const supabaseCall = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('@/lib/tauri-bridge', () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn(async () => undefined) }));
vi.mock('@/pages/sentences/lib/clip', () => ({ stopClip: vi.fn(), forgetClip: vi.fn(), playClip: vi.fn(), useClipState: vi.fn(), useOpenOnce: vi.fn() }));
vi.mock('@/pages/cheatsheet/lib/service', () => ({ cheatsheet: { getVerbList: vi.fn(async () => ({ data: [{ lemma: 'habiter' }] })) } }));

import { usePracticeStore } from '@/pages/sentences/lib/practiceStore';
import type { AiSource } from '@/lib/aiSource';
import type { Scorecard } from '@/pages/sentences/lib/types';

const own: AiSource = { kind: 'own', origin: 'device', provider: 'ollama', model: 'llama3.2' };
const unconfigured: AiSource = { kind: 'unconfigured', provider: 'ollama', reason: 'local_not_installed' };

let server: ReturnType<typeof makeServer>;

async function boot(opts: ServerOptions = {}, picks: Record<string, string> = {}) {
  server = makeServer(opts);
  supabaseCall.mockReset();
  supabaseCall.mockImplementation((method: string, path: string, body?: Record<string, unknown>) => server.handler(method, path, body));
  usePracticeStore.setState({ lang: null, meta: null, step: { k: 'boot' }, busy: null, outcome: null, warning: null, picks: {} });
  await usePracticeStore.getState().open('fr', 'en', Object.keys(picks).length ? picks : undefined);
  return usePracticeStore;
}

const st = () => usePracticeStore.getState();
const actions = () => server.calls.map((c) => c.action);
const step = <K extends string>(k: K) => {
  const s = st().step;
  if (s.k !== k) throw new Error(`expected step ${k}, got ${s.k}`);
  return s as Extract<typeof s, { k: K }>;
};
const cardOf = (s: { k: string }) => s as never;
void cardOf;

const accepted = (over: Partial<Scorecard> = {}): Scorecard => ({
  accepted: true, score: 90, criteria: { meaning: true, grammar: true, spelling: 'ok', elision: null }, hints: {}, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('opening the page', () => {
  it('loads the panel, deals the first card and reads the learner\'s numbers', async () => {
    await boot();
    expect(actions().slice(0, 2)).toEqual(['meta', 'deal']);
    expect(step('prompt').dealt.dir).toBe('recognize');
    await vi.waitFor(() => expect(st().stats?.practiced).toBe(12));
    await vi.waitFor(() => expect(st().verbPages).toEqual(['habiter']));
  });

  it('a server without the additions leaves the calm state, and no card is dealt', async () => {
    await boot({ api: null });
    expect(st().step.k).toBe('notReady');
    expect(actions()).toEqual(['meta']);
  });

  it('coming back to the page keeps the round where it was left', async () => {
    await boot();
    const token = step('prompt').dealt.token;
    await st().open('fr', 'en');
    expect(step('prompt').dealt.token).toBe(token);
    expect(actions().filter((a) => a === 'deal')).toHaveLength(1);
  });

  it('a card dealt before never leaks the other side: recognition has no meaning, production no sentence', async () => {
    await boot();
    expect(step('prompt').dealt.card.meaning).toBe('');
    await boot({}, { dir: 'produce' });
    const p = step('prompt').dealt;
    expect(p.card.text).toBe('');
    expect(p.card.meaning).not.toBe('');
  });
});

describe('recognize', () => {
  it('prompt → reveal → «I knew it» records once and deals the next card with the outcome on it', async () => {
    await boot();
    const first = step('prompt').dealt.token;
    await st().reveal();
    const r = step('result');
    expect(r.asking).toBe(true);
    expect(r.sentence.text).toContain('habite');
    await st().selfGrade(true);
    expect(server.recorded).toEqual([{ key: first, verdict: 'knew' }]);
    expect(st().score).toEqual({ r: 1, n: 1 });
    expect(st().outcome?.schedule?.correct).toBe(true);
    expect(step('prompt').dealt.token).not.toBe(first);
  });

  it('«I didn\'t know» scores a miss', async () => {
    await boot();
    await st().reveal();
    await st().selfGrade(false);
    expect(st().score).toEqual({ r: 0, n: 1 });
    expect(server.recorded[0].verdict).toBe('missed');
  });

  it('two presses at once do not answer twice', async () => {
    await boot();
    await st().reveal();
    await Promise.all([st().selfGrade(true), st().selfGrade(true)]);
    expect(server.recorded).toHaveLength(1);
  });
});

describe('produce', () => {
  it('an exact answer is recorded by the server and needs no judge', async () => {
    const store = await boot({}, { dir: 'produce' });
    const judge = vi.fn();
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(judge);
    await store.getState().submitWritten("où est-ce qu'il habite", own);
    const r = step('result');
    expect(r.grade?.verdict).toBe('exact');
    expect(judge).not.toHaveBeenCalled();
    expect(actions()).not.toContain('settle');
    expect(st().score).toEqual({ r: 1, n: 1 });
    expect(r.mustRetype).toBe(false);
  });

  it('a wrong answer goes to the learner\'s own AI; its verdict is recorded with its scorecard', async () => {
    const store = await boot({}, { dir: 'produce' });
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string) => (cmd === 'sentences_judge' ? accepted() : null));
    await store.getState().submitWritten('Où habite-il ?', own);
    const r = step('result');
    expect(invoke).toHaveBeenCalledWith('sentences_judge', { lang: 'fr', target: "Où est-ce qu'il habite ?", answer: 'Où habite-il ?' });
    expect(r.grade).toMatchObject({ verdict: 'variant', diff: [] });
    expect(r.grade?.card?.score).toBe(90);
    expect(server.recorded.at(-1)).toMatchObject({ verdict: 'variant', judgement: accepted() });
    expect(st().score).toEqual({ r: 1, n: 1 });
    expect(r.mustRetype).toBe(false);
    expect(r.judgeNote).toBeNull();
  });

  it('the AI rejecting keeps the diff, counts a miss, and the card must be written again', async () => {
    const store = await boot({}, { dir: 'produce' });
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation(async () => accepted({ accepted: false, criteria: { meaning: false, grammar: true, spelling: 'ok', elision: null } }));
    await store.getState().submitWritten('Il habite où', own);
    const r = step('result');
    expect(r.grade?.verdict).toBe('wrong');
    expect(r.grade?.diff.length).toBeGreaterThan(0);
    expect(r.mustRetype).toBe(true);
    expect(st().score).toEqual({ r: 0, n: 1 });
  });

  it('AI not set up: the card\'s own verdict stands, is recorded, and the screen is told why', async () => {
    const store = await boot({}, { dir: 'produce' });
    const { invoke } = await import('@tauri-apps/api/core');
    await store.getState().submitWritten('Il habite où', unconfigured);
    const r = step('result');
    expect(invoke).not.toHaveBeenCalledWith('sentences_judge', expect.anything());
    expect(r.judgeNote).toBe('not_set_up');
    expect(r.grade?.verdict).toBe('wrong');
    expect(server.recorded.at(-1)).toMatchObject({ verdict: 'wrong' });
    expect(server.recorded.at(-1)).not.toHaveProperty('judgement', expect.anything());
  });

  it('AI asked but unreachable: static verdict, a different note', async () => {
    const store = await boot({}, { dir: 'produce' });
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));
    await store.getState().submitWritten('Il habite où', own);
    expect(step('result').judgeNote).toBe('unavailable');
  });

  it('an answer that could not be saved is said, and the verdict stays on screen', async () => {
    const store = await boot({ failAction: 'settle' }, { dir: 'produce' });
    await store.getState().submitWritten('Il habite où', unconfigured);
    expect(step('result').grade?.verdict).toBe('wrong');
    expect(st().warning).toBe('NOT_SAVED');
  });

  it('wrong → next brings the SAME card back as its own attempt, with how it has gone; the retry is recorded as round 1', async () => {
    const store = await boot({}, { dir: 'produce' });
    const firstToken = step('prompt').dealt.token;
    await store.getState().submitWritten('nope', unconfigured);
    await st().next();
    const again = step('prompt');
    expect(again.dealt.token).not.toBe(firstToken);
    expect(again.retry).toEqual({ round: 1, wrong: 1, skipped: 0 });
    expect(again.dealt.card.meaning).toBe(step('prompt').dealt.card.meaning);
    await st().submitWritten("Où est-ce qu'il habite ?", own);
    expect(step('result').grade?.verdict).toBe('exact');
    expect(server.recorded.at(-1)).toMatchObject({ verdict: 'exact', retry: 1 });
    expect(st().score).toEqual({ r: 1, n: 2 });
  });

  it('skipping a wrong sentence is recorded once and deals the next card; the second time it is locked', async () => {
    const store = await boot({ queue: [1, 2] }, { dir: 'produce' });
    await store.getState().submitWritten('nope', unconfigured);
    await st().next();
    expect(step('prompt').retry?.skipped).toBe(0);
    const skippedToken = step('prompt').dealt.token;
    await st().skip();
    expect(server.calls.find((c) => c.action === 'skip')).toMatchObject({ body: { token: skippedToken, round: 1 } });
    expect(step('prompt').retry).toBeNull();
    // The next card was dealt after the skip was recorded.
    const order = actions();
    expect(order.indexOf('skip')).toBeLessThan(order.lastIndexOf('deal'));
  });

  it('an empty answer is graded wrong without asking anyone', async () => {
    const store = await boot({}, { dir: 'produce' });
    const { invoke } = await import('@tauri-apps/api/core');
    await store.getState().submitWritten('   ', own);
    expect(invoke).not.toHaveBeenCalledWith('sentences_judge', expect.anything());
    expect(step('result').grade?.verdict).toBe('wrong');
    expect(server.recorded.at(-1)).toMatchObject({ verdict: 'wrong' });
  });
});

describe('listen', () => {
  it('audio → text (reveal) → «heard» → meaning → «knew» records plays and heard', async () => {
    await boot({}, { dir: 'listen' });
    const d = step('prompt').dealt;
    expect(d.audio).toBe(`audio-${d.token}`);
    expect(d.card.text).toBe('');
    st().countPlay();
    st().countPlay();
    await st().reveal();
    expect(step('listenText').sentence.text).toContain('habite');
    st().hear(false);
    expect(step('result').asking).toBe(true);
    await st().selfGrade(true);
    const answer = server.calls.filter((c) => c.action === 'answer').at(-1)!;
    expect(answer.body).toMatchObject({ verdict: 'knew', plays: 3, heard: false });
    expect(st().outcome?.heard).toBe(false);
  });
});

describe('question and answer', () => {
  it('a matching answer scores and shows the model answers', async () => {
    await boot({}, { dir: 'answer' });
    await st().reveal();
    expect(step('answerStep').sentence.text).toBeTruthy();
    await st().submitQuestion("J'habite à Toronto.", true);
    const r = step('result');
    expect(r.answerGrade?.verdict).toBe('exact');
    expect(r.answers).toHaveLength(1);
    expect(r.asking).toBe(false);
    expect(st().score).toEqual({ r: 1, n: 1 });
  });

  it('an answer no model matches is the learner\'s own call, recorded with it', async () => {
    await boot({}, { dir: 'answer' });
    await st().reveal();
    await st().submitQuestion('Quelque part ailleurs', false);
    expect(step('result').asking).toBe(true);
    expect(st().score).toEqual({ r: 0, n: 0 });
    await st().judgeOwn(true);
    expect(step('result').asking).toBe(false);
    expect(st().score).toEqual({ r: 1, n: 1 });
    expect(server.calls.filter((c) => c.action === 'answer').at(-1)!.body).toMatchObject({ verdict: 'knew', heard: false });
  });
});

describe('settings', () => {
  it('a pick re-reads the panel, keeps or drops the score as the row says, and deals again', async () => {
    await boot();
    await st().reveal();
    await st().selfGrade(true);
    expect(st().score.n).toBe(1);
    const level = st().meta!.sections.find((s) => s.key === 'level')!;
    await st().pick(level, 'A2');
    expect(JSON.parse(server.calls.filter((c) => c.action === 'meta').at(-1)!.query.get('state')!)).toMatchObject({ level: 'A2' });
    expect(st().score).toEqual({ r: 0, n: 0 });
    const unit = st().meta!.sections.find((s) => s.key === 'unit')!;
    await st().reveal();
    await st().selfGrade(true);
    await st().pick(unit, '2');
    expect(st().score.n).toBe(1);
    expect(server.calls.filter((c) => c.action === 'deal').at(-1)!.body!.state).toMatchObject({ unit: '2' });
  });

  it('the language row is never sent as a pick', async () => {
    await boot();
    expect(st().picks).not.toHaveProperty('lang');
  });

  it('«mix» slips a due card in as every third card (after two answers) — only when it is switched on', async () => {
    await boot({}, { mix: '1' });
    for (let i = 0; i < 3; i++) {
      await st().reveal();
      await st().selfGrade(true);
    }
    const deals = server.calls.filter((c) => c.action === 'deal').map((c) => !!c.body!.mix);
    expect(deals).toEqual([false, false, true, false]);
    await boot();
    for (let i = 0; i < 3; i++) {
      await st().reveal();
      await st().selfGrade(true);
    }
    expect(server.calls.filter((c) => c.action === 'deal').some((c) => c.body!.mix)).toBe(false);
  });

  it('«review» with nothing due says so and offers the way back', async () => {
    await boot({}, { order: 'review' });
    await st().reveal();
    await st().selfGrade(true);
    expect(st().step.k).toBe('reviewEmpty');
  });
});

describe('finished', () => {
  it('the level done: start over with the sealed token', async () => {
    await boot({ finishAfter: { n: 1, scope: 'level' } });
    await st().reveal();
    await st().selfGrade(true);
    const f = step('finished');
    expect(f.scope).toBe('level');
    await st().startOver();
    expect(server.calls.find((c) => c.action === 'reset')!.body).toMatchObject({ token: 'reset-token', level: 'A1' });
  });

  it('a unit done: the next unit is offered, and only a unit can be replayed', async () => {
    await boot({ finishAfter: { n: 1, scope: 'unit', nextUnit: 3 } }, { order: 'course', unit: '2' });
    await st().reveal();
    await st().selfGrade(true);
    const f = step('finished');
    expect(f).toMatchObject({ scope: 'unit', nextUnit: 3, unit: 2, replay: 'replay-token', due: 3 });
    await st().replay();
    expect(server.calls.find((c) => c.action === 'replay')!.body).toMatchObject({ token: 'replay-token' });
  });
});

describe('failures are shown, never swallowed', () => {
  it('a refused deal is a notice with a way on', async () => {
    await boot({ failAction: 'deal' });
    expect(st().step).toMatchObject({ k: 'notice', code: 'UNKNOWN_ERROR' });
  });

  it('a refused reveal keeps the card and says why', async () => {
    await boot({ failAction: 'reveal' });
    await st().reveal();
    expect(step('prompt')).toBeTruthy();
    expect(st().warning).toBe('UNKNOWN_ERROR');
    expect(st().busy).toBeNull();
  });
});
