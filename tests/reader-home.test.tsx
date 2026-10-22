import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

type Doc = Record<string, unknown>;
const doc = (id: string, over: Doc = {}): Doc => ({
  id,
  title: `Doc ${id}`,
  original_filename: `${id}.pdf`,
  source_kind: 'pdf',
  byte_size: 1000 + id.length,
  page_count: 10,
  word_count: null,
  language: 'en',
  status: 'ready',
  error_code: null,
  last_page: 1,
  last_scroll_pct: 0,
  last_read_at: null,
  created_at: '2026-01-01T00:00:00Z',
  keep_original: true,
  book_edition: null,
  ...over,
});
const book = (id: string, over: Doc = {}) => ({
  id,
  slug: id,
  language: 'fr',
  title: `Book ${id}`,
  author: 'Auteur',
  kind: 'original',
  level: 'A1',
  summary: 'Un résumé.',
  series_slug: null,
  series_title: null,
  series_order: null,
  tags: [],
  cover_path: null,
  word_count: 450,
  page_count: 10,
  license: 'own',
  published_at: null,
  updated_at: '2026-01-01',
  ...over,
});

let documents: Doc[] = [];
let deleteFails = false;
let listFails = false;
const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  switch (command) {
    case 'reader_list':
      if (listFails) throw 'DOCUMENTS_FETCH_FAILED';
      return { items: documents, total: documents.length };
    case 'get_setting':
      return args?.key === 'target_language' ? 'fr' : null;
    case 'reader_delete':
      if (deleteFails) throw 'DOCUMENT_NOT_FOUND';
      documents = documents.filter((d) => d.id !== args?.documentId);
      return { ok: true };
    case 'reader_check_duplicate':
      return documents.filter((d) => d.byte_size === args?.byteSize);
    default:
      return { ok: true };
  }
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...a: unknown[]) => invoke(...(a as [string, Record<string, unknown>?])),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

