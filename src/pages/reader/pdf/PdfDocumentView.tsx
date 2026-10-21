import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useLookup } from '@/components/lookup/lookup-context';
import { PDF_WORD_MARKERS, snapSelectionToWords } from '../text/snap-selection';
import { PdfPageView, type PdfNoteMark, type PdfOcrLayer, type PdfWordSpeech } from './PdfPageView';
import type { TextBoxStore, MarkStore } from '../lib/write-types';
import { stepZoom } from '../text/zoom';
import type { PdfPointerTool } from './PdfViewControls';
import './pdf-text-layer.css';

/** Breathing room either side of the sheet, in px, at every zoom level (`px-6` on the stack below). */
const GUTTER = 24;

/** How far outside the viewport a page starts rendering, and stays rendered. */
const PRERENDER_MARGIN = '1000px 0px';

/**
 * Only the page crossing the middle band of the viewport counts as "the page
 * you are on" — with a full-height root, two or three pages are visible at once
 * and any looser rule makes the counter flicker between them while scrolling.
 */
const CURRENT_PAGE_MARGIN = '-45% 0px -45% 0px';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Stable identity, so a page with no notes is not handed a new array every render. */
const EMPTY_NOTES: PdfNoteMark[] = [];

export interface PdfDocumentViewHandle {
  /**
   * Bring a page into view, optionally at a point DOWN it.
   *
   * `offsetPct` is how far into the page to land, 0-100 — the same unit a note
   * stores its position in, which is what lets "go to this note" arrive at the
   * paragraph instead of at the top of a page the note might be two thirds of
   * the way down.
   */
  scrollToPage: (pageNumber: number, offsetPct?: number) => void;
}

/**
 * The scrolling stack of pages.
 *
 * Continuous scroll rather than the one-page-at-a-time pager the extracted-text
 * reader uses, because here the pages are the real thing: a figure and the
 * paragraph discussing it belong on screen together, and a PDF's page breaks
 * are the typesetter's, not the reader's.
 *
 * Every page's wrapper is in the DOM from the start, holding its own space at
 * an estimated size, so the scrollbar is honest from the first frame and does
 * not lurch as pages fill in. Only the canvas is lazy.
 */
