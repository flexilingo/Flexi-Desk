import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));

import {
  getReaderFileUrl,
  getReaderWords,
  importReaderBytes,
  saveReaderNote,
  deleteReaderDocument,
} from '@/pages/reader/services/readerService';

beforeEach(() => invoke.mockReset());

describe('readerService', () => {
  it('passes cloud-shaped bodies through as one `input` object', async () => {
    invoke.mockResolvedValue({ id: 'n1' });
    const body = {
      document_id: 'd1',
      page: 2,
      quote: 'q',
      body: 'b',
      rect: { x: 1, y: 2, w: 3, h: 4 },
    };
    await saveReaderNote(body);
    expect(invoke).toHaveBeenCalledWith('reader_save_note', { input: body });
  });

  it('maps query arguments onto the command parameter names', async () => {
    invoke.mockResolvedValue({ ok: true });
    await deleteReaderDocument({ document_id: 'd9' });
    expect(invoke).toHaveBeenCalledWith('reader_delete', { documentId: 'd9' });

    invoke.mockResolvedValue({ items: [], total_events: 0 });
    await getReaderWords({ documentId: 'd1', sessionId: 's1' });
    expect(invoke).toHaveBeenLastCalledWith('reader_words', { input: { document_id: 'd1', session_id: 's1' } });
  });

  it('builds the file URL from the stored path and the document row', async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === 'reader_file_path'
        ? Promise.resolve('/data/reader/a.pdf')
        : Promise.resolve({
            language: 'fr',
            last_page: 7,
            page_count: 90,
            book_edition: null,
            extraction_method: null,
            text_layer_status: 'ready',
          }),
    );
    const r = await getReaderFileUrl('a');
    expect(r.url).toBe('asset://localhost/%2Fdata%2Freader%2Fa.pdf');
    expect(r).toMatchObject({ language: 'fr', last_page: 7, page_count: 90, text_layer_status: 'ready' });
  });

  it('sends raw bytes with percent-encoded headers', async () => {
    invoke.mockResolvedValue({ id: 'x' });
    await importReaderBytes(new Uint8Array([37, 80]), { fileName: 'Café 1.pdf', kind: 'image', language: 'fr' });
    const [cmd, body, opts] = invoke.mock.calls[0];
    expect(cmd).toBe('reader_import_bytes');
    expect(body).toBeInstanceOf(Uint8Array);
    expect(opts.headers).toEqual({ 'x-kind': 'image', 'x-file-name': 'Caf%C3%A9%201.pdf', 'x-language': 'fr' });
  });
});
