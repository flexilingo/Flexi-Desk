export interface ExampleItem {
  en?: string;
  source?: string;
  tr?: string;
  target?: string;
}

/**
 * Drops a leading/trailing "..." from an example sentence. A batch of decks stored
 * their examples as excerpts clipped out of a longer passage and wrapped in ellipses;
 * on a card those dots read as broken text. Ellipses INSIDE the sentence are kept.
 */
export function stripEdgeEllipsis(s: string): string {
  return s
    .trim()
    .replace(/^(?:\.{2,}|…)\s*/, '')
    .replace(/\s*(?:\.{2,}|…)$/, '')
    .trim();
}

/** The rows a card has: sentence + translation, empty sentences dropped (the keyboard indexes this same list). */
export function normalizeExamples(
  examples: ExampleItem[] | undefined,
): { text: string; translation: string }[] {
  return (examples ?? [])
    .map((e) => ({
      text: stripEdgeEllipsis(e.en ?? e.source ?? ''),
      translation: stripEdgeEllipsis(e.tr ?? e.target ?? ''),
    }))
    .filter((e) => e.text.length > 0);
}
