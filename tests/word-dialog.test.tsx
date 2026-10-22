import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const invoke = vi.fn();
const supabaseCall = vi.fn();
const speakSpy = vi.fn(async () => {});

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));
vi.mock('@/lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/speech')>()),
  speak: (...a: unknown[]) => (speakSpy as (...x: unknown[]) => Promise<void>)(...a),
}));

import '@/i18n/config';
import i18n from 'i18next';
import { WordDialog } from '@/components/WordDialog';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAiSourceStore } from '@/stores/aiSourceStore';
import { useLanguageStore } from '@/hooks/useLanguageSettings';

const SIGNED_IN = { access_token: 't', refresh_token: 'r', user_id: 'u1', email: 'test@example.com', expires_at: 9999999999 };

const local = {
  word: 'maison',
  translation: 'house',
  source_lang: 'fr',
  target_lang: 'en',
  alternatives: [{ pos: 'noun', words: ['house', 'home'] }],
  examples: ['La maison est grande.'],
  cefr_level: 'A1',
};

const DECKS = [
  { id: 'deck-1', name: 'Montreal words', description: null, language: 'fr', algorithm: 'fsrs', card_count: 3, due_today: 0, new_cards: 3, created_at: '', updated_at: '' },
];

function setup(
  opts: { signedIn?: boolean; pro?: boolean; cloud?: boolean; noAi?: boolean; translation?: object; decks?: object[]; ai?: object } = {},
) {
  // The user's own AI: a saved OpenAI key unless the test says they have none.
  useAiSourceStore.setState({ loaded: true, provider: 'openai', model: 'gpt-4o-mini', baseUrl: '', hasKey: !opts.noAi, cloudOptIn: !!opts.cloud });
  useAuthStore.setState({ session: opts.signedIn ? SIGNED_IN : null, isLoading: false });
  useSubscriptionStore.setState({
    subscription: opts.pro ? { tier: 'pro', planId: 'p', status: 'active', periodStart: '', periodEnd: '', hasStripeSubscription: true } : null,
    hasResolved: true,
  });
  useLanguageStore.setState({ nativeLang: 'en', targetLang: 'fr', hydrated: true });
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'podcast_translate_word') return opts.translation ?? local;
    if (cmd === 'srs_list_decks') return opts.decks ?? [];
    if (cmd === 'ai_word_analysis') return opts.ai ?? { word: 'maison', contextualTranslation: 'house', examples: [] };
    return null;
  });
  supabaseCall.mockImplementation(async (_m: string, path: string) => {
    if (path.startsWith('/translate-v2'))
      return { word: 'maison', translation: 'house', examples: [{ source: 'Ma maison est petite.', target: 'My house is small.' }], alternativeTranslations: ['home'], phonetic: '/mɛ.zɔ̃/', cefr: 'A1', pos: 'noun' };
    if (path.startsWith('/cheatsheet')) return { lang: 'fr', word: 'maison', noun: { lemma: 'maison', gender: 'f', pluralOnly: false }, verb: null };
    if (path.startsWith('/dictionary?action=freedict')) return { found: true, entry: { word: 'city', phonetics: [], meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A large town.', synonyms: [], antonyms: [] }] }] } };
    if (path.startsWith('/get-ai-translation')) return { found: true, data: { word: 'maison', contextualTranslation: 'residence', examples: [], collocations: ['maison blanche'] } };
    return {};
  });
}

const open = (props: Partial<React.ComponentProps<typeof WordDialog>> = {}) =>
  render(<WordDialog word="maison" open onOpenChange={() => {}} sourceLang="fr" sentenceContext="La maison est grande." {...props} />);

beforeEach(async () => {
  cleanup();
  window.localStorage.clear();
  invoke.mockReset();
  supabaseCall.mockReset();
  speakSpy.mockClear();
  await i18n.changeLanguage('en');
});

describe('word dialog: translation sources', () => {
  it('signed out: the local Google path answers, with CEFR from the word language, and no cloud call', async () => {
    setup();
    open();
    expect(await screen.findByText('house')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('podcast_translate_word', { word: 'maison', sourceLang: 'fr', targetLang: 'en' });
    expect(supabaseCall.mock.calls.some(([, p]) => String(p).startsWith('/translate-v2'))).toBe(false);
    expect(screen.getByText('A1')).toBeInTheDocument();
    // vocabulary history written for every lookup
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('vocabulary_log_lookup', expect.objectContaining({ word: 'maison', language: 'fr' })));
  });

  it('signed in: translate-v2 answers with its header facts and examples', async () => {
    setup({ signedIn: true });
    open();
    expect(await screen.findByText('small.')).toBeInTheDocument();
    const call = supabaseCall.mock.calls.find(([, p]) => String(p).startsWith('/translate-v2'));
    expect(String(call?.[1])).toContain('source=fr');
    expect(String(call?.[1])).toContain('target=en');
    expect(String(call?.[1])).toContain('context=');
    expect(screen.getByText('/mɛ.zɔ̃/')).toBeInTheDocument();
    expect(screen.getByText('noun')).toBeInTheDocument();
    expect(screen.getByText('Ma')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('podcast_translate_word', expect.anything());
  });

  it('signed in but the cloud is down: the local path still answers', async () => {
    setup({ signedIn: true });
    supabaseCall.mockImplementation(async (_m: string, path: string) => {
      if (path.startsWith('/translate-v2')) throw JSON.stringify({ status: 503, error: 'UPSTREAM_EXHAUSTED', code: 'UPSTREAM_EXHAUSTED' });
      return { lang: 'fr', word: 'maison', noun: null, verb: null };
    });
    open();
    expect(await screen.findByText('house')).toBeInTheDocument();
  });

  it('a failed lookup shows an inline error, keeps the dialog open and offers retry', async () => {
    setup();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'podcast_translate_word') throw 'Translation request failed: error sending request';
      return [];
    });
    const onOpenChange = vi.fn();
    open({ onOpenChange });
    expect(await screen.findByText(/couldn't reach FlexiLingo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('word dialog: tabs', () => {
  it('a French word has Translate and AI only; an English word also has both dictionaries', async () => {
    setup();
    open();
    await screen.findByText('house');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Translate', 'AI']);
    cleanup();
    open({ word: 'city', sourceLang: 'en' });
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(4));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Translate', 'AI', 'Dictionary', 'M-W']);
  });

  it('remembers the tab the reader picked for the next word', async () => {
    setup();
    open();
    await screen.findByText('house');
    fireEvent.click(screen.getByRole('tab', { name: 'AI' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('ai_word_analysis', expect.anything()));
    cleanup();
    open({ word: 'chat' });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('AI: uses the user\'s own AI by default, never the cloud', async () => {
    setup({ signedIn: true });
    open({ initialTab: 'ai' });
    await screen.findByText('Your key');
    expect(invoke).toHaveBeenCalledWith('ai_word_analysis', expect.objectContaining({ sourceLanguage: 'fr', targetLanguage: 'en' }));
    expect(supabaseCall.mock.calls.some(([, p]) => String(p).startsWith('/get-ai-translation'))).toBe(false);
  });

  it('AI: a paid plan alone still uses the user\'s own AI', async () => {
    setup({ signedIn: true, pro: true });
    open({ initialTab: 'ai' });
    await screen.findByText('Your key');
    expect(invoke).toHaveBeenCalledWith('ai_word_analysis', expect.anything());
    expect(supabaseCall.mock.calls.some(([, p]) => String(p).startsWith('/get-ai-translation'))).toBe(false);
  });

  it('AI: the cloud analysis only after the user switched it on (signed in + paid)', async () => {
    setup({ signedIn: true, pro: true, cloud: true });
    open({ initialTab: 'ai' });
    expect(await screen.findByText('residence')).toBeInTheDocument();
    expect(screen.getByText('maison blanche')).toBeInTheDocument();
    expect(screen.getByText('FlexiLingo cloud')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('ai_word_analysis', expect.anything());
  });

  it('AI: switched on but not paid stays on the user\'s own AI', async () => {
    setup({ signedIn: true, cloud: true });
    open({ initialTab: 'ai' });
    await screen.findByText('Your key');
    expect(supabaseCall.mock.calls.some(([, p]) => String(p).startsWith('/get-ai-translation'))).toBe(false);
  });

  it('AI: not set up shows the setup card and calls nothing, cloud included', async () => {
    setup({ signedIn: true, pro: true, noAi: true });
    open({ initialTab: 'ai' });
    expect(await screen.findByText('Set up your AI')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('ai_word_analysis', expect.anything());
    expect(supabaseCall.mock.calls.some(([, p]) => String(p).startsWith('/get-ai-translation'))).toBe(false);
  });

  it('Dictionary: signed in uses the cloud; Merriam-Webster signed out asks to sign in', async () => {
    setup({ signedIn: true });
    open({ word: 'city', sourceLang: 'en', initialTab: 'dictionary' });
    expect(await screen.findByText('A large town.')).toBeInTheDocument();
    cleanup();
    setup();
    open({ word: 'city', sourceLang: 'en', initialTab: 'merriam-webster' });
    expect(await screen.findByText('More dictionaries after you sign in')).toBeInTheDocument();
  });

  it('shows the French noun gender from the grammar strip', async () => {
    setup();
    open();
    expect(await screen.findByText('feminine')).toBeInTheDocument();
    expect(screen.getByText(/la maison/)).toBeInTheDocument();
  });
});

describe('word dialog: header', () => {
  it('speaks a French word in French voices: FR and CA, no US/UK', async () => {
    setup();
    open();
    await screen.findByText('house');
    expect(screen.queryByRole('button', { name: /^US$|^UK$/ })).toBeNull();
    const ca = screen.getByRole('button', { name: 'Canada' });
    fireEvent.click(ca);
    expect(speakSpy).toHaveBeenCalledWith('maison', 'fr-CA');
    expect(screen.getAllByText('FR').length).toBeGreaterThan(0);
  });

  it('the language chip shows the word language and the translation language', async () => {
    setup();
    open();
    await screen.findByText('house');
    const src = screen.getByRole('button', { name: 'This word is in' });
    const tgt = screen.getByRole('button', { name: 'Translate to' });
    expect(src).toHaveTextContent('FR');
    expect(tgt).toHaveTextContent('EN');
  });

  it('a pinned target language cannot be changed unless the host listens', async () => {
    setup();
    open({ targetLang: 'fa' });
    await screen.findByText('house');
    expect(screen.queryByRole('button', { name: 'Translate to' })).toBeNull();
  });
});

describe('word dialog: trail', () => {
  it('a word clicked inside an example opens a deeper level, and Back pops it', async () => {
    setup({ signedIn: true });
    open();
    // an example's English translation: a word in the translation language is read back as an English word
    fireEvent.click(await screen.findByText('small.'));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Words you looked up' })).toBeInTheDocument());
    const nav = screen.getByRole('navigation', { name: 'Words you looked up' });
    expect(nav).toHaveTextContent('maison');
    expect(nav).toHaveTextContent('small');
    fireEvent.click(screen.getByRole('button', { name: 'Back to maison' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Words you looked up' })).toBeNull());
  });
});

describe('word dialog: saving', () => {
  it('without a remembered deck the button opens the full sheet', async () => {
    setup({ decks: DECKS });
    open();
    await screen.findByText('house');
    expect(screen.getAllByRole('button', { name: /Add to Deck/i }).length).toBeGreaterThan(0);
  });

  it('one tap saves into the last deck, then says so with a review link', async () => {
    setup({ decks: DECKS });
    window.localStorage.setItem('flexi.deck.lastUsed', JSON.stringify({ deckId: 'deck-1', mode: 'basic' }));
    open();
    await screen.findByText('house');
    const save = (await screen.findAllByRole('button', { name: 'Save to Montreal words' }))[0];
    fireEvent.click(save);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('srs_add_card', expect.objectContaining({ deckId: 'deck-1', word: 'maison', language: 'fr', translation: 'house' })),
    );
    expect((await screen.findAllByText('Saved to Montreal words')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Choose another deck' }).length).toBeGreaterThan(0);
  });

  it('a failed save stays in the dialog with the error inline', async () => {
    setup({ decks: DECKS });
    window.localStorage.setItem('flexi.deck.lastUsed', JSON.stringify({ deckId: 'deck-1', mode: 'basic' }));
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'podcast_translate_word') return local;
      if (cmd === 'srs_list_decks') return DECKS;
      if (cmd === 'srs_add_card') throw 'UNIQUE constraint failed';
      return null;
    });
    const onOpenChange = vi.fn();
    open({ onOpenChange });
    await screen.findByText('house');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Save to Montreal words' }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('already in this deck');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
