/** Where a signed-out reader's place is kept, per book. */
export const bookPageSettingKey = (bookId: string) => `reader_book_page_${bookId}`;

/** The bookmark as a page number, or undefined when it is missing or not a page. */
export function parseBookmark(raw: string | null | undefined): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : undefined;
}
