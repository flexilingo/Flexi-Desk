/**
 * A language's name in the reader's own language, from the runtime — no list of
 * names lives in this code, so a language published tomorrow is named correctly
 * without a release.
 */
export function languageName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(code);
    return name && name !== code ? name : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Minutes to read, at a learner's pace. ~100 words a minute is slow for a
 * native reader and honest for someone stopping to tap words.
 */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 100));
}

/** The in-app reading route for a library book (phase F builds the screen). */
export const bookReadPath = (bookId: string, page?: number) =>
  `/reader/book/${bookId}${page && page > 1 ? `?page=${page}` : ''}`;

/** The generated cover's file under the website's `public/`; the version is part of the name. */
const COVER_VERSION = 'v2';
export const coverFileFor = (language: string, slug: string) =>
  `/library/covers/${language}/${slug}.${COVER_VERSION}.jpg`;

/** The cover to try: the row's own path, else the generated file. */
export const coverFor = (book: { language: string; slug: string; cover_path: string | null }) =>
  book.cover_path ?? coverFileFor(book.language, book.slug);

/** Covers are hosted by the website; a path becomes a URL, an absolute URL stays one. */
export const COVER_ORIGIN = 'https://flexilingo.com';
export const coverUrl = (path: string) =>
  /^https?:\/\//.test(path) ? path : `${COVER_ORIGIN}${path}`;
