import { useEffect, useState } from 'react';
import { getReaderTextLayer } from '../services/readerService';
import { onOcrChanged } from '../ocr/events';
import type { OcrWords } from './ocr-text-content';
import type { ReaderTextLayerPage } from '../types';

/** How often a page waiting for its OCR words asks again. */
const POLL_MS = 3000;

/**
 * Nothing more will come for this page until something new is asked for: its
 * words are here, or the layer is finished, failed or was never requested.
 */
export function isTextLayerSettled(data: ReaderTextLayerPage | undefined): boolean {
  if (!data) return false;
  return (
    data.words !== null ||
    data.status === null ||
    data.status === 'ready' ||
    data.status === 'failed'
  );
}

/**
 * A scanned page's OCR words, polled until they arrive.
 *
 * Polls only while the layer is on its way and this page has not been read
 * yet. Stops by itself once the words are here, or once the layer is over.
 *
 * DESK: the words come from the local `reader_ocr_page_get` command, filled in
 * by the on-device OCR (`../ocr`). The website's RTK cache is replaced by a plain
 * effect with the same polling rule, plus an immediate refetch when the OCR says
 * this page (or the layer's state) changed — so a page never waits out a poll tick.
 */
export function usePageOcrWords(
  documentId: string | undefined,
  page: number,
  enabled: boolean,
): OcrWords | null {
  const [data, setData] = useState<ReaderTextLayerPage | undefined>(undefined);
  const skip = !enabled || !documentId;

  useEffect(() => {
    if (skip || !documentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getReaderTextLayer({ documentId, page });
        if (cancelled) return;
        setData(next);
        if (isTextLayerSettled(next)) return;
      } catch {
        if (cancelled) return;
      }
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    const off = onOcrChanged((changedDocument, changedPage) => {
      if (changedDocument !== documentId || (changedPage !== null && changedPage !== page)) return;
      clearTimeout(timer);
      void poll();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      off();
    };
  }, [skip, documentId, page]);

  return skip ? null : (data?.words ?? null);
}
