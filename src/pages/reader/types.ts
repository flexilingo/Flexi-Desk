/**
 * Reader types. Copied from the website (`flexi-lingo-front`: `store/readerApi.ts`,
 * `features/pdf-reader/lib/{book-audio,ocr-text-content}.ts`) so the local data layer
 * and the ported components speak exactly the same shapes. Do not rename fields.
 *
 * Desk differences, all additive: `ReaderDocument.finished_at`, and the types at the
 * bottom (`ReaderOcrSummary`, ...) that only the local layer has.
 */

/** `reader_pages.ocr_words`, as the worker writes it (workers/pdf.py). */
export interface OcrWords {
  v: 1;
  /** Each line's box: the union of its words. */
  lines: Array<[number, number, number, number]>;
  /** [text, x0, y0, x1, y1, lineIndex] — in reading order. */
  words: Array<[string, number, number, number, number, number]>;
}

export interface BookEdition {
  id: string;
  label: string;
  /** The language the book teaches — its recordings are in it. */
  language: string;
  /** How many recordings the edition has. The list runs 1…this. */
  track_count: number;
  /**
   * URL shape with `{track}`, `{track2}`, `{track3}` and `{folder}` placeholders.
   * `storage://…` for a book whose recordings we hold: those are signed by the
   * server instead — see `isHostedAudio`.
   */
  audio_url_template: string;
  audio_folder_base: number | null;
  /** PDF page minus printed page, for the written-out `tracks`. */
  page_offset?: number;
  /** The book's videos, in the publisher's order. Empty for a book without any. */
  videos?: BookVideo[];
  /**
   * The book's track list, written out on the server for a copy whose own
   * index cannot be read — a scan. Empty when the index is read from the PDF.
   */
  tracks?: BookTrackEntry[];
}

/** One row of `book_edition_tracks`: the book's own index, entry by entry. */
export interface BookTrackEntry {
  track: number;
  /** The PRINTED page; null for a track that belongs to no page (an introduction). */
  printed_page: number | null;
  title: string;
  unit: string | null;
}

/**
 * One of a book's videos — see the `book_edition_videos` migration.
 *
 * Two files on the publisher's own site: the plain cut and the one with
 * French subtitles. The page is the PRINTED one; add `TrackIndex.offset` to get
 * the PDF page, the same correction the recordings get.
 */
export interface BookVideo {
  number: number;
  title: string;
  printed_page: number | null;
  /** The code printed in the book, e.g. `neda1501`. */
  code: string | null;
  video_url: string;
  subtitled_url: string | null;
}

export type ReaderStatus = 'processing' | 'ready' | 'failed';
export type ReaderSourceKind = 'pdf' | 'image' | 'text';
export type ReaderExtractionMethod = 'text' | 'ocr' | 'mixed';

/**
 * The OCR text layer that makes a scanned page tappable in the pages view.
 * Null until something asks for one; see `reader?action=request-text-layer`.
 */
export type ReaderTextLayerStatus = 'pending' | 'running' | 'ready' | 'failed';
export type ReaderTextLayerScope = 'preview' | 'full';

export interface ReaderTextLayerState {
  status: ReaderTextLayerStatus | null;
  /** Scanned pages read so far, out of `pages_total` (null until the worker has counted them). */
  pages_done: number;
  pages_total: number | null;
  /** Why a layer failed, as an error code for `errors.json`. */
  error_code: string | null;
  /**
   * 'preview' — a free or trial account's layer: the page it opened and the
   * next scanned one. Every other scanned page is locked behind Pro.
   */
  scope?: ReaderTextLayerScope | null;
}

/** One page of the layer: the document's state, plus this page's words once read. */
export interface ReaderTextLayerPage extends ReaderTextLayerState {
  /** Null when the document's state alone was asked for. */
  page: number | null;
  words: OcrWords | null;
}

