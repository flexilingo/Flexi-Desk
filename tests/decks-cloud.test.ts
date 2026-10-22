import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const supabaseCall = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));
vi.mock('@/lib/tauri-bridge', () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn(async () => {}) }));

import { useAuthStore } from '@/stores/authStore';
import {
  DeckCloudError,
  errorCode,
  isShareActive,
  publishDeck,
  saveToLibrary,
  type PublishStep,
} from '@/pages/review/lib/deckCloud';

const signIn = () =>
  useAuthStore.setState({ session: { access_token: 't', refresh_token: 'r', user_id: 'u', email: 'a@example.com', expires_at: 9e9 } });
const signOut = () => useAuthStore.setState({ session: null });

const rawDeck = (over: Record<string, unknown> = {}) => ({
  id: 'local1',
  name: 'Toronto Words',
  description: null,
  language: 'en',
  native_language: 'fa',
  algorithm: 'fsrs',
  card_count: 2,
  due_today: 0,
  new_cards: 2,
  mastered: 0,
  tags: [],
  is_public: false,
  original_deck_id: null,
  cloud_deck_id: null,
  source_url: null,
  source_type: null,
  source_public: false,
  cover_url: null,
  total_clones: 0,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  ...over,
});

const snapshot = (over: Record<string, unknown> = {}) => ({
  id: 'local1',
  name: 'Toronto Words',
  description: null,
  language: 'en',
  native_language: 'fa',
  tags: [],
  is_public: false,
  source_url: null,
  source_type: null,
  source_public: false,
  cloud_deck_id: null,
  cards: [
    { front: 'streetcar', back: 'a', notes: null },
    { front: 'ferry', back: 'b', notes: null },
  ],
  ...over,
});

/** Route local commands and cloud paths to canned answers; record what was called. */
function wire(opts: { snap?: ReturnType<typeof snapshot>; cloud?: (method: string, path: string, body?: unknown) => unknown }) {
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case 'deck_cloud_snapshot':
        return opts.snap ?? snapshot();
      case 'deck_set_cloud_link':
        return rawDeck({ cloud_deck_id: args.cloudDeckId });
      case 'srs_update_deck':
        return rawDeck({ is_public: args.isPublic ?? false });
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  });
  supabaseCall.mockImplementation(async (method: string, path: string, body?: unknown) => opts.cloud?.(method, path, body));
}
const cloudCalls = () => supabaseCall.mock.calls.map(([m, p]) => `${m} ${String(p).split('?')[0]}${String(p).includes('action=') ? '?' + String(p).split('?')[1] : ''}`);

beforeEach(() => {
  invoke.mockReset();
  supabaseCall.mockReset();
  signIn();
});

