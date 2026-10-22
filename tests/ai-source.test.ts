import { describe, it, expect } from 'vitest';
import {
  cloudAiAllowed,
  isAiSetupError,
  resolveAiSource,
  routeOf,
  type AiFacts,
} from '@/lib/aiSource';

const base: AiFacts = {
  loaded: true,
  provider: 'ollama',
  model: null,
  hasCredentials: false,
  local: { installed: true, running: true, models: ['llama3.2:latest'] },
  cloudOptIn: false,
  signedIn: false,
  tier: null,
  tierKnown: true,
};
const facts = (over: Partial<AiFacts> = {}): AiFacts => ({ ...base, ...over });

describe('AI source policy', () => {
  it('waits while settings or the local engine are still being read', () => {
    expect(resolveAiSource(facts({ loaded: false })).kind).toBe('checking');
    expect(resolveAiSource(facts({ local: null })).kind).toBe('checking');
  });

  it('defaults to the on-device model when it is ready', () => {
    expect(resolveAiSource(facts())).toEqual({ kind: 'own', origin: 'device', provider: 'ollama', model: 'llama3.2' });
  });

  it('uses the user\'s own key when that is the chosen provider', () => {
    const s = resolveAiSource(facts({ provider: 'openai', model: 'gpt-4o-mini', hasCredentials: true, local: null }));
    expect(s).toEqual({ kind: 'own', origin: 'own_key', provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('a paid, signed-in user is NOT routed to the cloud unless they switched it on', () => {
    const s = resolveAiSource(facts({ signedIn: true, tier: 'pro' }));
    expect(s.kind).toBe('own');
    expect(routeOf(s)).toBe('local');
  });

  it('cloud needs all three: switched on, signed in, paid', () => {
    expect(cloudAiAllowed({ cloudOptIn: true, signedIn: true, tier: 'pro' })).toBe(true);
    expect(cloudAiAllowed({ cloudOptIn: false, signedIn: true, tier: 'pro' })).toBe(false);
    expect(cloudAiAllowed({ cloudOptIn: true, signedIn: false, tier: 'pro' })).toBe(false);
    expect(cloudAiAllowed({ cloudOptIn: true, signedIn: true, tier: 'free' })).toBe(false);
    expect(cloudAiAllowed({ cloudOptIn: true, signedIn: true, tier: null })).toBe(false);
    const s = resolveAiSource(facts({ cloudOptIn: true, signedIn: true, tier: 'lifetime' }));
    expect(s).toEqual({ kind: 'cloud', origin: 'cloud' });
    expect(routeOf(s)).toBe('cloud');
  });

  it('switched on but not entitled stays on the user\'s own AI', () => {
    expect(resolveAiSource(facts({ cloudOptIn: true, signedIn: false })).kind).toBe('own');
    expect(resolveAiSource(facts({ cloudOptIn: true, signedIn: true, tier: 'free' })).kind).toBe('own');
  });

  it('waits for the plan before deciding when the switch is on and signed in', () => {
    expect(resolveAiSource(facts({ cloudOptIn: true, signedIn: true, tierKnown: false })).kind).toBe('checking');
  });

  it('never falls back to the cloud when the user\'s AI is not ready', () => {
    const paid = { signedIn: true, tier: 'pro' };
    expect(resolveAiSource(facts({ ...paid, local: { installed: false, running: false, models: [] } }))).toEqual({
      kind: 'unconfigured',
      provider: 'ollama',
      reason: 'local_not_installed',
    });
    expect(resolveAiSource(facts({ ...paid, local: { installed: true, running: false, models: [] } }))).toMatchObject({
      reason: 'local_not_running',
    });
    expect(resolveAiSource(facts({ ...paid, local: { installed: true, running: true, models: [] } }))).toMatchObject({
      reason: 'local_no_model',
    });
    expect(resolveAiSource(facts({ ...paid, model: 'mistral', local: { installed: true, running: true, models: ['llama3.2'] } }))).toMatchObject({
      reason: 'local_model_missing',
    });
    expect(resolveAiSource(facts({ ...paid, provider: 'anthropic', local: null }))).toEqual({
      kind: 'unconfigured',
      provider: 'anthropic',
      reason: 'key_missing',
    });
  });

  it('a selected model matches its installed name with or without :latest', () => {
    const s = resolveAiSource(facts({ model: 'llama3.2', local: { installed: true, running: true, models: ['llama3.2:latest'] } }));
    expect(s.kind).toBe('own');
  });

  it('recognises the errors that mean "set up your AI"', () => {
    expect(isAiSetupError('OLLAMA_NOT_RUNNING')).toBe(true);
    expect(isAiSetupError(new Error('OLLAMA_MODEL_MISSING'))).toBe(true);
    expect(isAiSetupError('AI_KEY_MISSING')).toBe(true);
    expect(isAiSetupError('UNIQUE constraint failed')).toBe(false);
  });
});