let catalog: unknown[] = [];
let shelf: unknown[] = [];
const supabaseCall = vi.fn(async (_m: string, path: string) => {
  if (path.includes('action=catalog')) return { books: catalog, facets: {} };
  if (path.includes('action=shelf-remove')) {
    shelf = [];
    return { ok: true };
  }
  if (path.includes('action=shelf')) return { items: shelf };
  return {};
});
vi.mock('@/lib/supabase', () => ({
  supabaseCall: (...a: unknown[]) => supabaseCall(...(a as [string, string])),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k),
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { ReaderPage } from '@/pages/reader/ReaderPage';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/hooks/useLanguageSettings';

const session = { access_token: 't', refresh_token: 'r', user_id: 'u', email: 'x@example.com', expires_at: 9999999999 };

function mount() {
  return render(
    <MemoryRouter initialEntries={['/reader']}>
      <Routes>
        <Route path="reader/*" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  documents = [];
  catalog = [];
  shelf = [];
  deleteFails = false;
  listFails = false;
  invoke.mockClear();
  supabaseCall.mockClear();
  useAuthStore.setState({ session: null, isLoading: false });
  useLanguageStore.setState({ hydrated: false, hydrating: false, targetLang: 'en', dirty: new Set() });
});

describe('reading home', () => {
  it('shows a skeleton while loading, then the empty state signed out, with the sign-in hint and no cloud call', async () => {
    mount();
    expect(screen.getByTestId('reader-loading')).toBeInTheDocument();
    expect(await screen.findByText('library.empty')).toBeInTheDocument();
    expect(screen.getByText('home.signInHint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'home.add' })).toBeInTheDocument();
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('shows an inline, retryable error when the documents cannot be loaded', async () => {
    listFails = true;
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.DOCUMENTS_FETCH_FAILED');
    listFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'home.retry' }));
    expect(await screen.findByText('library.empty')).toBeInTheDocument();
  });

  it('signed out: the continue card, rows and the sign-in hint where books would be', async () => {
    documents = [
      doc('a', { last_read_at: '2026-03-01T00:00:00Z', last_page: 4, title: 'Newest' }),
      doc('b', { last_read_at: '2026-02-01T00:00:00Z', title: 'Older', source_kind: 'image' }),
    ];
    mount();
    const heading = await screen.findByRole('heading', { name: 'Newest' });
    const card = heading.closest('section') as HTMLElement;
    expect(within(card).getByText('home.continueEyebrow')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /shelf\.continue/ })).toHaveAttribute('href', '/reader/pdf/a');
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('Older')).toBeInTheDocument();
    expect(screen.getByText('home.kind.image')).toBeInTheDocument();
    expect(screen.getByText('home.signInHint')).toBeInTheDocument();
    expect(supabaseCall).not.toHaveBeenCalled();
  });

  it('collapses the queue to 6 rows and expands with Show all', async () => {
    documents = Array.from({ length: 9 }, (_, i) =>
      doc(`d${i}`, { title: `Doc ${i}`, last_read_at: `2026-03-0${i + 1}T00:00:00Z` }),
    );
    mount();
    await screen.findByRole('heading', { name: 'Doc 8' });
    // 8 behind the card, 6 shown.
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'home.showAll{"n":2}' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'home.showLess' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('deletes a document after a confirmation, and keeps the dialog open with the error when it fails', async () => {
    documents = [doc('a', { title: 'Keep me', last_read_at: '2026-03-01T00:00:00Z' }), doc('b', { title: 'Delete me' })];
    deleteFails = true;
    mount();
    await screen.findByRole('heading', { name: 'Keep me' });
    const row = screen.getByText('Delete me').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'home.more' }));
    fireEvent.click(await screen.findByRole('button', { name: 'library.delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('library.deleteTitle')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'library.delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('errors.DOCUMENT_NOT_FOUND');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    deleteFails = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'library.delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Delete me')).not.toBeInTheDocument());
  });

  it('signed in: first visit leads with one book at the learning language, suggestions beside it', async () => {
    useAuthStore.setState({ session, isLoading: false });
    catalog = [
      book('f1', { title: 'Premier livre' }),
      book('f2', { title: 'Deuxième livre' }),
      book('e1', { language: 'en', title: 'English one' }),
    ];
    mount();
    const lead = await screen.findByRole('heading', { name: 'Premier livre' });
    expect(within(lead.closest('section') as HTMLElement).getByText('home.first.pick')).toBeInTheDocument();
    expect(within(lead.closest('section') as HTMLElement).getByRole('link', { name: /home\.startEyebrow/ })).toHaveAttribute('href', '/reader/book/f1');
    expect(screen.getByText('Deuxième livre')).toBeInTheDocument();
    expect(screen.queryByText('English one')).not.toBeInTheDocument();
    expect(screen.getByText('home.nextAt{"level":"A1"}')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home\.browse/ })).toHaveAttribute('href', '/reader/library');
    expect(screen.queryByText('home.signInHint')).not.toBeInTheDocument();
  });

  it('signed in: a shelved book sits in the queue with its remove action; documents and books are merged', async () => {
    useAuthStore.setState({ session, isLoading: false });
    const b = book('s1', { title: 'Shelf book', page_count: 20 });
    shelf = [
      { book_id: 's1', last_page: 5, last_scroll_pct: 0, last_read_at: '2026-03-05T00:00:00Z', added_at: '2026-03-01T00:00:00Z', finished_at: null, book: b },
    ];
    catalog = [b, book('f2', { title: 'Next one' })];
    documents = [doc('a', { title: 'My scan', last_read_at: '2026-03-02T00:00:00Z' })];
    mount();
    const card = (await screen.findByRole('heading', { name: 'Shelf book' })).closest('section') as HTMLElement;
    expect(within(card).getByText(/shelf\.page\{"n":5,"total":20\}/)).toBeInTheDocument();
    expect(screen.getByText('My scan')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'home.more' }));
    fireEvent.click(await screen.findByRole('button', { name: 'catalog.remove' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('home.removeTitle')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'catalog.remove' }));
    await waitFor(() => expect(supabaseCall).toHaveBeenCalledWith('POST', '/library?action=shelf-remove', { book_id: 's1' }));
  });

  it('signed in but the cloud fails: documents still show, with a quiet note', async () => {
    useAuthStore.setState({ session, isLoading: false });
    supabaseCall.mockRejectedValue('NETWORK');
    documents = [doc('a', { title: 'Local only', last_read_at: '2026-03-02T00:00:00Z' })];
    mount();
    expect(await screen.findByRole('heading', { name: 'Local only' })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('home.libraryFailed');
    supabaseCall.mockImplementation(async () => ({}));
  });

  it('the Add dialog: choosing a PDF that is already here offers it, with Open it and Add again', async () => {
    documents = [doc('a', { title: 'Already here', byte_size: 4242, last_read_at: '2026-03-02T00:00:00Z', last_page: 3 })];
    const { container } = mount();
    await screen.findByRole('heading', { name: 'Already here' });
    fireEvent.click(screen.getByRole('button', { name: 'home.add' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('upload.hint.file')).toBeInTheDocument();
    expect(within(dialog).getByText('upload.privacy')).toBeInTheDocument();

    // A file dropped on the page opens the same dialog with the file chosen.
    const file = new File([new Uint8Array(4242)], 'copy (1).pdf', { type: 'application/pdf' });
    fireEvent.drop(container.firstChild as HTMLElement, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(await within(dialog).findByText('upload.duplicate.title')).toBeInTheDocument();
    expect(within(dialog).getByText(/shelf\.page\{"n":3,"total":10\}/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'upload.duplicate.open' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'upload.duplicate.again' }));
    // The language select now appears, defaulting to the learning language.
    const select = (await within(dialog).findByLabelText('upload.language')) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('fr'));
    expect(within(dialog).getByRole('button', { name: 'upload.submit' })).toBeEnabled();
  });

  it('the Add dialog: an unsupported file is refused inline and nothing is imported', async () => {
    const { container } = mount();
    await screen.findByText('library.empty');
    fireEvent.drop(container.firstChild as HTMLElement, {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })], types: ['Files'] },
    });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('errors.UNSUPPORTED_FILE_TYPE');
    expect(invoke).not.toHaveBeenCalledWith('reader_import_path', expect.anything());
  });
});
