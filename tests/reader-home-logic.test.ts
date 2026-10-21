import { describe, it, expect } from 'vitest';
import { buildReadingQueue } from '@/pages/reader/lib/queue';
import { suggestBooks } from '@/pages/reader/lib/suggest';
import { sameFile } from '@/pages/reader/lib/duplicate';
import { addKindOf, baseName, imageMimeOf } from '@/pages/reader/lib/add-document';
import { actionLabel, progressLine } from '@/pages/reader/lib/reading-copy';
import { bookReadPath, readingMinutes } from '@/pages/reader/library/format';
import type { LibraryBook, LibraryShelfItem } from '@/pages/reader/services/libraryService';
import type { ReaderDocument } from '@/pages/reader/types';

const book = (id: string, over: Partial<LibraryBook> = {}): LibraryBook => ({
  id,
  slug: id,
  language: 'fr',
  title: `Book ${id}`,
  author: 'A',
  kind: 'original',
  level: 'A1',
  summary: '',
  series_slug: null,
  series_title: null,
  series_order: null,
  tags: [],
  cover_path: null,
  word_count: 450,
  page_count: 10,
  license: 'own',
  source_url: null,
  attribution: null,
  published_at: null,
  updated_at: '2026-01-01',
  ...over,
});

const shelfItem = (b: LibraryBook, over: Partial<LibraryShelfItem> = {}): LibraryShelfItem => ({
  book_id: b.id,
  last_page: 1,
  last_scroll_pct: 0,
  last_read_at: null,
  added_at: '2026-01-01T00:00:00Z',
  finished_at: null,
  book: b,
  ...over,
});

const doc = (id: string, over: Partial<ReaderDocument> = {}): ReaderDocument =>
  ({
    id,
    title: `Doc ${id}`,
    original_filename: `${id}.pdf`,
    source_kind: 'pdf',
    byte_size: 1000,
    page_count: 10,
    word_count: null,
    language: 'en',
    extraction_method: null,
    status: 'ready',
    error_code: null,
    last_page: 1,
    last_scroll_pct: 0,
    last_read_at: null,
    created_at: '2026-01-01T00:00:00Z',
    keep_original: true,
    book_edition: null,
    ...over,
  }) as ReaderDocument;

describe('buildReadingQueue', () => {
  it('interleaves books and documents, newest activity first', () => {
    const b1 = book('b1');
    const q = buildReadingQueue(
      [doc('d1', { created_at: '2026-01-02T00:00:00Z' }), doc('d2', { last_read_at: '2026-03-01T00:00:00Z', last_page: 4 })],
      [shelfItem(b1, { added_at: '2026-02-01T00:00:00Z' })],
    );
    expect(q.map((i) => i.id)).toEqual(['doc:d2', 'book:b1', 'doc:d1']);
  });

  it('routes books to the book page and documents to the pdf pages', () => {
    const b1 = book('b1');
    const [a, b] = buildReadingQueue([doc('d1')], [shelfItem(b1, { last_page: 3, last_read_at: '2026-05-01T00:00:00Z' })]);
    expect(a.href).toBe('/reader/book/b1?page=3');
    expect(b.href).toBe('/reader/pdf/d1');
    expect(b.altHref).toBeNull();
  });

  it('measures progress only once reading has started, and a finished book is 100', () => {
    const b1 = book('b1');
    const q = buildReadingQueue(
      [doc('d1', { last_read_at: '2026-01-05T00:00:00Z', last_page: 5 }), doc('d2')],
      [shelfItem(b1, { finished_at: '2026-01-03T00:00:00Z', last_read_at: '2026-01-03T00:00:00Z' })],
    );
    const by = Object.fromEntries(q.map((i) => [i.id, i]));
    expect(by['doc:d1'].progress).toBe(50);
    expect(by['doc:d2'].progress).toBeNull();
    expect(by['book:b1']).toMatchObject({ progress: 100, finished: true });
  });

  it('keeps a failed document in the list with its error code', () => {
    const [item] = buildReadingQueue([doc('d1', { status: 'failed', error_code: 'FILE_MISSING' })], []);
    expect(item).toMatchObject({ status: 'failed', errorCode: 'FILE_MISSING' });
  });

  it('marks a photo as an image and honours a finished document', () => {
    const [item] = buildReadingQueue([doc('d1', { source_kind: 'image', finished_at: '2026-01-02T00:00:00Z' })], []);
    expect(item).toMatchObject({ kind: 'image', finished: true, progress: 100 });
  });

  it('copes with nothing at all', () => {
    expect(buildReadingQueue(undefined, undefined)).toEqual([]);
  });
});

