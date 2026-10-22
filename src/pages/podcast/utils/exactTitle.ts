/**
 * A show whose title IS what was searched comes first.
 *
 * Someone who types a show's name wants that show. On 2026-10-19 the show
 * whose title matched the search exactly sat in the third lane of the results,
 * under a lane of another show's episodes. The comparison ignores case,
 * punctuation, spacing, emoji and Latin accents ("the daily." finds "The
 * Daily", "francais" finds "Français") and nothing else: it decides an order,
 * never whether something is shown.
 *
 * Dependency-free, so `node --test` can load it as it is.
 */

/** A title reduced to what a person typing it would be sure of. */
export function titleKey(title: string | null | undefined): string {
  return (
    (title ?? '')
      // Decoration first (emoji, ©, ™ and the joiners and variation selectors
      // that build emoji): normalized, ™ would turn into the letters "TM".
      // eslint-disable-next-line no-misleading-character-class -- joiners and variation selectors are the point
      .replace(/[\p{So}\p{Sk}\u200d\ufe00-\ufe0f]+/gu, '')
      .normalize('NFKD')
      // Accents on Latin letters only. On a Greek or Cyrillic letter the same
      // marks make another letter (й is not и).
      .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, '$1')
      .normalize('NFKC')
      .toLowerCase()
      // Punctuation and spacing, and any decoration normalizing made. Not maths
      // or currency signs: "C++" is not "C".
      // eslint-disable-next-line no-misleading-character-class -- same as above
      .replace(/[\p{P}\p{Z}\p{So}\p{Sk}\s\u200d\ufe00-\ufe0f]+/gu, '')
  );
}

/** Whether `title` is exactly what was searched. An empty search matches nothing. */
export function isExactTitle(
  title: string | null | undefined,
  query: string | null | undefined,
): boolean {
  const q = titleKey(query);
  return q !== '' && titleKey(title) === q;
}

/**
 * `items` with the ones titled exactly `query` moved to the front, the rest in
 * their order; and whether there was one.
 */
export function exactTitleFirst<T>(
  items: readonly T[],
  titleOf: (item: T) => string | null | undefined,
  query: string | null | undefined,
): { items: T[]; found: boolean } {
  const q = titleKey(query);
  if (!q) return { items: [...items], found: false };
  const exact: T[] = [];
  const rest: T[] = [];
  for (const item of items) (titleKey(titleOf(item)) === q ? exact : rest).push(item);
  return { items: exact.length ? [...exact, ...rest] : [...items], found: exact.length > 0 };
}
