/**
 * "Something about this document's OCR changed" — so a page waiting for its
 * words asks the database at once instead of at the next poll tick, and the
 * "this page is being read" dialog closes the moment the words land.
 */
type Listener = (documentId: string, page: number | null) => void;

const listeners = new Set<Listener>();

export function onOcrChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `page` null: the document's state changed, not one page's words. */
export function emitOcrChanged(documentId: string, page: number | null): void {
  for (const listener of [...listeners]) listener(documentId, page);
}
