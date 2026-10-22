import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type {
  ReaderDocument,
  ReaderPage,
  ReaderInspectedPath,
  ReaderMark,
  ReaderMarkKind,
  ReaderNote,
  ReaderTextBox,
  ReaderTextLayerPage,
  ReaderTextLayerStatus,
  ReaderOcrSummary,
  ReaderWordSummary,
  ReaderExtractionMethod,
  OcrWords,
} from '../types';

/**
 * Local Reader data layer. Function names follow the website's `readerApi.ts`
 * endpoints and every request/response has the same field names, so the ported
 * components only swap their data hooks for these calls.
 *
 * Documents never leave this computer: the file lives in `$APPDATA/reader/`, and
 * extraction (text layer, OCR) is local. There is no upload, no Pro gate and no
 * size / page cap. Errors are rejected as the backend's code string
 * (`DOCUMENT_NOT_FOUND`, ...), to be resolved through i18n with an
 * `UNKNOWN_ERROR` fallback.
 */

// ── Import (replaces upload / create-upload / finalize-upload) ───────────────

/** Size + duplicate check for a file the user chose, before importing it. */
export const inspectReaderPath = (path: string) =>
  invoke<ReaderInspectedPath>('reader_inspect_path', { path });

export const checkReaderDuplicate = (byteSize: number) =>
  invoke<ReaderDocument[]>('reader_check_duplicate', { byteSize });

/** Copy a PDF the user picked into the app's reader folder. */
export const importReaderPath = (input: { path: string; language?: string; title?: string }) =>
  invoke<ReaderDocument>('reader_import_path', { input });

/**
 * Import PDF bytes held in JS (a photo already converted to a PDF). Sent as the raw
 * IPC body, not as a JSON number array, so large scans stay cheap.
 */
export const importReaderBytes = (
  bytes: Uint8Array,
  meta: { fileName: string; kind?: 'pdf' | 'image'; language?: string; title?: string },
) => {
  const headers: Record<string, string> = {
    'x-file-name': encodeURIComponent(meta.fileName),
    'x-kind': meta.kind ?? 'pdf',
  };
  if (meta.language) headers['x-language'] = encodeURIComponent(meta.language);
  if (meta.title) headers['x-title'] = encodeURIComponent(meta.title);
  return invoke<ReaderDocument>('reader_import_bytes', bytes, { headers });
};

// ── Text documents: a pasted text or a web page, stored as pages on this computer ─

export const importReaderText = (input: { text: string; title?: string; language?: string }) =>
  invoke<ReaderDocument>('reader_import_text', { input });

/** Fetches the page from this computer and keeps its prose. */
export const importReaderUrl = (input: { url: string; title?: string; language?: string }) =>
  invoke<ReaderDocument>('reader_import_url', { input });

/** One page of a text document; a page past the end opens the last one. */
export const getReaderTextPage = (documentId: string, page: number) =>
  invoke<ReaderPage>('reader_text_page', { input: { document_id: documentId, page } });

// ── Documents ────────────────────────────────────────────────────────────────

export const getReaderDocuments = () =>
  invoke<{ items: ReaderDocument[]; total: number }>('reader_list');

export const getReaderDocument = (documentId: string) =>
  invoke<ReaderDocument>('reader_get', { documentId });

export const renameReaderDocument = (body: { document_id: string; title: string }) =>
  invoke<{ ok: boolean; title: string }>('reader_rename', { input: body });

/** Deletes the file and every row that hangs off the document. */
export const deleteReaderDocument = (body: { document_id: string }) =>
  invoke<{ ok: boolean }>('reader_delete', { documentId: body.document_id });

/** Bookmark. `finished` (desk only) sets or clears the document's finished mark. */
export const setReaderPosition = (body: {
  document_id: string;
  page: number;
  scroll_pct?: number;
  finished?: boolean;
}) => invoke<{ ok: boolean; last_page: number }>('reader_set_position', { input: body });

export const setReaderLanguage = (body: { document_id: string; language: string }) =>
  invoke<{ ok: boolean; language: string }>('reader_set_language', { input: body });

export const setReaderEdition = (body: { document_id: string; edition: string | null }) =>
  invoke<{ ok: boolean; book_edition: string | null }>('reader_set_edition', { input: body });

/** The viewer reports the page count once pdf.js has opened the file. */
export const setReaderPageCount = (body: { document_id: string; page_count: number }) =>
  invoke<{ ok: boolean }>('reader_set_page_count', { input: body });

/** Absolute path of the stored file. */
export const getReaderFilePath = (documentId: string) =>
  invoke<string>('reader_file_path', { documentId });

