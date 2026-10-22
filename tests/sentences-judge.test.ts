import { describe, it, expect, vi } from 'vitest';
import { canJudge, finalGrade, judgeSentence } from '@/pages/sentences/lib/judge';
import type { AiSource } from '@/lib/aiSource';
import type { Scorecard } from '@/pages/sentences/lib/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const own: AiSource = { kind: 'own', origin: 'device', provider: 'ollama', model: 'llama3.2' };
const unconfigured: AiSource = { kind: 'unconfigured', provider: 'ollama', reason: 'local_not_running' };
const cloud: AiSource = { kind: 'cloud', origin: 'cloud' };

const card = (over: Partial<Scorecard> = {}): Scorecard => ({
  accepted: true,
  score: 90,
  criteria: { meaning: true, grammar: true, spelling: 'ok', elision: null },
  hints: {},
  ...over,
});

describe('the answer judge runs on the learner\'s own AI', () => {
  it('asks the learner\'s AI, and returns its scorecard', async () => {
    const ask = vi.fn(async () => card());
    const out = await judgeSentence(own, 'fr', 'Je suis étudiant.', 'Je suis un étudiant', ask);
    expect(ask).toHaveBeenCalledWith('fr', 'Je suis étudiant.', 'Je suis un étudiant');
    expect(out).toEqual({ kind: 'judged', card: card() });
  });

  it('not set up: nothing is asked, and the screen is told to show the setup card', async () => {
    const ask = vi.fn();
    expect(await judgeSentence(unconfigured, 'fr', 'a', 'b', ask)).toEqual({ kind: 'not_set_up' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('never falls back to the cloud: a cloud-only source asks nobody', async () => {
    const ask = vi.fn();
    expect(canJudge(cloud)).toBe(false);
    expect(await judgeSentence(cloud, 'fr', 'a', 'b', ask)).toEqual({ kind: 'unavailable' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('still checking the facts: nothing is asked yet', async () => {
    const ask = vi.fn();
    expect(await judgeSentence({ kind: 'checking' }, 'fr', 'a', 'b', ask)).toEqual({ kind: 'unavailable' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('an empty answer is not worth a call', async () => {
    const ask = vi.fn();
    expect(await judgeSentence(own, 'fr', 'a', '   ', ask)).toEqual({ kind: 'skipped' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('the model not running is a setup problem; any other failure is "could not be asked"', async () => {
    expect(await judgeSentence(own, 'fr', 'a', 'b', async () => { throw 'OLLAMA_NOT_RUNNING'; })).toEqual({ kind: 'not_set_up' });
    expect(await judgeSentence(own, 'fr', 'a', 'b', async () => { throw 'AI_KEY_MISSING'; })).toEqual({ kind: 'not_set_up' });
    expect(await judgeSentence(own, 'fr', 'a', 'b', async () => { throw new Error('boom'); })).toEqual({ kind: 'unavailable' });
  });

  it('a reply that is not a scorecard is not trusted', async () => {
    expect(await judgeSentence(own, 'fr', 'a', 'b', (async () => ({ nope: true })) as never)).toEqual({ kind: 'unavailable' });
  });

  it('the static grade stands unless the AI judged', () => {
    const base = { verdict: 'wrong' as const, diff: [] };
    expect(finalGrade(base, { kind: 'not_set_up' })).toBe(base);
    expect(finalGrade(base, { kind: 'unavailable' })).toBe(base);
    expect(finalGrade(base, { kind: 'judged', card: card() }).verdict).toBe('variant');
  });
});
