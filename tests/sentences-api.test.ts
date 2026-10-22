import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeServer, type ServerOptions } from './helpers/sentencesServer';

const supabaseCall = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import * as api from '@/pages/sentences/lib/api';
import { NotReadyError, SentencesError } from '@/pages/sentences/lib/api';

function serve(opts: ServerOptions = {}) {
  const server = makeServer(opts);
  supabaseCall.mockReset();
  supabaseCall.mockImplementation((method: string, path: string, body?: Record<string, unknown>) => server.handler(method, path, body));
  return server;
}

beforeEach(() => serve());

describe('talking to sentences-app', () => {
  it('goes to the signed-in function, never to the internal-key one', async () => {
    const server = serve();
    await api.getMeta('fr', 'en', {});
    await api.deal({ lang: 'fr', locale: 'en', state: { level: 'A1' } });
    for (const [, path] of supabaseCall.mock.calls) expect(String(path)).toMatch(/^\/sentences-app\?action=/);
    expect(server.calls.map((c) => c.action)).toEqual(['meta', 'deal']);
  });

  it('meta: the learner\'s language when it has sentences, English until then — and says which', async () => {
    const server = serve({ pendingLocales: ['fa'] });
    const res = await api.getMeta('fr', 'fa', {});
    expect(res.explain).toBe('en');
    expect(server.calls.map((c) => c.query.get('locale'))).toEqual(['fa', 'en']);
    expect((await api.getMeta('fr', 'en', {})).explain).toBe('en');
  });

  it('meta: English itself pending is a real error, not a loop', async () => {
    serve({ pendingLocales: ['en'] });
    await expect(api.getMeta('fr', 'en', {})).rejects.toMatchObject({ code: 'PENDING_LOCALE' });
  });

  it('meta carries the picks as state', async () => {
    const server = serve();
    await api.getMeta('fr', 'en', { level: 'A2', dir: 'produce' });
    expect(JSON.parse(server.calls[0].query.get('state')!)).toEqual({ level: 'A2', dir: 'produce' });
  });
});

describe('a server without the desktop additions', () => {
  it('meta without `api` is "coming with the next server update", not a failure', async () => {
    serve({ api: null });
    await expect(api.getMeta('fr', 'en', {})).rejects.toBeInstanceOf(NotReadyError);
  });

  it('meta from api level 1 likewise', async () => {
    serve({ api: 1 });
    await expect(api.getMeta('fr', 'en', {})).rejects.toBeInstanceOf(NotReadyError);
  });

  it('an unknown action (400 INVALID_ACTION) is the same calm state', async () => {
    serve({ api: 1 });
    await expect(api.retry('fr', 'tok')).rejects.toBeInstanceOf(NotReadyError);
    await expect(api.settle('fr', 'tok', 'x', 'wrong', null, 0)).rejects.toBeInstanceOf(NotReadyError);
  });

  it('a gateway 404 with no code of ours (function not there at all) is the same calm state', async () => {
    supabaseCall.mockReset();
    supabaseCall.mockRejectedValue(JSON.stringify({ status: 404, error: 'Function not found', code: '' }));
    await expect(api.getMeta('fr', 'en', {})).rejects.toBeInstanceOf(NotReadyError);
  });

  it('a 404 WITH a code is a normal refusal (a sentence not written in this language is NOT_FOUND)', async () => {
    supabaseCall.mockReset();
    supabaseCall.mockRejectedValue(JSON.stringify({ status: 404, error: 'NOT_FOUND', code: 'NOT_FOUND' }));
    await expect(api.reveal('fr', 'en', 'tok')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('errors keep their code for the screen to translate', () => {
  it('quota and limits', async () => {
    for (const code of ['QUOTA_USER', 'QUOTA_IP', 'TOO_FAST', 'RATE_LIMITED', 'NOT_DEALT']) {
      supabaseCall.mockReset();
      supabaseCall.mockRejectedValue(JSON.stringify({ status: 429, error: code, code }));
      await expect(api.deal({ lang: 'fr', locale: 'en', state: {} })).rejects.toMatchObject({ code });
    }
  });

  it('a network failure has its own code', async () => {
    supabaseCall.mockReset();
    supabaseCall.mockRejectedValue('API request failed: error sending request');
    await expect(api.getStats('fr', 'A1', 'general')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('a 401 is AUTH_REQUIRED, anything unlabelled is UNKNOWN_ERROR', async () => {
    supabaseCall.mockReset();
    supabaseCall.mockRejectedValue(JSON.stringify({ status: 401, error: 'Authentication required', code: '' }));
    await expect(api.getStats('fr', 'A1', 'general')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    supabaseCall.mockRejectedValue(JSON.stringify({ status: 500, error: 'boom', code: '' }));
    await expect(api.getStats('fr', 'A1', 'general')).rejects.toBeInstanceOf(SentencesError);
  });

  it('TOO_FAST on a reveal is waited out once, not shown', async () => {
    vi.useFakeTimers();
    let n = 0;
    supabaseCall.mockReset();
    supabaseCall.mockImplementation(async () => {
      if (n++ === 0) throw JSON.stringify({ status: 429, error: 'TOO_FAST', code: 'TOO_FAST' });
      return { sentence: { id: 1 }, rules: [] };
    });
    const pending = api.revealPatiently('fr', 'en', 'tok');
    await vi.advanceTimersByTimeAsync(1200);
    await expect(pending).resolves.toMatchObject({ sentence: { id: 1 } });
    expect(n).toBe(2);
    vi.useRealTimers();
  });
});

describe('request shapes', () => {
  it('a written answer is deferred and carries its retry round', async () => {
    const server = serve();
    const deal = await api.deal({ lang: 'fr', locale: 'en', state: { dir: 'produce' } });
    if (deal.status !== 'card') throw new Error('no card');
    await api.answerWritten('fr', 'en', deal.token, 'x', 2);
    expect(server.calls.at(-1)!.body).toMatchObject({ defer: true, retry: 2, answer: 'x' });
  });

  it('settle sends the scorecard only when there is one', async () => {
    const server = serve();
    const deal = await api.deal({ lang: 'fr', locale: 'en', state: { dir: 'produce' } });
    if (deal.status !== 'card') throw new Error('no card');
    await api.settle('fr', deal.token, 'x', 'wrong', null, 0);
    expect(server.calls.at(-1)!.body).not.toHaveProperty('judgement');
    expect(server.calls.at(-1)!.body).not.toHaveProperty('retry');
  });

  it('the audio path is the sealed token, never text', () => {
    expect(api.audioPath('fr', 'abc')).toBe('/sentences-app?action=audio&lang=fr&token=abc');
  });
});
