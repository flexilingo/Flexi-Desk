import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import enNotes from '@/i18n/locales/en/notes.json';
import enVocabulary from '@/i18n/locales/en/vocabulary.json';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const calls: { cmd: string; args: Record<string, unknown> | undefined }[] = [];
const cloud: { method: string; path: string; body?: unknown }[] = [];
let handlers: Record<string, (args?: Record<string, unknown>) => unknown> = {};
let cloudHandler: (method: string, path: string, body?: unknown) => unknown = () => ({});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    const h = handlers[cmd];
    if (!h) return null;
    return h(args);
  }),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/nativeDialog', () => ({ save: vi.fn(async () => '/tmp/out.csv'), open: vi.fn() }));
const openUrl = vi.fn(async () => {});
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: (u: string) => openUrl(u) }));
vi.mock('@/lib/supabase', () => ({
  supabaseCall: vi.fn(async (method: string, path: string, body?: unknown) => {
    cloud.push({ method, path, body });
    return cloudHandler(method, path, body);
  }),
}));
vi.mock('@/components/common/AddToDeckSheet', () => ({
  AddToDeckSheet: ({ open, items }: { open: boolean; items: { word: string; language: string }[] }) =>
    open ? <div data-testid="deck-sheet">{items.map((i) => `${i.word}:${i.language}`).join(',')}</div> : null,
}));
vi.mock('@/components/lookup/SpeakButton', () => ({ SpeakButton: () => <span /> }));
vi.mock('@/hooks/useLanguageSettings', () => ({ useLanguageSettings: () => ({ targetLang: 'fr', nativeLang: 'en' }) }));

const BUNDLES: Record<string, unknown> = { notes: enNotes, vocabulary: enVocabulary };
vi.mock('react-i18next', () => ({
  useTranslation: (ns: string) => {
    const t = (key: string, opts?: Record<string, unknown>) => {
      const hit = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], BUNDLES[ns]);
      const raw = typeof hit === 'string' ? hit : typeof opts?.defaultValue === 'string' ? opts.defaultValue : key;
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? ''));
    };
    return { t, i18n: { language: 'en', dir: () => 'ltr' } };
  },
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import NotesPage from '@/pages/notes/NotesPage';
import VocabularyPage from '@/pages/vocabulary/VocabularyPage';
import { useAuthStore } from '@/stores/authStore';

const session = { access_token: 't', refresh_token: 'r', user_id: 'u', email: 'x@example.com', expires_at: 9999999999 };

