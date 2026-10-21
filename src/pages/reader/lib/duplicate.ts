import type { ReaderDocument } from '../types';

/**
 * The document this file already is, if the reader has it.
 *
 * A reader who cannot find a book they added adds it again, and the copy starts
 * at page 1 with none of their words — so the one they have is offered first.
 * Matched on the exact byte count, which a re-download of the same file keeps
 * even when its name gains a " (1)". A photo is converted before it is stored,
 * so its size says nothing; callers never pass one.
 */
export function sameFile(
  documents: ReaderDocument[] | undefined,
  byteSize: number,
): ReaderDocument | undefined {
  return documents?.find(
    (doc) => doc.source_kind === 'pdf' && doc.status !== 'failed' && doc.byte_size === byteSize,
  );
}