export interface ReaderDocument {
  id: string;
  title: string;
  original_filename: string;
  source_kind: ReaderSourceKind;
  byte_size: number;
  page_count: number | null;
  word_count: number | null;
  language: string;
  extraction_method: ReaderExtractionMethod | null;
  status: ReaderStatus;
  error_code: string | null;
  last_page: number;
  last_scroll_pct: number;
  last_read_at: string | null;
  created_at: string;
  /** Whether the uploaded file is still stored — i.e. whether it can be read as real pages. */
  keep_original: boolean;
  /** Which published edition this is, if the reader named one. Unlocks that book's audio. */
  book_edition: string | null;
  /** The OCR text layer for scanned pages in the pages view. */
  text_layer_status?: ReaderTextLayerStatus | null;
  text_layer_pages_done?: number | null;
  text_layer_pages_total?: number | null;
  /** Desk only: set when the reader marks the document finished. */
  finished_at?: string | null;
}

export interface ReaderPage {
  document_id: string;
  title: string;
  language: string;
  page_number: number;
  page_count: number;
  content: string;
  word_count: number;
  char_count: number;
  truncated: boolean;
  has_prev: boolean;
  has_next: boolean;
}

export interface ReaderPageWord {
  word: string;
  cefr: string | null;
}

/** A word the reader opened while reading, folded together across its lookups. */
export interface ReaderWordSummary {
  word: string;
  key: string;
  /** How many times it was opened. Repetition is the signal worth reviewing. */
  count: number;
  pages: number[];
  context: string | null;
  last_seen: string;
}

export interface ReaderNote {
  id: string;
  page_number: number;
  quote: string;
  body: string;
  run_start: number | null;
  run_end: number | null;
  /** Percentages of the page box, so a note keeps its place at any zoom. */
  rect_x: number;
  rect_y: number;
  rect_w: number;
  rect_h: number;
  created_at: string;
  updated_at: string;
}

/** Text a learner wrote on a page. Everything is a percentage of the page box. */
export interface ReaderTextBox {
  id: string;
  page_number: number;
  body: string;
  x: number;
  y: number;
  w: number;
  /** Text size as a percentage of the page's width. */
  font_size: number;
  /**
   * Ink: a palette name (terra, ink, olive, danger) or the learner's own
   * `#rrggbb`. Validated to that shape by the handler and the table — see the
   * `reader_text_boxes` migrations.
   */
  color: string;
  bold: boolean;
  /** Drawn on its own white background, over the print. Absent from rows saved before it existed. */
  background?: boolean;
  updated_at: string;
}

/** What a mark on the page is. The three kinds of shape, and the stamps. */
export type ReaderMarkKind =
  | 'arrow'
  | 'box'
  | 'check'
  | 'cross'
  | 'question'
  | 'star'
  | 'highlight';

/**
 * A mark drawn on a page — see the `reader_marks` migration.
 *
 * Two points as percentages of the page box: an arrow's tail and head, a box's
 * opposite corners, a stamp's centre (twice). `size` is a share of the page's
 * width: a stamp's height, and the weight a line is drawn with.
 */
export interface ReaderMark {
  id: string;
  page_number: number;
  kind: ReaderMarkKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  /** Same shape as a text box's ink: a palette name or `#rrggbb`. */
  color: string;
  updated_at: string;
}

/**
 * Where the learner stands on one book's recordings — see `reader?action=track-listens`.
 * A track's subtitles open at `required` full listens.
 */
export interface BookTrackListens {
  edition: string;
  required: number;
  /** Full listens per track number; a track not in here has none. */
  listens: Record<number, number>;
  /** The tracks that have subtitles at all. */
  subtitled: number[];
}

export interface BookTrackSubtitles {
  edition: string;
  track: number;
  /** False when the track has no subtitles at all — not the same as locked. */
  available: boolean;
  locked: boolean;
  listens: number;
  required: number;
  /** Only once unlocked. */
  language?: string;
  segments?: { start: number; end: number; text: string }[];
  /** While locked: when each line starts and ends, without its text — for the line steps. */
  lines?: { start: number; end: number }[];
}

// ── Desk-only: the local data layer ──────────────────────────────────────────

export interface ReaderInspectedPath {
  file_name: string;
  byte_size: number;
  /** Documents already in the library with exactly this size. */
  duplicates: ReaderDocument[];
}

export interface ReaderOcrSummary {
  state: ReaderTextLayerPage;
  ready_pages: number[];
  failed_pages: number[];
}