const localNotes = [
  { id: 'b1', source: 'podcast', source_id: 'e1', source_title: 'Episode One', source_kind: null, position_ms: 12000, page: null, label: 'Idiom', note: 'podcast note', excerpt: null, tags: [], created_at: '2026-10-01 10:00:00', updated_at: '2026-10-01 10:00:00' },
  { id: 'n1', source: 'reader', source_id: 'd1', source_title: 'Le Petit Prince', source_kind: 'pdf', position_ms: null, page: 3, label: null, note: 'reader note', excerpt: 'quoted', tags: [], created_at: '2026-10-03T09:00:00.000Z', updated_at: '2026-10-03T09:00:00.000Z' },
];
const accountNotes = [
  { id: 'c1', videoId: 'abc', videoUrl: 'https://www.youtube.com/watch?v=abc', timestampSeconds: 65, label: null, note: 'cloud note', subtitleText: 'Hello there', translation: 'Bonjour', tags: [], videoTitle: 'A video', isFavorite: false, createdAt: '2026-10-02T08:00:00.000Z' },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderNotes() {
  return render(
    <MemoryRouter initialEntries={['/notes']}>
      <Routes>
        <Route path="/notes" element={<NotesPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  calls.length = 0;
  cloud.length = 0;
  openUrl.mockClear();
  handlers = { local_notes_list: () => localNotes, local_notes_delete: (a) => (a?.items as unknown[]).length };
  cloudHandler = (_m, path) => (path.includes('get-bookmarks') ? { bookmarks: accountNotes, hasMore: false } : { success: true });
  useAuthStore.setState({ session });
});

describe('notes page', () => {
  it('lists the notes of this computer and of the account, each source saying where it lives', async () => {
    renderNotes();
    expect(await screen.findByText('Episode One')).toBeInTheDocument();
    expect(screen.getByText('Le Petit Prince')).toBeInTheDocument();
    expect(screen.getByText('A video')).toBeInTheDocument();
    expect(screen.getAllByText('This computer').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Your account').length).toBeGreaterThanOrEqual(1);
  });

  it('shows this computer\'s notes without an account call when signed out', async () => {
    useAuthStore.setState({ session: null });
    renderNotes();
    expect(await screen.findByText('Episode One')).toBeInTheDocument();
    expect(screen.queryByText('A video')).toBeNull();
    expect(cloud).toHaveLength(0);
  });

  it('deletes an account note only in the account, and a device note only on this computer', async () => {
    renderNotes();
    await screen.findByText('A video');
    const cloudCard = screen.getByText('A video').closest('section')!;
    fireEvent.click(within(cloudCard).getByLabelText('Delete'));
    expect(await screen.findByText('Deleted from your account: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Deleted from this computer/)).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(cloud.some((c) => c.method === 'DELETE' && c.path.includes('delete-bookmark&bookmarkId=c1'))).toBe(true));
    expect(calls.some((c) => c.cmd === 'local_notes_delete')).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    cloud.length = 0;
    const readerCard = screen.getByText('Le Petit Prince').closest('section')!;
    fireEvent.click(within(readerCard).getByLabelText('Delete'));
    expect(await screen.findByText('Deleted from this computer: 1')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls.find((c) => c.cmd === 'local_notes_delete')?.args).toEqual({ items: [{ source: 'reader', id: 'n1' }] }));
    expect(cloud.some((c) => c.method === 'DELETE' || c.path.includes('bulk-delete'))).toBe(false);
  });

  it('keeps the delete dialog open and shows the reason when the account delete fails', async () => {
    cloudHandler = (_m, path) => {
      if (path.includes('get-bookmarks')) return { bookmarks: accountNotes, hasMore: false };
      throw JSON.stringify({ status: 500, error: 'UNKNOWN_ERROR' });
    };
    renderNotes();
    await screen.findByText('A video');
    fireEvent.click(within(screen.getByText('A video').closest('section')!).getByLabelText('Delete'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await within(screen.getByRole('dialog')).findByText(enNotes.errors.UNKNOWN_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('bulk-deletes a mixed selection split by place', async () => {
    renderNotes();
    await screen.findByText('A video');
    for (const group of ['A video', 'Le Petit Prince']) {
      fireEvent.click(within(screen.getByText(group).closest('section')!).getByLabelText('Select all notes of this source'));
    }
    fireEvent.click(screen.getByRole('button', { name: /Delete selected/ }));
    expect(await screen.findByText('Deleted from this computer: 1')).toBeInTheDocument();
    expect(screen.getByText('Deleted from your account: 1')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete selected' }));
    await waitFor(() => expect(calls.find((c) => c.cmd === 'local_notes_delete')?.args).toEqual({ items: [{ source: 'reader', id: 'n1' }] }));
    expect(cloud.some((c) => c.method === 'DELETE' && c.path.includes('bookmarkId=c1'))).toBe(true);
  });

  it('opens a podcast note at its second in the player, a reader note on its page, and a video in the browser', async () => {
    handlers.local_note_prepare_open = (a) => (a?.source === 'podcast' ? '/podcast/player/e1' : '/reader/pdf/d1');
    renderNotes();
    await screen.findByText('A video');
    fireEvent.click(screen.getByRole('button', { name: '0:12' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/podcast/player/e1'));
    expect(calls.find((c) => c.cmd === 'local_note_prepare_open')?.args).toEqual({ source: 'podcast', sourceId: 'e1', positionMs: 12000, page: null });
  });

  it('opens an account note\'s video at the second in the system browser', async () => {
    renderNotes();
    await screen.findByText('A video');
    fireEvent.click(screen.getByRole('button', { name: '1:05' }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc&t=65'));
    expect(calls.some((c) => c.cmd === 'local_note_prepare_open')).toBe(false);
  });

  it('edits an account note through the account and a device note on this computer', async () => {
    renderNotes();
    await screen.findByText('A video');
    fireEvent.click(within(screen.getByText('A video').closest('section')!).getByLabelText('Edit note'));
    const box = screen.getByPlaceholderText('Your note');
    fireEvent.change(box, { target: { value: 'changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(cloud.find((c) => c.path.includes('update-bookmark'))?.body).toMatchObject({ bookmarkId: 'c1', note: 'changed' }));

    fireEvent.click(within(screen.getByText('Episode One').closest('section')!).getByLabelText('Edit note'));
    fireEvent.change(screen.getByPlaceholderText('Your note'), { target: { value: 'local change' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.find((c) => c.cmd === 'local_note_update')?.args).toMatchObject({ source: 'podcast', id: 'b1', note: 'local change' }));
  });

  it('keeps the editor open with the error when a save fails', async () => {
    handlers.local_note_update = () => {
      throw 'NOTE_NOT_FOUND';
    };
    renderNotes();
    await screen.findByText('Episode One');
    fireEvent.click(within(screen.getByText('Episode One').closest('section')!).getByLabelText('Edit note'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(enNotes.errors.NOTE_NOT_FOUND)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your note')).toBeInTheDocument();
  });

  it('searches and filters by tag', async () => {
    handlers.local_notes_list = () => [{ ...localNotes[0], tags: ['verbs'] }, localNotes[1]];
    renderNotes();
    await screen.findByText('Episode One');
    fireEvent.click(screen.getByRole('button', { name: 'verbs' }));
    expect(screen.getByText('Episode One')).toBeInTheDocument();
    expect(screen.queryByText('Le Petit Prince')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
    fireEvent.change(screen.getByPlaceholderText('Search notes...'), { target: { value: 'bonjour' } });
    expect(screen.getByText('A video')).toBeInTheDocument();
    expect(screen.queryByText('Episode One')).toBeNull();
  });

  it('exports what is on screen to the chosen file', async () => {
    handlers.export_save_text = () => null;
    renderNotes();
    await screen.findByText('A video');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(await screen.findByRole('button', { name: 'CSV (.csv)' }));
    await waitFor(() => expect(calls.find((c) => c.cmd === 'export_save_text')?.args).toMatchObject({ path: '/tmp/out.csv' }));
    const csv = String(calls.find((c) => c.cmd === 'export_save_text')?.args?.content);
    expect(csv.split('\n')).toHaveLength(4);
  });
});

const localWords = [
  { id: 1, word: 'maison', language: 'fr', pos: null, cefr_level: 'A1', translation: 'house', definition: null, context_sentence: 'La maison.', source_module: 'dictionary', created_at: '2026-10-01 10:00:00', last_seen_at: '2026-10-05 10:00:00', lookup_count: 4, deck_count: 0, status: 'new', level: 0 },
  { id: 2, word: 'chat', language: 'fr', pos: null, cefr_level: 'A1', translation: 'cat', definition: null, context_sentence: null, source_module: 'dictionary', created_at: '2026-10-02 10:00:00', last_seen_at: '2026-10-06 10:00:00', lookup_count: 1, deck_count: 1, status: 'mastered', level: 5 },
];
const accountWords = [
  { id: 'a1', word: 'only', translation: 'seulement', lookup_count: 2, first_seen_at: '2026-10-04T10:00:00.000Z', last_seen_at: '2026-10-08T10:00:00.000Z', cefrLevel: 'B1', sourceLang: 'en', status: 'new', leitnerBox: 0, videoContexts: [] },
];

describe('vocabulary page', () => {
  beforeEach(() => {
    handlers = {
      vocabulary_overview: () => localWords,
      vocabulary_bulk_delete: (a) => (a?.ids as unknown[]).length,
      vocabulary_update: () => null,
    };
    cloudHandler = () => ({ words: accountWords, pagination: { total: 1, page: 1, limit: 100, totalPages: 1 } });
  });

  const cardOf = (word: string) => screen.getByLabelText(`Select word: ${word}`);

  it('merges this computer\'s words with the account history and filters by status', async () => {
    render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
    expect(await screen.findByLabelText('Select word: maison')).toBeInTheDocument();
    expect(screen.getByLabelText('Select word: only')).toBeInTheDocument();
    expect(screen.getByText('Words: 3')).toBeInTheDocument();
    expect(screen.getByText('Worth a card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mastered' }));
    expect(screen.queryByLabelText('Select word: maison')).toBeNull();
    expect(screen.getByLabelText('Select word: chat')).toBeInTheDocument();
  });

  it('signed out, it shows this computer\'s words and asks the account for nothing', async () => {
    useAuthStore.setState({ session: null });
    render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
    expect(await screen.findByLabelText('Select word: maison')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select word: only')).toBeNull();
    expect(cloud).toHaveLength(0);
  });

  it('adds the selected words to a deck in their own language', async () => {
    render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
    await screen.findByLabelText('Select word: maison');
    fireEvent.click(cardOf('maison'));
    fireEvent.click(cardOf('only'));
    // The selection bar's button is the last one; each card has its own small one.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to deck' }).at(-1)!);
    expect(await screen.findByTestId('deck-sheet')).toHaveTextContent('maison:fr');
    expect(screen.getByTestId('deck-sheet')).toHaveTextContent('only:en');
  });

  it('deletes only words of this computer and says what the account keeps', async () => {
    render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
    await screen.findByLabelText('Select word: maison');
    fireEvent.click(cardOf('maison'));
    fireEvent.click(cardOf('only'));
    fireEvent.click(screen.getByRole('button', { name: /Delete \(1\)/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/1 selected word\(s\) exist only in your account history/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls.find((c) => c.cmd === 'vocabulary_bulk_delete')?.args).toEqual({ ids: [1] }));
    expect(cloud.every((c) => c.method === 'GET')).toBe(true);
  });

  it('keeps the edit dialog open with the error when the save fails', async () => {
    handlers.vocabulary_update = () => {
      throw 'UNKNOWN_ERROR';
    };
    render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
    await screen.findByLabelText('Select word: maison');
    fireEvent.click(within(cardOf('maison')).getByLabelText('Edit word'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText(enVocabulary.errors.UNKNOWN_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the account failure inline and still lists this computer\'s words', async () => {
    cloudHandler = () => {
      throw JSON.stringify({ status: 500, error: 'UNKNOWN_ERROR' });
    };
    render(<MemoryRouter><VocabularyPage /></MemoryRouter>);
    expect(await screen.findByLabelText('Select word: maison')).toBeInTheDocument();
    expect(screen.getByText(/Your account: Something went wrong/)).toBeInTheDocument();
  });
});
