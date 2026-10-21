import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findBoilerplate } from './ocr-text-content';

/** How many pages, spread across the document, are read to find its boilerplate. */
const SAMPLE_PAGES = 8;

/**
 * The text runs repeated across a document's pages — a watermark stamped on
 * every page, a running header — found from a spread-out sample of its pages'
 * text (no rendering, so even a large scan answers in a moment).
 *
 * Never fails: a document that cannot be sampled simply has no boilerplate,
 * which is exactly how every page was judged before.
 */
export async function documentBoilerplate(pdf: PDFDocumentProxy): Promise<Set<string>> {
  const total = pdf.numPages;
  const count = Math.min(total, SAMPLE_PAGES);
  const numbers = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    numbers.add(1 + Math.round((i * (total - 1)) / Math.max(1, count - 1)));
  }
  try {
    const pages = await Promise.all(
      [...numbers].map(async (n) => {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        return content.items.map((item) => ('str' in item ? item.str : ''));
      }),
    );
    return findBoilerplate(pages);
  } catch {
    return new Set();
  }
}
