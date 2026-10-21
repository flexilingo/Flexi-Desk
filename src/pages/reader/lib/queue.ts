import type { LibraryShelfItem, CefrLevel } from '../services/libraryService';
import type { ReaderDocument } from '../types';
import { bookReadPath, coverFor } from '../library/format';

export type ReadingKind = 'book' | 'pdf' | 'image';

/**
 * One thing the reader can continue — a library book on their shelf or a file
 * they added, flattened to the same shape.
 *
 * The two used to be separate lists with separate headings, separate metadata
 * and separate buttons, even though they answer the same question: what can I
 * read right now. Everything that differs between them is a field here, not a
 * second component.
 */
export interface ReadingItem {
  id: string;
  kind: ReadingKind;
  title: string;
  language: string;
  /** A library book's cover; a document has none and shows its kind instead. */
  cover: { slug: string; path: string } | null;
  /** Books carry a CEFR level; a document is whatever the reader brought. */
  level: CefrLevel | null;
  /** Where the primary action goes. */
  href: string;
  /** The same thing in the other reader, when it has one (never, for a local PDF). */
  altHref: string | null;
  page: number;
  pageCount: number | null;
  /** 0–100, or null when there is nothing to measure yet. */
  progress: number | null;
  started: boolean;
  finished: boolean;
  status: 'ready' | 'processing' | 'failed';
  errorCode: string | null;
  /** Most recent activity, for ordering. */
  activityAt: number;
  bookId: string | null;
  documentId: string | null;
}

const time = (value: string | null | undefined) => (value ? Date.parse(value) : 0);

const percent = (page: number, total: number | null) =>
  total && total > 0 ? Math.min(100, Math.round((page / total) * 100)) : null;

function fromBook(item: LibraryShelfItem): ReadingItem {
  const { book } = item;
  const finished = !!item.finished_at;
  const started = !!item.last_read_at;
  return {
    id: `book:${item.book_id}`,
    kind: 'book',
    title: book.title,
    language: book.language,
    cover: { slug: book.slug, path: coverFor(book) },
    level: book.level,
    href: bookReadPath(book.id, item.last_page),
    altHref: null,
    page: item.last_page,
    pageCount: book.page_count,
    // Nothing to measure before the first page is read: page 1 of 4 is not 25%.
    progress: finished ? 100 : started ? percent(item.last_page, book.page_count) : null,
    started,
    finished,
    status: 'ready',
    errorCode: null,
    activityAt: Math.max(time(item.last_read_at), time(item.added_at)),
    bookId: item.book_id,
    documentId: null,
  };
}

function fromDocument(doc: ReaderDocument): ReadingItem {
  // A local document is always read as its real pages: there is no extracted
  // text view on the desk, so there is no second view to offer.
  const finished = !!doc.finished_at;
  return {
    id: `doc:${doc.id}`,
    kind: doc.source_kind === 'image' ? 'image' : 'pdf',
    title: doc.title,
    language: doc.language,
    cover: null,
    level: null,
    href: `/reader/pdf/${doc.id}`,
    altHref: null,
    page: doc.last_page,
    pageCount: doc.page_count,
    progress: finished
      ? 100
      : doc.status === 'ready' && doc.last_read_at
        ? percent(doc.last_page, doc.page_count)
        : null,
    started: !!doc.last_read_at,
    finished,
    status: doc.status,
    errorCode: doc.error_code,
    activityAt: Math.max(time(doc.last_read_at), time(doc.created_at)),
    bookId: null,
    documentId: doc.id,
  };
}

/**
 * Everything the reader can continue, newest activity first.
 *
 * A document still being processed sorts by when it was added, which puts it
 * at the top where the reader is waiting for it.
 */
export function buildReadingQueue(
  documents: ReaderDocument[] | undefined,
  shelf: LibraryShelfItem[] | undefined,
): ReadingItem[] {
  return [...(shelf ?? []).map(fromBook), ...(documents ?? []).map(fromDocument)].sort(
    (a, b) => b.activityAt - a.activityAt,
  );
}
