import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalise } from '../lib/normalise';

/** The block worth showing — a whole row reads better than a bare cell. */
const BLOCK = 'tr, li, blockquote, p, h2, h3, h4, td';

/** The flash. Utility classes rather than a keyframe: the stylesheet is not this page's to edit. */
const FLASH = ['bg-warning/25', 'ring-2', 'ring-warning/40', 'transition-colors', 'duration-700'];

/**
 * Lands the reader on the row they searched for, not at the top of the page. The
 * query travels in `?q=`; this scrolls to the first block containing it and flashes
 * it for a moment. It matches on the RENDERED text (a phrase is split into one span per word, so
 * `textContent` of the row is what reassembles it), and adds nothing to the markup.
 */
export default function ScrollToMatch({ ready }: { ready: string }) {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';

  useEffect(() => {
    if (q.length < 2) return;
    const root = document.querySelector('.cheatsheet-body');
    if (!root) return;
    const needle = normalise(q);
    const target = Array.from(root.querySelectorAll<HTMLElement>(BLOCK)).find((el) =>
      normalise(el.textContent ?? '').includes(needle),
    );
    if (!target) return;
    const id = requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add(...FLASH);
    });
    // Cleared by a timer, not by this effect's cleanup (a cleanup that stripped the
    // class took the flash away before it was ever painted).
    const fallback = setTimeout(() => target.classList.remove(...FLASH), 2200);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(fallback);
    };
  }, [q, ready]);

  return null;
}
