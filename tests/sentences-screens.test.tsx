import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { makeServer, historyRow, type ServerOptions } from './helpers/sentencesServer';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const supabaseCall = vi.fn();
const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabaseCall: (...a: unknown[]) => supabaseCall(...a) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/tauri-bridge', () => ({ getSetting: vi.fn(async () => null), setSetting: vi.fn(async () => undefined) }));
vi.mock('@/pages/sentences/lib/clip', () => ({
  stopClip: vi.fn(), forgetClip: vi.fn(), playClip: vi.fn(), useOpenOnce: vi.fn(),
  useClipState: () => ({ loadingId: null, playingId: null, repeat: null, failed: null }),
}));
vi.mock('@/pages/cheatsheet/lib/service', () => ({ cheatsheet: { getVerbList: vi.fn(async () => ({ data: [{ lemma: 'habiter' }] })) } }));
vi.mock('@/lib/speech', () => ({
  speak: vi.fn(async () => undefined), stop: vi.fn(), getSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
  useSpeechState: () => ({ speaking: false, loading: false, text: null, lang: null }),
}));

import '@/i18n/config';
import i18n from 'i18next';
import { SentencesPage } from '@/pages/sentences';
import { usePracticeStore } from '@/pages/sentences/lib/practiceStore';
import { LookupContext } from '@/components/lookup/lookup-context';
import { useAuthStore } from '@/stores/authStore';
import { useAiSourceStore } from '@/stores/aiSourceStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const SIGNED_IN = { access_token: 't', refresh_token: 'r', user_id: 'u1', email: 'test@example.com', expires_at: 9999999999 };

let server: ReturnType<typeof makeServer>;

function world(o: { signedIn?: boolean; ai?: 'own' | 'none'; server?: ServerOptions } = {}) {
  server = makeServer({ queue: [1], ...o.server });
  supabaseCall.mockReset();
  supabaseCall.mockImplementation((method: string, path: string, body?: Record<string, unknown>) => server.handler(method, path, body));
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'sentences_judge')
      return { accepted: true, score: 92, criteria: { meaning: true, grammar: true, spelling: 'ok', elision: null }, hints: { register: 'formal' } };
    return null;
  });
  useAuthStore.setState({ session: o.signedIn === false ? null : SIGNED_IN, isLoading: false });
  useSubscriptionStore.setState({ subscription: null, hasResolved: true });
  const running = (o.ai ?? 'own') === 'own';
  useAiSourceStore.setState({ loaded: true, provider: 'ollama', model: null, baseUrl: '', hasKey: false, cloudOptIn: false });
  useOllamaStore.setState({
    isConnected: running,
    installStatus: { isInstalled: running, binaryPath: null, isManaged: true, isSystemInstall: false, isServeRunning: running, platform: 'macos', arch: 'aarch64' },
    installedModels: running ? [{ name: 'llama3.2:latest', size: 1, digest: 'd', modifiedAt: '' }] : [],
    error: null,
  });
  usePracticeStore.setState({ lang: null, meta: null, step: { k: 'boot' }, busy: null, outcome: null, warning: null, picks: {}, score: { r: 0, n: 0 }, stats: null });
}

/** Shows where the router is, and the state a navigation carried. */
function Where() {
  const l = useLocation();
  return <p data-testid="where" data-state={JSON.stringify(l.state ?? null)}>{l.pathname + l.search}</p>;
}