describe('publishing a local deck', () => {
  it('needs an account', async () => {
    signOut();
    wire({});
    await expect(publishDeck('local1')).rejects.toMatchObject({ code: 'SIGN_IN_REQUIRED' });
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('refuses an empty deck without calling the website', async () => {
    wire({ snap: snapshot({ cards: [] }) });
    await expect(publishDeck('local1')).rejects.toMatchObject({ code: 'DECK_EMPTY' });
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('first publish: creates the website deck, uploads every card, then saves the link', async () => {
    const steps: PublishStep[] = [];
    wire({ cloud: (m, p) => (p.startsWith('/decks?action=create') ? { id: 'cloud9' } : {}) });
    const res = await publishDeck('local1', { onStep: (s) => steps.push(s) });

    expect(steps).toEqual(['preparing', 'creating', 'uploading', 'done']);
    expect(res).toMatchObject({ cloudDeckId: 'cloud9', created: true, cardsAdded: 2 });
    expect(cloudCalls()).toEqual(['POST /decks?action=create', 'POST /decks?action=bulk-add-cards']);
    const create = supabaseCall.mock.calls[0][2] as Record<string, unknown>;
    expect(create.language_pair).toBe('en-fa');
    const bulk = supabaseCall.mock.calls[1][2] as { deck_id: string; cards: { front_text: string }[] };
    expect(bulk.deck_id).toBe('cloud9');
    expect(bulk.cards.map((c) => c.front_text)).toEqual(['streetcar', 'ferry']);
    expect(invoke).toHaveBeenCalledWith('deck_set_cloud_link', { deckId: 'local1', cloudDeckId: 'cloud9', totalClones: 0 });
  });

  it('a failed upload leaves the deck unlinked, so the next publish starts clean', async () => {
    wire({
      cloud: (m, p) => {
        if (p.startsWith('/decks?action=create')) return { id: 'cloud9' };
        throw JSON.stringify({ status: 500, error: 'BULK_ADD_FAILED', code: 'BULK_ADD_FAILED' });
      },
    });
    await expect(publishDeck('local1')).rejects.toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith('deck_set_cloud_link', expect.anything());
  });

  it('publishing again updates the details and uploads only the cards the website lacks', async () => {
    wire({
      snap: snapshot({ cloud_deck_id: 'cloud9' }),
      cloud: (m, p) => {
        if (p.startsWith('/deck-details') && p.includes('include_cards=false')) return { id: 'cloud9', total_clones: 4 };
        if (p.startsWith('/deck-details')) return { cards: [{ front_text: 'Streetcar' }], pagination: { total_pages: 1 } };
        return {};
      },
    });
    const res = await publishDeck('local1', { visibility: { isPublic: true } });
    expect(res).toMatchObject({ cloudDeckId: 'cloud9', created: false, cardsAdded: 1, totalClones: 4 });
    const calls = cloudCalls();
    expect(calls).toContain('PATCH /decks');
    expect(calls).not.toContain('POST /decks?action=create');
    const bulk = supabaseCall.mock.calls.find(([, p]) => String(p).includes('bulk-add-cards'))![2] as { cards: { front_text: string }[] };
    expect(bulk.cards.map((c) => c.front_text)).toEqual(['ferry']);
    const patch = supabaseCall.mock.calls.find(([m]) => m === 'PATCH')![2] as Record<string, unknown>;
    expect(patch.is_public).toBe(true);
    expect(invoke).toHaveBeenCalledWith('srs_update_deck', expect.objectContaining({ id: 'local1', isPublic: true }));
  });

  it('a website deck deleted online is recreated and re-linked', async () => {
    wire({
      snap: snapshot({ cloud_deck_id: 'gone' }),
      cloud: (m, p) => {
        if (p.startsWith('/deck-details')) throw JSON.stringify({ status: 404, error: 'Deck not found', code: '' });
        if (p.startsWith('/decks?action=create')) return { id: 'fresh' };
        return {};
      },
    });
    const res = await publishDeck('local1');
    expect(res).toMatchObject({ cloudDeckId: 'fresh', created: true, cardsAdded: 2 });
    expect(invoke).toHaveBeenCalledWith('deck_set_cloud_link', expect.objectContaining({ cloudDeckId: 'fresh' }));
  });
});

describe('error codes and links', () => {
  it('reduces any failure to one translatable code', () => {
    expect(errorCode(new DeckCloudError('DECK_EMPTY'))).toBe('DECK_EMPTY');
    expect(errorCode(JSON.stringify({ status: 401, error: 'Authentication required', code: '' }))).toBe('SIGN_IN_REQUIRED');
    expect(errorCode(JSON.stringify({ status: 409, error: 'x', code: 'DECK_ALREADY_CLONED' }))).toBe('DECK_ALREADY_CLONED');
    expect(errorCode('API request failed: error sending request')).toBe('NETWORK_ERROR');
    expect(errorCode('CARD_DUPLICATE')).toBe('CARD_DUPLICATE');
    expect(errorCode('boom')).toBe('UNKNOWN_ERROR');
  });

  it('a link is live only while active and unexpired', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    expect(isShareActive({ is_active: true, expires_at: null }, now)).toBe(true);
    expect(isShareActive({ is_active: true, expires_at: '2026-07-01T00:00:00Z' }, now)).toBe(true);
    expect(isShareActive({ is_active: true, expires_at: '2026-05-01T00:00:00Z' }, now)).toBe(false);
    expect(isShareActive({ is_active: false, expires_at: null }, now)).toBe(false);
  });
});

describe('saving a public deck to the library', () => {
  const pub = {
    id: 'pub1',
    title: 'Toronto Words',
    description: 'd',
    language_pair: 'en-fa',
    card_count: 2,
    tags: ['travel'],
    source_url: null,
    source_type: null,
    source_public: false,
    cover_url: null,
  };
  const page = {
    cards: [
      { id: '2', front_text: 'ferry', back_text: 'b', notes: null, order_index: 1 },
      { id: '1', front_text: 'streetcar', back_text: 'a', notes: null, order_index: 0 },
    ],
    pagination: { total_pages: 1 },
  };
  const importResult = { deck: rawDeck({ original_deck_id: 'pub1' }), created: true, added: 2, skipped: 0 };

  function wireSave(translate: 'ok' | 'fail', cloudTranslate = false) {
    invoke.mockImplementation(async (cmd: string, args: { words?: string[]; input?: unknown }) => {
      if (cmd === 'ai_translate_words') {
        if (translate === 'fail') throw 'OLLAMA_NOT_RUNNING';
        return args.words!.map((w) => ({ word: w, translation: `${w}-fr`, definition: `def ${w}` }));
      }
      if (cmd === 'deck_import_public') return importResult;
      throw new Error(`unexpected ${cmd}`);
    });
    supabaseCall.mockImplementation(async (method: string, path: string) => {
      if (path.startsWith('/clone-deck')) return cloudTranslate ? { new_deck_id: 'mine1' } : {};
      if (path.startsWith('/deck-details')) {
        return path.includes('id=mine1')
          ? { ...page, cards: page.cards.map((c) => ({ ...c, back_text: `${c.front_text}-cloud` })), ai_stats: { queued: 0, processing: 0, failed: 0 } }
          : page;
      }
      return {};
    });
  }

  it('same meaning language is an instant copy in the author\'s order, with no translation', async () => {
    wireSave('ok');
    const res = await saveToLibrary({ deck: pub, targetLanguage: 'fa', quality: 'basic' });
    expect(res.mode).toBe('copy');
    expect(invoke).not.toHaveBeenCalledWith('ai_translate_words', expect.anything());
    const input = (invoke.mock.calls.find(([c]) => c === 'deck_import_public')![1] as { input: Record<string, unknown> }).input;
    expect((input.cards as { front: string }[]).map((c) => c.front)).toEqual(['streetcar', 'ferry']);
    expect(input).toMatchObject({ original_deck_id: 'pub1', title: 'Toronto Words', language: 'en', native_language: 'fa', cloud_deck_id: null });
  });

  it('another language is translated on the local model and titled with the language', async () => {
    wireSave('ok');
    const res = await saveToLibrary({ deck: pub, targetLanguage: 'fr', quality: 'smart' });
    expect(res).toMatchObject({ mode: 'translate', usedCloud: false });
    const input = (invoke.mock.calls.find(([c]) => c === 'deck_import_public')![1] as { input: Record<string, unknown> }).input;
    expect(input.title).toBe('Toronto Words [FR]');
    const cards = input.cards as { front: string; back: string; notes: string }[];
    expect(cards[0]).toMatchObject({ front: 'streetcar', back: 'streetcar-fr' });
    expect(JSON.parse(cards[0].notes)).toMatchObject({ generated_by: 'smart_ai', definition: 'def streetcar', learning_lang: 'en' });
    expect(cloudCalls().some((c) => c.includes('clone-deck'))).toBe(false);
  });

  it('with cloud AI switched on, the website translates and the copy is linked to the cloud deck', async () => {
    wireSave('fail', true);
    const res = await saveToLibrary({ deck: pub, targetLanguage: 'fr', quality: 'basic', allowCloud: true });
    expect(res.usedCloud).toBe(true);
    const input = (invoke.mock.calls.find(([c]) => c === 'deck_import_public')![1] as { input: Record<string, unknown> }).input;
    expect(input.cloud_deck_id).toBe('mine1');
    expect((input.cards as { back: string }[])[0].back).toBe('streetcar-cloud');
  });

  it('a signed-in learner with no own AI and the cloud switch off never reaches the cloud', async () => {
    wireSave('fail', true);
    await expect(saveToLibrary({ deck: pub, targetLanguage: 'fr', quality: 'basic' })).rejects.toMatchObject({
      code: 'LOCAL_AI_UNAVAILABLE',
    });
    expect(cloudCalls().some((c) => c.includes('clone-deck'))).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith('deck_import_public', expect.anything());
  });

  it('with no local model and no account it stops with a translatable code', async () => {
    signOut();
    wireSave('fail');
    await expect(saveToLibrary({ deck: pub, targetLanguage: 'fr', quality: 'basic' })).rejects.toMatchObject({
      code: 'LOCAL_AI_UNAVAILABLE',
    });
    expect(invoke).not.toHaveBeenCalledWith('deck_import_public', expect.anything());
  });

  it('saving works signed out when no translation is needed', async () => {
    signOut();
    wireSave('ok');
    await expect(saveToLibrary({ deck: pub, targetLanguage: 'fa', quality: 'basic' })).resolves.toMatchObject({ mode: 'copy' });
  });
});
