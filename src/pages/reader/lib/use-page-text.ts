import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OcrWords } from './ocr-text-content';
import { usePageOcrWords } from './use-page-ocr-words';

/** A page with fewer characters than this has no usable text of its own (a scan). */
const MIN_OWN_CHARS = 20;

/** An OCR page as running text: words of a line joined by spaces, lines by newlines. */
export function ocrPageText(words: OcrWords | null): string {
  if (!words) return '';
  const lines = new Map<number, string[]>();
  for (const [text, , , , , line] of words.words) {
    const list = lines.get(line) ?? [];
    list.push(text);
    lines.set(line, list);
  }
  return [...lines.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, list]) => list.join(' '))
    .join('\n');
}

/**
 * The text of the page on screen, for "make a deck from this page".
 *
 * The PDF's own text layer when it has one, otherwise the words the on-device
 * OCR read. Settles a moment after the page changes so a fast scroll does not
 * extract every page it passes.
 */
export function usePageText(
  pdf: PDFDocumentProxy | null,
  documentId: string,
  page: number,
): string {
  const [own, setOwn] = useState<{ page: number; text: string } | null>(null);

  useEffect(() => {
    if (!pdf || page < 1 || page > pdf.numPages) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      pdf
        .getPage(page)
        .then((p) => p.getTextContent())
        .then((content) => {
          if (cancelled) return;
          let text = '';
          for (const item of content.items) {
            if (!('str' in item)) continue;
            text += item.str;
            text += item.hasEOL ? '\n' : ' ';
          }
          setOwn({ page, text: text.trim() });
        })
        .catch(() => {
          if (!cancelled) setOwn({ page, text: '' });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pdf, page]);

  const ownText = own?.page === page ? own.text : '';
  const scanned = own?.page === page && ownText.length < MIN_OWN_CHARS;
  const ocr = usePageOcrWords(documentId, page, scanned);
  return scanned ? ocrPageText(ocr) : ownText;
}