describe('reading copy', () => {
  const t = ((k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`) as never;
  it('names the action and the position', () => {
    const [item] = buildReadingQueue([doc('d1', { last_read_at: '2026-01-05T00:00:00Z', last_page: 5 })], []);
    expect(actionLabel(item, t, t)).toBe('shelf.continue');
    expect(progressLine(item, t, t)).toBe('shelf.page{"n":5,"total":10}');
    const [fresh] = buildReadingQueue([doc('d2')], []);
    expect(actionLabel(fresh, t, t)).toBe('shelf.start');
    expect(progressLine(fresh, t, t)).toBe('library.pages{"n":10}');
  });
});

describe('suggestBooks', () => {
  const catalog = [
    book('a1', { level: 'A1', series_slug: 's', series_title: 'S', series_order: 1 }),
    book('a2', { level: 'A1', series_slug: 's', series_title: 'S', series_order: 2 }),
    book('b1', { level: 'B1' }),
    book('en1', { language: 'en' }),
  ];

  it('suggests books of the language at the placement level, series in order', () => {
    const r = suggestBooks(catalog, [], 'fr', 'B1');
    expect(r.level).toBe('B1');
    expect(r.books.map((b) => b.id)).toEqual(['b1']);
  });

  it('falls back to the easiest level and then moves up a level', () => {
    const r = suggestBooks(catalog, [], 'fr', null);
    expect(r.level).toBe('A1');
    expect(r.books.map((b) => b.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('leads with the next episode of a series in progress, never a book already on the shelf', () => {
    const a1 = catalog[0];
    const r = suggestBooks(catalog, [shelfItem(a1, { last_read_at: '2026-02-01T00:00:00Z' })], 'fr', 'A1');
    expect(r.books[0].id).toBe('a2');
    expect(r.books.map((b) => b.id)).not.toContain('a1');
    expect(r.continueWith).toBeNull();
  });

  it('offers the sequel of a just-finished book as continueWith', () => {
    const a1 = catalog[0];
    const r = suggestBooks(catalog, [shelfItem(a1, { finished_at: '2026-02-01T00:00:00Z', last_read_at: '2026-02-01T00:00:00Z' })], 'fr', 'A1');
    expect(r.continueWith?.id).toBe('a2');
  });

  it('respects the count and an empty language', () => {
    expect(suggestBooks(catalog, [], 'fr', 'A1', 1).books).toHaveLength(1);
    expect(suggestBooks([], [], 'fr', 'A1')).toEqual({ level: null, books: [], continueWith: null });
  });
});

describe('duplicate guard', () => {
  it('matches a pdf by exact byte size and ignores failed ones and photos', () => {
    const docs = [
      doc('d1', { byte_size: 500 }),
      doc('d2', { byte_size: 700, status: 'failed' }),
      doc('d3', { byte_size: 900, source_kind: 'image' }),
    ];
    expect(sameFile(docs, 500)?.id).toBe('d1');
    expect(sameFile(docs, 700)).toBeUndefined();
    expect(sameFile(docs, 900)).toBeUndefined();
    expect(sameFile(docs, 501)).toBeUndefined();
    expect(sameFile(undefined, 500)).toBeUndefined();
  });
});

describe('add-document helpers', () => {
  it('accepts PDF and JPG, PNG, WebP only', () => {
    expect(addKindOf('a.PDF')).toBe('pdf');
    expect(addKindOf('x', 'application/pdf')).toBe('pdf');
    expect(addKindOf('p.jpeg')).toBe('image');
    expect(addKindOf('p.png')).toBe('image');
    expect(addKindOf('p.webp')).toBe('image');
    expect(addKindOf('p.gif')).toBeNull();
    expect(addKindOf('notes.txt', 'text/plain')).toBeNull();
  });
  it('reads names and mime types', () => {
    expect(baseName('/Users/x/Pictures/page 1.jpg')).toBe('page 1.jpg');
    expect(baseName('C:\\Users\\x\\scan.png')).toBe('scan.png');
    expect(imageMimeOf('a.png')).toBe('image/png');
  });
  it('formats reading minutes and book paths', () => {
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(1250)).toBe(13);
    expect(bookReadPath('b', 1)).toBe('/reader/book/b');
  });
});