/**
 * Same response shape as `reader?action=file-url`; `url` is an asset-protocol URL
 * (scope `$APPDATA/reader/**`) that pdf.js can fetch.
 */
export const getReaderFileUrl = async (documentId: string) => {
  const [doc, path] = await Promise.all([
    getReaderDocument(documentId),
    getReaderFilePath(documentId),
  ]);
  return {
    url: convertFileSrc(path),
    language: doc.language,
    last_page: doc.last_page,
    page_count: doc.page_count,
    book_edition: doc.book_edition,
    extraction_method: doc.extraction_method as ReaderExtractionMethod | null,
    text_layer_status: doc.text_layer_status as ReaderTextLayerStatus | null | undefined,
  };
};

// ── Sessions and looked-up words ─────────────────────────────────────────────

export const startReaderSession = (body: {
  document_id: string;
  page: number;
  page_count?: number;
}) => invoke<{ session_id: string; resumed: boolean }>('reader_start_session', { input: body });

/** Fire-and-forget: a lookup that fails to log must not disturb the reading. */
export const logReaderWord = (body: {
  document_id: string;
  session_id?: string;
  word: string;
  context?: string;
  page: number;
}) => invoke<{ ok: boolean }>('reader_log_word', { input: body });

export const getReaderWords = (args: { documentId: string; sessionId?: string }) =>
  invoke<{ items: ReaderWordSummary[]; total_events: number }>('reader_words', {
    input: { document_id: args.documentId, session_id: args.sessionId },
  });

// ── Notes ────────────────────────────────────────────────────────────────────

export const getReaderNotes = (documentId: string) =>
  invoke<{ items: ReaderNote[] }>('reader_notes', { documentId });

export const saveReaderNote = (body: {
  id?: string;
  document_id: string;
  page: number;
  quote: string;
  body: string;
  run_start?: number | null;
  run_end?: number | null;
  rect: { x: number; y: number; w: number; h: number };
}) => invoke<{ id: string }>('reader_save_note', { input: body });

export const deleteReaderNote = (body: { id: string; document_id?: string }) =>
  invoke<{ ok: boolean }>('reader_delete_note', { input: { id: body.id } });

// ── Text boxes ───────────────────────────────────────────────────────────────

export const getReaderTextBoxes = (documentId: string) =>
  invoke<{ items: ReaderTextBox[] }>('reader_text_boxes', { documentId });

export const saveReaderTextBox = (body: {
  id?: string;
  document_id: string;
  page: number;
  body: string;
  x: number;
  y: number;
  w: number;
  font_size: number;
  color: ReaderTextBox['color'];
  bold: boolean;
  background: boolean;
}) => invoke<{ id: string }>('reader_save_text_box', { input: body });

export const deleteReaderTextBox = (body: { id: string }) =>
  invoke<{ ok: boolean }>('reader_delete_text_box', { input: body });

// ── Marks ────────────────────────────────────────────────────────────────────

export const getReaderMarks = (documentId: string) =>
  invoke<{ items: ReaderMark[] }>('reader_marks', { documentId });

export const saveReaderMark = (body: {
  id?: string;
  document_id: string;
  page: number;
  kind: ReaderMarkKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  color: ReaderMark['color'];
}) => invoke<{ id: string }>('reader_save_mark', { input: body });

export const deleteReaderMark = (body: { id: string }) =>
  invoke<{ ok: boolean }>('reader_delete_mark', { input: body });

// ── OCR text layer (the extraction itself arrives in phase D) ────────────────

/** One page's OCR words and the layer's state; without `page`, the state alone. */
export const getReaderTextLayer = (args: { documentId: string; page?: number }) =>
  invoke<ReaderTextLayerPage>('reader_ocr_page_get', {
    input: { document_id: args.documentId, page: args.page },
  });

/** Store one page's words, or record that reading the page failed (omit `words`). */
export const saveReaderOcrPage = (body: {
  document_id: string;
  page: number;
  words?: OcrWords | null;
  error_code?: string;
}) => invoke<ReaderTextLayerPage>('reader_ocr_page_save', { input: body });

export const getReaderOcrSummary = (documentId: string) =>
  invoke<ReaderOcrSummary>('reader_ocr_summary', { documentId });

/** The local extractor reports it started (`running`, with the total), finished, or failed. */
export const setReaderTextLayerState = (body: {
  document_id: string;
  status: ReaderTextLayerStatus;
  pages_total?: number;
  error_code?: string;
}) => invoke<ReaderTextLayerPage>('reader_set_text_layer_state', { input: body });
