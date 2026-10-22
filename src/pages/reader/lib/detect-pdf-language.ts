import { PDF_ASSET_OPTIONS, destroyDocument, loadPdfjs } from './pdfjs';
import { MIN_WORDS, detectLanguage, type DetectedLanguage } from './detect-language';

/** The first pages are enough to tell a language; reading a whole book would not be faster. */
const MAX_PAGES = 6;
/** Beyond this the bytes are not worth reading just to guess; the open-time check handles it. */
export const MAX_DETECT_BYTES = 60 * 1024 * 1024;

/**
 * The language of a PDF, from the text layer of its first pages. A scan (no text layer)
 * answers "unknown": its words only exist once the on-device OCR has read a page, and the
 * check on opening the document picks them up then.
 */
export async function detectPdfLanguage(bytes: Uint8Array): Promise<DetectedLanguage> {
  const unknown = { code: '', confident: false };
  let pdf: import('pdfjs-dist').PDFDocumentProxy | null = null;
  try {
    const pdfjs = await loadPdfjs();
    pdf = await pdfjs.getDocument({ data: bytes, ...PDF_ASSET_OPTIONS }).promise;
    let pooled = '';
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n += 1) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pooled += `${content.items.map((i) => ('str' in i ? i.str : '')).join(' ')}\n`;
      if (pooled.split(/\s+/).length >= MIN_WORDS * 8) break;
    }
    return detectLanguage(pooled);
  } catch {
    return unknown;
  } finally {
    await destroyDocument(pdf);
  }
}