export function PdfDocumentView({
  pdf,
  zoom,
  onCurrentPageChange,
  handleRef,
  notes,
  onOpenNote,
  activeNoteId,
  language,
  onWordLookedUp,
  onSpeakWord,
  speech,
  onStopSpeaking,
  boxStore,
  markStore,
  writing,
  ocr,
  tool = 'select',
  onZoomChange,
}: {
  pdf: PDFDocumentProxy;
  /** Multiplier on top of fit-to-width. 1 means "as wide as the reader". */
  zoom: number;
  onCurrentPageChange: (pageNumber: number) => void;
  handleRef?: React.MutableRefObject<PdfDocumentViewHandle | null>;
  notes: PdfNoteMark[];
  onOpenNote: (note: PdfNoteMark) => void;
  /** The note just jumped to, marked so the eye can find it on arrival. */
  activeNoteId?: string | null;
  /** The language the document is written in — the voice a hovered word gets. */
  language?: string;
  /** What the learner has written on the pages. */
  boxStore?: TextBoxStore;
  /** What the learner has drawn on them — arrows, boxes, stamps. */
  markStore?: MarkStore;
  /** Write mode: clicks place text boxes instead of opening words. */
  writing?: boolean;
  /** Told about every word opened, so the sitting can be reviewed later. */
  onWordLookedUp?: (word: string, context: string, pageNumber: number) => void;
  /** Tap to speak is on: a click says the word instead of opening it. */
  onSpeakWord?: (word: string) => void;
  /** What tap-to-speak is saying right now — the clicked word's chip shows it. */
  speech?: PdfWordSpeech;
  onStopSpeaking?: () => void;
  /** The OCR text layer that makes scanned pages tappable. */
  ocr?: PdfOcrLayer;
  /** 'hand': a drag moves the page; 'select': a drag selects a phrase. */
  tool?: PdfPointerTool;
  /** Pinch (or Ctrl + wheel) zooms, around the point under the pointer. */
  onZoomChange?: (zoom: number) => void;
}) {
  // Read from context rather than taken as a prop, the same contract
  // `TappableText` uses: with no provider mounted the pages still render, they
  // just do not open anything.
  const lookup = useLookup();
  const handleWord = useCallback(
    (word: string, context: string, pageNumber: number) => {
      lookup?.(word, context);
      // Recorded AFTER the dialog is asked to open, and never awaited: the
      // reading is the point, and a failed write must not delay a translation.
      onWordLookedUp?.(word, context, pageNumber);
    },
    [lookup, onWordLookedUp],
  );

  // Grouped once per notes change rather than filtered inside every page: a
  // 400-page book would otherwise run one filter per page on every render.
  const notesByPage = useMemo(() => {
    const map = new Map<number, PdfNoteMark[]>();
    for (const note of notes) {
      const list = map.get(note.page_number) ?? [];
      list.push(note);
      map.set(note.page_number, list);
    }
    return map;
  }, [notes]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState<{ width: number; height: number } | null>(null);
  const [available, setAvailable] = useState(0);
  const [near, setNear] = useState<Set<number>>(() => new Set([1]));

  // Written in an effect rather than during render: the observers below must
  // not be rebuilt just because the parent handed down a new closure.
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  useEffect(() => {
    onCurrentPageChangeRef.current = onCurrentPageChange;
  }, [onCurrentPageChange]);

  // Page 1's size stands in for every page. Asking for all of them means a
  // worker round trip per page, which on a 400-page book costs more than the
  // occasional textbook whose plates are a different size is worth.
  useEffect(() => {
    let cancelled = false;
    pdf
      .getPage(1)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setBase({ width: viewport.width, height: viewport.height });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => setAvailable(root.clientWidth));
    observer.observe(root);
    setAvailable(root.clientWidth);
    return () => observer.disconnect();
  }, []);

  const fitScale = base && available ? clamp((available - GUTTER * 2) / base.width, 0.2, 4) : 1;
  const scale = fitScale * zoom;

  /**
   * Where the reader is, as a page and how far down it — NOT a pixel offset.
   *
   * Every page's height is a function of the scale, and the scale is a function
   * of how wide the column is. So opening a panel narrows the column, every
   * page above shrinks, and the same scrollTop now lands somewhere else
   * entirely: opening Notes on page 11 put the reader on page 15. A pixel
   * offset cannot survive that; a page plus a fraction of it can.
   */
  const anchorRef = useRef<{ page: number; frac: number; x: number }>({ page: 1, frac: 0, x: 0.5 });
  const restoringRef = useRef(false);
  /**
   * A pinch zooms around the point under the fingers, not the top of the view:
   * which page and how far into it, and where across the sheet, plus where that
   * point sat on screen — so after the re-layout it can be put back under them.
   */
  const zoomOriginRef = useRef<{
    page: number;
    frac: number;
    x: number;
    px: number;
    py: number;
  } | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !base) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      // Our own restoring scroll must not overwrite the anchor it is restoring.
      if (restoringRef.current) return;
      const top = root.scrollTop;
      for (const element of root.querySelectorAll<HTMLElement>('[data-page]')) {
        const start = element.offsetTop - root.offsetTop;
        if (start + element.offsetHeight <= top) continue;
        anchorRef.current = {
          page: Number(element.dataset.page) || 1,
          frac: element.offsetHeight ? (top - start) / element.offsetHeight : 0,
          // Across, as the centre of the view — a zoomed page keeps its middle.
          x: root.scrollWidth ? (root.scrollLeft + root.clientWidth / 2) / root.scrollWidth : 0.5,
        };
        return;
      }
    };

    // Coalesced to one read per frame: this runs on every scroll tick and does
    // nothing but measure.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    read();
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [base]);

  // Put the reader back, BEFORE the browser paints the new layout — a plain
  // effect would let the wrong position show for a frame, which is the jump.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || !base) return;
    const origin = zoomOriginRef.current;
    zoomOriginRef.current = null;
    const { page, frac, x } = origin ?? anchorRef.current;
    const target = root.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!target) return;

    restoringRef.current = true;
    root.scrollTop =
      target.offsetTop - root.offsetTop + target.offsetHeight * frac - (origin?.py ?? 0);
    root.scrollLeft = x * root.scrollWidth - (origin?.px ?? root.clientWidth / 2);
    const release = requestAnimationFrame(() => {
      restoringRef.current = false;
    });
    return () => cancelAnimationFrame(release);
  }, [scale, base]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !base) return;

    const pageOf = (element: Element) => Number((element as HTMLElement).dataset.page);

    const nearObserver = new IntersectionObserver(
      (entries) => {
        setNear((previous) => {
          const next = new Set(previous);
          let changed = false;
          for (const entry of entries) {
            const page = pageOf(entry.target);
            if (entry.isIntersecting) {
              if (!next.has(page)) {
                next.add(page);
                changed = true;
              }
            } else if (next.delete(page)) {
              changed = true;
            }
          }
          return changed ? next : previous;
        });
      },
      { root, rootMargin: PRERENDER_MARGIN },
    );

    const currentObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onCurrentPageChangeRef.current(pageOf(entry.target));
        }
      },
      { root, rootMargin: CURRENT_PAGE_MARGIN },
    );

    for (const element of root.querySelectorAll('[data-page]')) {
      nearObserver.observe(element);
      currentObserver.observe(element);
    }

    return () => {
      nearObserver.disconnect();
      currentObserver.disconnect();
    };
  }, [pdf, base]);

  // One listener for the whole document rather than one per page: a drag ends
  // wherever the pointer happens to be, which is regularly outside the page it
  // started on — and 193 pages would otherwise mean 193 listeners.
  //
  // CAPTURE phase, because the reader stops `mouseup` from bubbling out of it
  // (see PdfReaderScreen — that is what keeps our browser extension's selection
  // icon off these pages). A capture listener on the document runs before
  // that, so the snap still happens.
  useEffect(() => {
    const snap = () => snapSelectionToWords(PDF_WORD_MARKERS);
    document.addEventListener('mouseup', snap, true);
    document.addEventListener('keyup', snap, true);
    return () => {
      document.removeEventListener('mouseup', snap, true);
      document.removeEventListener('keyup', snap, true);
    };
  }, []);

  const zoomRef = useRef(zoom);
  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    zoomRef.current = zoom;
    onZoomChangeRef.current = onZoomChange;
  }, [zoom, onZoomChange]);

  /*
   * PINCH TO ZOOM. A trackpad pinch arrives as a wheel event with ctrlKey set
   * (and Ctrl + wheel with a mouse is the same gesture). One zoom stop per
   * deliberate movement, around the point under the pointer.
   */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !base) return;
    let pending = 0;
    let last = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !onZoomChangeRef.current) return;
      event.preventDefault();
      pending += event.deltaY;
      const now = performance.now();
      if (Math.abs(pending) < 24 || now - last < 160) return;
      const direction = pending < 0 ? 1 : -1;
      pending = 0;
      last = now;
      const next = stepZoom(zoomRef.current, direction);
      if (next === zoomRef.current) return;

      const box = root.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const y = root.scrollTop + py;
      for (const element of root.querySelectorAll<HTMLElement>('[data-page]')) {
        const start = element.offsetTop - root.offsetTop;
        if (y < start || y > start + element.offsetHeight) continue;
        zoomOriginRef.current = {
          page: Number(element.dataset.page) || 1,
          frac: element.offsetHeight ? (y - start) / element.offsetHeight : 0,
          x: root.scrollWidth ? (root.scrollLeft + px) / root.scrollWidth : 0.5,
          px,
          py,
        };
        break;
      }
      onZoomChangeRef.current(next);
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [base]);

  /*
   * THE HAND. Press and drag moves the page in any direction; a press that
   * does not move is still a click, so a word can be looked up without
   * switching tools. Mouse and pen only — a finger already scrolls natively.
   * Never while writing: there a drag draws and a click places a box.
   */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || tool !== 'hand' || writing) return;
    let start: { x: number; y: number; left: number; top: number } | null = null;
    let panned = false;
    let swallowClick = false;

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'button, a, input, textarea, select, [contenteditable="true"], [data-flexi-say]',
        )
      )
        return;
      start = { x: event.clientX, y: event.clientY, left: root.scrollLeft, top: root.scrollTop };
      panned = false;
    };
    const move = (event: PointerEvent) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!panned) {
        if (Math.hypot(dx, dy) < 5) return;
        panned = true;
        root.dataset.panning = '';
        window.getSelection()?.removeAllRanges();
      }
      root.scrollLeft = start.left - dx;
      root.scrollTop = start.top - dy;
    };
    const up = () => {
      if (panned) {
        swallowClick = true;
        // Only the click that belongs to THIS release: a drag that ended
        // outside the pages fires none, and must not eat the next real one.
        setTimeout(() => {
          swallowClick = false;
        }, 0);
      }
      start = null;
      panned = false;
      delete root.dataset.panning;
    };
    // The click that ends a drag is not a tap on the word under it.
    const click = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    };

    root.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    root.addEventListener('click', click, true);
    return () => {
      root.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      root.removeEventListener('click', click, true);
      delete root.dataset.panning;
    };
  }, [tool, writing]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      scrollToPage: (pageNumber, offsetPct) => {
        const root = scrollRef.current;
        const target = root?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
        if (!root || !target) return;

        // Measured against the scroller rather than the document: the viewer is
        // its own scroll container inside the app shell, so page coordinates
        // would be off by whatever the shell occupies.
        const top = target.offsetTop - root.offsetTop;
        const into = offsetPct ? (target.offsetHeight * offsetPct) / 100 : 0;
        // A little air above, so the destination is not flush against the
        // toolbar and readable as "here" rather than "somewhere off the top".
        const margin = offsetPct ? 80 : 0;
        root.scrollTo({ top: Math.max(0, top + into - margin), behavior: 'smooth' });
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  const estimatedWidth = base ? Math.floor(base.width * scale) : 0;
  const estimatedHeight = base ? Math.floor(base.height * scale) : 0;

  return (
    <div
      ref={scrollRef}
      data-tool={tool}
      className="flexi-pdf-scroll min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-muted"
    >
      {base && (
        // `w-max min-w-full`: as wide as the widest page, never narrower than
        // the view. Centring a zoomed page with plain `items-center` pushed half
        // of its overflow off the LEFT edge, where no scrollbar can reach.
        <div className="flex w-max min-w-full flex-col items-center gap-4 px-6 py-4">
          {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((pageNumber) => (
            <PdfPageView
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              scale={scale}
              isNear={near.has(pageNumber)}
              estimatedWidth={estimatedWidth}
              estimatedHeight={estimatedHeight}
              onWord={handleWord}
              onSpeakWord={onSpeakWord}
              speech={speech}
              onStopSpeaking={onStopSpeaking}
              notes={notesByPage.get(pageNumber) ?? EMPTY_NOTES}
              onOpenNote={onOpenNote}
              activeNoteId={activeNoteId}
              language={language}
              boxStore={boxStore}
              markStore={markStore}
              writing={writing}
              ocr={ocr}
            />
          ))}
        </div>
      )}
    </div>
  );
}