function renderAt(path: string, lookup?: (w: string, c?: string) => void) {
  const page = (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sentences/*" element={<><SentencesPage /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );
  return render(lookup ? <LookupContext.Provider value={lookup}>{page}</LookupContext.Provider> : page);
}

const actions = () => server.calls.map((c) => c.action);

beforeEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

describe('the page before it can work', () => {
  it('signed out: a sign-in card, and nothing is asked of the server', async () => {
    world({ signedIn: false });
    renderAt('/sentences/fr');
    expect(await screen.findByTestId('sign-in-card')).toBeInTheDocument();
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('the menu entry /sentences lands on French', async () => {
    world();
    renderAt('/sentences');
    expect(await screen.findByTestId('prompt')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/sentences/fr');
  });

  it('a language the bank is not written for goes to French', async () => {
    world();
    renderAt('/sentences/de');
    expect(await screen.findByTestId('prompt')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/sentences/fr');
  });

  it('server not updated (no api level): the calm "next server update" card, no error, no deal', async () => {
    world({ server: { api: null } });
    renderAt('/sentences/fr');
    const card = await screen.findByTestId('coming-soon');
    expect(card).toHaveTextContent('Coming with the next server update');
    expect(screen.queryByTestId('notice')).toBeNull();
    expect(actions()).not.toContain('deal');
  });

  it('server answering 404 for the whole function: the same calm card, and "Check again" starts working once it is there', async () => {
    world();
    supabaseCall.mockReset();
    supabaseCall.mockRejectedValue(JSON.stringify({ status: 404, error: 'Function not found', code: '' }));
    renderAt('/sentences/fr');
    await screen.findByTestId('coming-soon');
    supabaseCall.mockImplementation((method: string, path: string, body?: Record<string, unknown>) => server.handler(method, path, body));
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByTestId('prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('coming-soon')).toBeNull();
  });

  it('the history page shows the same card when the server is not updated', async () => {
    world({ server: { api: null } });
    renderAt('/sentences/fr/history');
    expect(await screen.findByTestId('coming-soon')).toBeInTheDocument();
  });
});

describe('recognize, on screen', () => {
  it('shows the sentence, hides the meaning, then opens the whole analysis after «See the meaning»', async () => {
    world();
    renderAt('/sentences/fr');
    const prompt = await screen.findByTestId('prompt');
    expect(prompt).toHaveTextContent("Où est-ce qu'il habite ?");
    expect(prompt).not.toHaveTextContent('Where does he live?');
    fireEvent.click(within(prompt).getByTestId('reveal'));
    const result = await screen.findByTestId('result');
    expect(result).toHaveTextContent('Where does he live?');
    expect(result).toHaveTextContent('Word for word');
    const analysis = screen.getByTestId('analysis');
    // breakdown: pattern, tokens, glosses, roles (served labels)
    expect(analysis).toHaveTextContent('WH + est-ce que + S + V');
    expect(analysis).toHaveTextContent('question marker');
    // the verb: derivation habiter → habit + e, and a link only because the cheatsheet has the page
    expect(analysis).toHaveTextContent('habiter');
    expect(analysis).toHaveTextContent('Group 1 · -er verbs');
    expect(analysis).toHaveTextContent('Full conjugation of «habiter»');
    // mechanics, notes, registers
    expect(analysis).toHaveTextContent("que il");
    expect(analysis).toHaveTextContent('Notes on this sentence');
    expect(analysis).toHaveTextContent('The same sentence in three registers');
    expect(analysis).toHaveTextContent('Où habite-t-il ?');
  });

  it('a rule is closed until opened, then complete: body, example, and the cheatsheet page', async () => {
    world();
    renderAt('/sentences/fr');
    fireEvent.click(await screen.findByTestId('reveal'));
    const rule = await screen.findByRole('button', { name: /Questions with est-ce que/ });
    expect(screen.queryByText('Are you coming?')).toBeNull();
    fireEvent.click(rule);
    expect(await screen.findByText('Are you coming?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The full page for this rule/ })).toHaveAttribute('href', '/sentences/fr/cheatsheet/fr/questions'.replace('/sentences/fr', ''));
  });

  it('the answer is asked AFTER the meaning is open, and the next card carries what it did', async () => {
    world({ server: { queue: [1, 2] } });
    renderAt('/sentences/fr');
    fireEvent.click(await screen.findByTestId('reveal'));
    expect(await screen.findByText('Did you know it?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('knew'));
    expect(await screen.findByTestId('outcome')).toHaveTextContent('You know this one now');
    expect(screen.getByTestId('score')).toHaveTextContent('1/1');
    expect(await screen.findByTestId('prompt')).toHaveTextContent('Je suis étudiant.');
  });

  it('every word opens the word dialog with the sentence as context', async () => {
    world();
    renderAt('/sentences/fr');
    const prompt = await screen.findByTestId('prompt');
    fireEvent.click(within(prompt).getByText('habite'));
    // the page mounts the app's own word dialog, for the language being practised
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('habite');
  });

  it('the learner\'s numbers, the review link and the record link sit beside the settings', async () => {
    world();
    renderAt('/sentences/fr');
    expect(await screen.findByTestId('stats-line')).toHaveTextContent('12 practised · 5 known');
    expect(screen.getByTestId('review-link')).toHaveTextContent('Review (3)');
    expect(screen.getByTestId('history-link')).toHaveTextContent('Record');
  });
});

describe('produce, on screen', () => {
  it('asks in the meaning, with the choices French forces, and a hint on request', async () => {
    world();
    renderAt('/sentences/fr');
    await screen.findByTestId('prompt');
    fireEvent.click(screen.getByTestId('settings-open'));
    fireEvent.click(await screen.findByTestId('pick-dir-produce'));
    await waitFor(() => expect(screen.getByTestId('prompt')).toHaveAttribute('data-dir', 'produce'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    const prompt = screen.getByTestId('prompt');
    expect(prompt).toHaveTextContent('Where does he live?');
    expect(prompt).toHaveTextContent('subject: masculine (il)');
    expect(prompt).not.toHaveTextContent("Où est-ce qu'il habite");
    fireEvent.click(within(prompt).getByRole('button', { name: 'Hint' }));
    expect(prompt).toHaveTextContent('Use the est-ce que form.');
  });

  async function inProduce(o: Parameters<typeof world>[0] = {}) {
    world(o);
    renderAt('/sentences/fr');
    await screen.findByTestId('prompt');
    fireEvent.click(screen.getByTestId('settings-open'));
    fireEvent.click(await screen.findByTestId('pick-dir-produce'));
    await waitFor(() => expect(screen.getByTestId('prompt')).toHaveAttribute('data-dir', 'produce'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
  }

  it('exact: the green verdict and no AI check', async () => {
    await inProduce();
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: "où est-ce qu'il habite" } });
    fireEvent.submit(screen.getByTestId('answer-input').closest('form')!);
    const verdict = await screen.findByTestId('verdict');
    expect(verdict).toHaveAttribute('data-verdict', 'exact');
    expect(invoke).not.toHaveBeenCalledWith('sentences_judge', expect.anything());
  });

  it('a different sentence: the learner\'s own AI judges it and its scorecard is shown beside the verdict', async () => {
    await inProduce();
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: 'Où habite-il ?' } });
    fireEvent.submit(screen.getByTestId('answer-input').closest('form')!);
    const verdict = await screen.findByTestId('verdict');
    expect(verdict).toHaveAttribute('data-verdict', 'variant');
    expect(within(verdict).getByTestId('scorecard')).toHaveTextContent('92');
    expect(within(verdict).getByTestId('scorecard')).toHaveTextContent('Formal register');
    expect(verdict).toHaveTextContent("French the card didn't list");
    expect(screen.queryByTestId('ai-setup')).toBeNull();
  });

  it('AI not set up: the card\'s own verdict, the diff, and the setup card — no scorecard, nothing silent', async () => {
    await inProduce({ ai: 'none' });
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: 'Il habite où' } });
    fireEvent.submit(screen.getByTestId('answer-input').closest('form')!);
    const verdict = await screen.findByTestId('verdict');
    expect(verdict).toHaveAttribute('data-verdict', 'wrong');
    expect(within(verdict).queryByTestId('scorecard')).toBeNull();
    expect(within(verdict).getByTestId('diff')).toBeInTheDocument();
    expect(await screen.findByTestId('ai-setup')).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('sentences_judge', expect.anything());
  });

  it('a miss brings the same card back with its banner; the banner lets the learner skip once', async () => {
    await inProduce({ ai: 'none' });
    fireEvent.change(screen.getByTestId('answer-input'), { target: { value: 'nope' } });
    fireEvent.submit(screen.getByTestId('answer-input').closest('form')!);
    fireEvent.click(await screen.findByTestId('next'));
    const banner = await screen.findByTestId('retry-banner');
    expect(banner).toHaveTextContent('You wrote this one wrong');
    expect(screen.getByTestId('prompt')).toHaveTextContent('Where does he live?');
    fireEvent.click(within(banner).getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(actions()).toContain('skip'));
    await waitFor(() => expect(screen.queryByTestId('retry-banner')).toBeNull());
  });

});

describe('listen and question-and-answer, on screen', () => {
  async function inDir(dir: string) {
    world();
    renderAt('/sentences/fr');
    await screen.findByTestId('prompt');
    fireEvent.click(screen.getByTestId('settings-open'));
    fireEvent.click(await screen.findByTestId(`pick-dir-${dir}`));
    await waitFor(() => expect(screen.getByTestId('prompt')).toHaveAttribute('data-dir', dir));
    fireEvent.keyDown(document.body, { key: 'Escape' });
  }

  it('listening: the sentence is never printed on the prompt, text comes next with the ear question, meaning after', async () => {
    await inDir('listen');
    const prompt = screen.getByTestId('prompt');
    expect(screen.getByTestId('listen-player')).toBeInTheDocument();
    expect(prompt).not.toHaveTextContent('habite');
    fireEvent.click(within(prompt).getByRole('button', { name: /See the text/ }));
    const step = await screen.findByTestId('listen-text');
    expect(step).toHaveTextContent("Où est-ce qu'il habite ?");
    expect(step).not.toHaveTextContent('Where does he live?');
    fireEvent.click(within(step).getByRole('button', { name: /No, I only got it from the text/ }));
    const result = await screen.findByTestId('result');
    expect(result).toHaveTextContent('Where does he live?');
    fireEvent.click(screen.getByTestId('knew'));
    expect(await screen.findByTestId('outcome')).toHaveTextContent(/comes back|Correct|know/i);
    expect(screen.getByTestId('outcome')).toHaveTextContent("You didn't catch it by ear");
  });

  it('question and answer: unmatched → the learner judges next to the model answers', async () => {
    await inDir('answer');
    fireEvent.click(within(screen.getByTestId('prompt')).getByRole('button', { name: /See the text/ }));
    const step = await screen.findByTestId('answer-step');
    fireEvent.change(within(step).getByTestId('answer-input'), { target: { value: 'Quelque part' } });
    fireEvent.submit(within(step).getByTestId('answer-input').closest('form')!);
    const result = await screen.findByTestId('qa-result');
    expect(result).toHaveTextContent('Was your answer right?');
    expect(screen.getByTestId('answer-groups')).toHaveTextContent("J'habite à Toronto.");
    fireEvent.click(within(result).getByRole('button', { name: 'It was right' }));
    await waitFor(() => expect(screen.queryByText('Was your answer right?')).toBeNull());
    expect(screen.getByTestId('score')).toHaveTextContent('1/1');
  });
});

describe('settings', () => {
  it('the rows come from the server; a pick applies at once and the dialog stays open', async () => {
    world();
    renderAt('/sentences/fr');
    await screen.findByTestId('prompt');
    fireEvent.click(screen.getByTestId('settings-open'));
    const dialog = await screen.findByTestId('settings-dialog');
    for (const title of ['Level', 'Direction', 'Order', 'Unit', 'Auto review', 'Path']) expect(dialog).toHaveTextContent(title);
    fireEvent.click(within(dialog).getByTestId('pick-level-A2'));
    await waitFor(() => expect(JSON.parse(server.calls.filter((c) => c.action === 'meta').at(-1)!.query.get('state')!)).toMatchObject({ level: 'A2' }));
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByTestId('settings-bar')).getAllByText('A2').length).toBeGreaterThan(0));
  });

  it('the language row is a navigation', async () => {
    world();
    renderAt('/sentences/fr');
    await screen.findByTestId('prompt');
    fireEvent.click(screen.getByTestId('settings-open'));
    fireEvent.click(await screen.findByTestId('pick-lang-en'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sentences/en'));
  });

  it('a unit is shown on every card while a unit is in play, with what the learner can do after it', async () => {
    world();
    renderAt('/sentences/fr');
    await screen.findByTestId('prompt');
    fireEvent.click(screen.getByTestId('settings-open'));
    fireEvent.click(await screen.findByTestId('pick-unit-2'));
    expect(await screen.findByTestId('unit-box')).toHaveTextContent('Asking where');
  });
});

describe('the record', () => {
  const rows = [
    historyRow({ id: 1, box: 0 }),
    historyRow({ id: 2, text: 'Elle mange.', meaning: 'She eats.', box: 3, last_wrong_answer: null, wrong_count: 0, correct_count: 4, due_at: '2099-01-01T00:00:00Z' }),
    historyRow({ id: 3, text: 'Il pleut.', meaning: 'It rains.', box: 1, last_dir: 'listen', last_plays: 3, last_heard: false, last_wrong_answer: null }),
  ];

  it('opens on the mistakes with the learner\'s numbers; each tab asks the server for its own list', async () => {
    world({ server: { history: rows } });
    renderAt('/sentences/fr/history');
    const list = await screen.findByTestId('history-list');
    expect(within(list).getAllByTestId('history-row')).toHaveLength(1);
    expect(list).toHaveTextContent('Je suis étudiant.');
    expect(list).toHaveTextContent('Your answer');
    expect(list).toHaveTextContent('Je sui étudiant');
    expect(list).toHaveTextContent('1 right · 2 wrong');
    expect(screen.getByText('12 practised · 5 known')).toBeInTheDocument();
    expect(server.calls.filter((c) => c.action === 'history').at(-1)!.query.get('filter')).toBe('weak');

    fireEvent.click(screen.getByTestId('tab-learned'));
    await waitFor(() => expect(screen.getByTestId('history-list')).toHaveTextContent('Elle mange.'));
    expect(screen.getByTestId('history-row')).toHaveAttribute('data-status', 'learned');
    expect(screen.getByTestId('history-row')).toHaveTextContent('Review: in');

    fireEvent.click(screen.getByTestId('tab-misheard'));
    await waitFor(() => expect(screen.getByTestId('history-list')).toHaveTextContent('Il pleut.'));
    expect(screen.getByTestId('history-row')).toHaveTextContent('Missed it');
    expect(screen.getByTestId('history-row')).toHaveTextContent('By ear, 3 times');

    fireEvent.click(screen.getByTestId('tab-all'));
    await waitFor(() => expect(screen.getAllByTestId('history-row')).toHaveLength(3));
    expect(server.calls.filter((c) => c.action === 'history').map((c) => c.query.get('filter'))).toEqual(expect.arrayContaining(['weak', 'learned', 'misheard', 'all']));
  });

  it('a level and a path are filters of the list too', async () => {
    world({ server: { history: rows } });
    renderAt('/sentences/fr/history');
    await screen.findByTestId('history-list');
    fireEvent.click(screen.getByTestId('level-A2'));
    await waitFor(() => expect(server.calls.filter((c) => c.action === 'history').at(-1)!.query.get('level')).toBe('A2'));
    expect(within(screen.getByTestId('history-paths')).getByText('Questions')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('history-paths')).getByText('Questions'));
    await waitFor(() => expect(server.calls.filter((c) => c.action === 'history').at(-1)!.query.get('track')).toBe('qa'));
  });

  it('«Review N sentences» starts a review round on the same level and path', async () => {
    world({ server: { history: rows } });
    renderAt('/sentences/fr/history?level=A1');
    const review = await screen.findByTestId('review-all');
    expect(review).toHaveTextContent('Review 3 sentences');
    fireEvent.click(review);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sentences/fr'));
    expect(JSON.parse(screen.getByTestId('where').getAttribute('data-state')!)).toEqual({ picks: { level: 'A1', order: 'review' } });
    // and the practice page that opens starts that round
    await waitFor(() => expect(server.calls.filter((c) => c.action === 'deal').at(-1)!.body!.state).toMatchObject({ order: 'review' }));
  });

  it('empty and failing lists say so', async () => {
    world({ server: { history: [] } });
    renderAt('/sentences/fr/history');
    expect(await screen.findByTestId('history-empty')).toHaveTextContent('No mistakes left for now.');
    cleanup();
    world({ server: { failAction: 'history' } });
    renderAt('/sentences/fr/history');
    expect(await screen.findByTestId('history-error')).toHaveTextContent("The next round didn't load");
  });

  it('pages of twenty', async () => {
    const many = Array.from({ length: 45 }, (_, i) => historyRow({ id: i + 1, text: `Phrase ${i + 1}` }));
    world({ server: { history: many } });
    renderAt('/sentences/fr/history');
    await screen.findByTestId('history-list');
    expect(screen.getAllByTestId('history-row')).toHaveLength(20);
    expect(screen.getByTestId('history-pager')).toHaveTextContent('1 / 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByTestId('history-pager')).toHaveTextContent('2 / 3'));
    expect(server.calls.filter((c) => c.action === 'history').at(-1)!.query.get('page')).toBe('2');
  });
});

describe('six languages', () => {
  for (const lng of ['fa', 'ar', 'fr', 'hi', 'zh']) {
    it(`${lng}: the practice screen is translated — no key shows through`, async () => {
      await i18n.changeLanguage(lng);
      world();
      renderAt('/sentences/fr');
      const prompt = await screen.findByTestId('prompt');
      expect(prompt.textContent).not.toMatch(/prompt\.recognize|revealMeaning|[a-z]+\.[a-z]+Key/);
      const page = screen.getByTestId('sentences-page');
      expect(page.textContent).not.toMatch(/\b(settings\.title|stats\.line|review\.link)\b/);
      expect(page.textContent).not.toMatch(/\{\{/);
      fireEvent.click(within(prompt).getByTestId('reveal'));
      await screen.findByTestId('result');
      expect(screen.getByTestId('sentences-page').textContent).not.toMatch(/\{\{|askKnew|schedule\./);
    });
  }
});
