import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { DocumentOcr, type OcrState } from '../ocr/controller';

const IDLE: OcrState = {
  status: null,
  done: 0,
  total: null,
  phase: 'idle',
  downloadProgress: 0,
  language: { code: 'eng', iso: 'en', fallback: false },
  errorCode: null,
  retrying: false,
};
const noopSubscribe = () => () => {};

/**
 * One document's on-device OCR, alive for as long as the document is open.
 *
 * Leaving the document (or opening another) disposes it: the worker stops after
 * the page in flight, and the next sitting resumes from what is missing.
 */
export function useDocumentOcr(
  pdf: PDFDocumentProxy | null,
  documentId: string,
  language: string | null | undefined,
  boilerplate: Promise<ReadonlySet<string>>,
  currentPage: number,
): { state: OcrState; controller: DocumentOcr | null } {
  const [controller, setController] = useState<DocumentOcr | null>(null);

  useEffect(() => {
    if (!pdf) return;
    const next = new DocumentOcr(pdf, documentId, language, boilerplate);
    setController(next);
    void next.start();
    return () => {
      next.dispose();
      setController(null);
    };
  }, [pdf, documentId, language, boilerplate]);

  useEffect(() => {
    controller?.setCurrentPage(currentPage);
  }, [controller, currentPage]);

  const state = useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getState ?? (() => IDLE),
  );
  return useMemo(() => ({ state, controller }), [state, controller]);
}
