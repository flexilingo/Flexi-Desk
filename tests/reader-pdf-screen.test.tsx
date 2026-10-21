import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

const DOC = {
  id: 'doc1',
  title: 'Sample Textbook',
  language: 'fr',
  last_page: 1,
  page_count: null,
};

const invoke = vi.fn(async (command: string) => {
  switch (command) {
    case 'reader_get':
      return DOC;
    case 'reader_file_path':
      return '/data/reader/doc1.pdf';
    case 'reader_notes':
      return { items: [] };
    case 'reader_start_session':
      return { session_id: 's1', resumed: false };
    default:
      return { ok: true };
  }
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...(args as [string])),
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn(async () => ({})) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// A pdf.js with one blank 3-page document: no worker, no canvas.
const destroy = vi.fn();
const fakePage = {
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale, userUnit: 1, rotation: 0 }),
  render: () => ({ cancel: () => {}, promise: Promise.resolve() }),
  streamTextContent: () => ({}),
  getOperatorList: async () => ({ fnArray: [] }),
};
const fakePdf = { numPages: 3, getPage: async () => fakePage, loadingTask: { destroy } };
const getDocument = vi.fn((_opts: unknown) => ({ onProgress: null, promise: Promise.resolve(fakePdf) }));
vi.mock('@/pages/reader/lib/pdfjs', () => ({
  PDF_ASSET_OPTIONS: { cMapUrl: '/pdf-worker/cmaps/' },
  destroyDocument: async () => {},
  loadPdfjs: async () => ({
    getDocument: (opts: unknown) => getDocument(opts),
    TextLayer: class {
      textDivs: HTMLElement[] = [];
      textContentItemsStr: string[] = [];
      async render() {}
      cancel() {}
    },
    OPS: {},
  }),
}));

import { ReaderPage } from '@/pages/reader/ReaderPage';

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="reader/*" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  invoke.mockClear();
  getDocument.mockClear();
});

describe('/reader/pdf/:documentId', () => {
  it('opens the stored file by its asset URL and shows the toolbar and the pages', async () => {
    const { container } = mount('/reader/pdf/doc1');
    // The file's title and page count arrive once pdf.js has opened the document.
    await screen.findByText('Sample Textbook');
    await screen.findByText('/ 3');

    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(getDocument.mock.calls[0][0]).toMatchObject({
      url: 'asset://localhost/%2Fdata%2Freader%2Fdoc1.pdf',
      cMapUrl: '/pdf-worker/cmaps/',
    });
    await waitFor(() => expect(container.querySelectorAll('[data-page]').length).toBe(3));

    const commands = invoke.mock.calls.map((c) => c[0]);
    expect(commands).toEqual(expect.arrayContaining(['reader_get', 'reader_file_path', 'reader_notes']));
    // A session is opened, and the viewer reports the page count the library did not have yet.
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reader_start_session', { input: { document_id: 'doc1', page: 1, page_count: 3 } }));
    expect(invoke).toHaveBeenCalledWith('reader_set_page_count', { input: { document_id: 'doc1', page_count: 3 } });
  });

  it('says so, translated, when the file cannot be opened', async () => {
    getDocument.mockImplementationOnce(() => ({ onProgress: null, promise: Promise.reject(Object.assign(new Error('x'), { name: 'PasswordException' })) }));
    mount('/reader/pdf/doc1');
    expect(await screen.findByRole('alert')).toHaveTextContent('errors.PDF_PASSWORD_PROTECTED');
  });

  it('writes the bookmark when the reader leaves, but only after the resume jump', async () => {
    const { unmount } = mount('/reader/pdf/doc1');
    await screen.findByText('/ 3');
    await act(async () => {
      unmount();
    });
    // Still on the page it was resumed to: nothing to flush.
    expect(invoke).not.toHaveBeenCalledWith('reader_set_position', expect.anything());
  });
});

describe('/reader', () => {
  it('has one button that opens a PDF', async () => {
    invoke.mockImplementationOnce(async () => ({ items: [{ id: 'd1', title: 'Old book' }], total: 1 }));
    mount('/reader');
    expect(screen.getByRole('button', { name: /home\.openPdf/ })).toBeInTheDocument();
    expect(await screen.findByText('Old book')).toBeInTheDocument();
  });
});
