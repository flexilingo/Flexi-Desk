import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { Languages, Loader2, Square, StickyNote, Volume2 } from 'lucide-react';
import { SpeakButton } from '@/components/lookup/SpeakButton';
import { buildLineContext } from '../lib/line-context';
import { segmentRuns, type RunMetrics } from '../lib/word-segments';
import { loadPdfjs } from '../lib/pdfjs';
import {
  DEFAULT_ASCENT,
  MIN_ALNUM_PER_PAGE,
  buildOcrTextContent,
  countAlphanumerics,
  countOwnAlphanumerics,
  type OcrWords,
} from '../lib/ocr-text-content';
import { usePageOcrWords } from '../lib/use-page-ocr-words';
import { paintsImage } from '../ocr/scan-detection';
import { PdfPageWorkingDialog } from './PdfPageWorkingDialog';
import type { TextBox, TextBoxShape, TextBoxStore, WriteTool } from '../lib/text-box-store';
import type { MarkStore } from '../lib/mark-store';
import { blankAt } from '../lib/blank-at';
import { PdfTextBox } from './PdfTextBox';
import { PdfMarksLayer } from './PdfMarksLayer';

const NO_BOXES: TextBox[] = [];

/**
 * A new box's width when there is no blank to take it from, as % of page width.
 *
 * Halved from 24 after using it: most answers are a word or two, and an empty
 * box a quarter of the page wide sat over the print next to where it was put.
 * A longer answer wraps, and the right edge still drags wider.
 */
const DEFAULT_BOX_WIDTH = 12;

/** The page number travels with the word: a lookup is only reviewable if you know where it happened. */
export type PdfWordHandler = (word: string, context: string, pageNumber: number) => void;

/** The word tap-to-speak is saying, and how far along it is. */
export interface PdfWordSpeech {
  word: string | null;
  loading: boolean;
  speaking: boolean;
}

/**
 * The OCR text layer, for pages the PDF itself has no text on.
 *
 * A scanned page is a picture of print: pdf.js finds no words on it, so
 * nothing on it can be tapped. Such a page reports itself, the document asks
 * the worker to read it, and its words — each with its box — come back to be
 * laid over the page as an ordinary pdf.js text layer.
 */
export interface PdfOcrLayer {
  documentId: string;
  /** A layer is ready or on its way, so a scanned page should ask for its words. */
  active: boolean;
  /** Told when a page turns out to be a scan. May be called once per page render. */
  onScanPage: (pageNumber: number) => void;
  /**
   * Text repeated across the document's pages — a watermark, a running
   * header. Not counted as a page's own text when deciding it is a scan.
   */
  boilerplate: Promise<ReadonlySet<string>>;
  /**
   * The OCR is reading the document's scanned pages right now: a scanned page
   * without words answers a click with the "analysing this page" dialog. (The
   * website's Pro gate — `locked` / `onLockedClick` — does not exist on desk:
   * every scanned page is read, free.)
   */
  waiting: boolean;
  /** The reader asked for this page's words (clicked it): read it next. */
  onPageWanted?: (pageNumber: number) => void;
}

/** A note's stored anchor, as percentages of the page box. */
export interface PdfNoteMark {
  id: string;
  quote: string;
  body: string;
  page_number: number;
  rect_x: number;
  rect_y: number;
  rect_w: number;
  rect_h: number;
}

/**
 * Ceiling on the canvas backing store, in pixels.
 *
 * An A4 page at 300% zoom on a 3× screen is ~64 megapixels — a quarter of a
 * gigabyte for one page, and Safari simply refuses to allocate it and hands
 * back a blank canvas. Capping the device-pixel ratio instead of the zoom keeps
 * the page the size the reader asked for and spends the quality budget.
 */
const MAX_CANVAS_PIXELS = 8_000_000;

function devicePixelRatioFor(width: number, height: number): number {
  const wanted = Math.min(window.devicePixelRatio || 1, 2);
  const area = width * height * wanted * wanted;
  return area <= MAX_CANVAS_PIXELS
    ? wanted
    : Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
}

/** Marks every piece of the word under the cursor, including pieces in other runs. */
const HOT_CLASS = 'is-hot';

/**
 * How long the cursor must REST on a word before it offers to say it.
 *
 * A page carries hundreds of words. Anything that appears the instant the mouse
 * touches one would spend the whole of a reading session flickering in and out
 * under the cursor. Waiting for the reader to stop means the button only shows
 * up when they were actually looking at that word.
 *
 * Doubled from the first 350ms after reading with it: a third of a second still
 * fires while the eye is merely travelling along a line, which is most of what
 * a cursor does over prose.
 */
const HOVER_DWELL_MS = 700;

/*
 * WHY THE BUTTON DOES NOT HIDE ON MOUSE-OUT.
 *
 * Reaching for it means leaving the word it belongs to, so hiding on leave made
 * it unclickable — the cursor's own journey dismissed it. Grace timers only
 * moved the race around: the trace still read word → button → gone, with the
 * button vanishing from under the cursor.
 *
 * So it simply stays. It is replaced when the reader settles on a different
 * word, and cleared when they scroll or press a key — the two things that mean
 * they have moved on. Nothing about leaving it with the mouse ends it, and
 * there is no race left to lose.
 */

/**
 * Rewrite each pdf.js run as a sequence of word spans, in place.
 *
 * pdf.js gives one absolutely-positioned span per run; the text inside it is
 * plain and therefore not clickable. Splitting INSIDE the run rather than
 * positioning words independently is what keeps the layer aligned for free: the
 * run keeps its own `left`/`top`/`--scale-x`, and the pieces simply flow inside
 * it, so nothing has to re-derive glyph positions. Which characters belong to
 * which word is decided a line at a time — see `segmentRuns`, and the ligature
 * problem it exists for.
 *
 * DELIBERATELY NOT FOCUSABLE. `TappableText` gives every word `tabIndex={0}`,
 * which is right for a paragraph and wrong here — a dense PDF page is two
 * thousand runs, and making each word a tab stop would bury every other control
 * on the page behind them. Keyboard readers select the phrase and use the
 * chip, which is one stop instead of two thousand.
 *
 * @returns the runs' `top` percentages, index-aligned, for context rebuilding.
 */
function decorateWords(textDivs: HTMLElement[], strings: string[], lineOf?: number[]): number[] {
  // Every measurement first, every mutation after. Interleaving them would make
  // each run's `getBoundingClientRect` flush the layout the previous run just
  // invalidated — two thousand forced reflows on one page.
  //
  // An OCR layer knows its lines outright and says so in `lineOf`. Its words
  // cannot be grouped by `top`: on a tilted scan the words of one line sit at
  // different heights, and on a rotated page they do not share a `top` at all.
  const tops = lineOf ?? textDivs.map((div) => Number.parseFloat(div.style.top));
  const metrics: RunMetrics[] = textDivs.map((div) => {
    const rect = div.getBoundingClientRect();
    return { left: rect.left, right: rect.right, height: rect.height };
  });

  const segments = segmentRuns(strings, tops, metrics);

  for (let i = 0; i < textDivs.length; i += 1) {
    const pieces = segments[i];
    if (!pieces?.length || !pieces.some((piece) => piece.word)) continue;

    const fragment = document.createDocumentFragment();
    for (const piece of pieces) {
      if (!piece.word) {
        fragment.append(piece.text);
        continue;
      }
      const span = document.createElement('span');
      span.className = 'flexi-pdf-word';
      span.textContent = piece.text;
      span.dataset.run = String(i);
      // The WHOLE word, so a click on the `fi` of `indéfinis` still looks up
      // `indéfinis` rather than the two letters that happen to be under it.
      span.dataset.word = piece.word;
      span.dataset.group = String(piece.group);
      fragment.append(span);
    }

    textDivs[i].textContent = '';
    textDivs[i].append(fragment);
  }

  return tops;
}

let measuredAscent: number | null = null;

/**
 * The ascent ratio pdf.js will use for an OCR run's font, measured the way
 * `TextLayer` measures it. pdf.js puts a run's top at `baseline - ascent *
 * height`; building the layer with the same number is what puts each run's
 * top exactly on its word's top, whatever sans-serif this browser has.
 */
function ocrAscent(pdfjs: typeof import('pdfjs-dist')): number {
  if (measuredAscent !== null) return measuredAscent;
  measuredAscent = DEFAULT_ASCENT;
  try {
    const family: string = pdfjs.TextLayer.fontFamilyMap.get('sans-serif') ?? 'sans-serif';
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `30px ${family}`;
      const metrics = ctx.measureText('');
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = Math.abs(metrics.fontBoundingBoxDescent);
      if (ascent) measuredAscent = ascent / (ascent + descent);
    }
  } catch {
    // Keep pdf.js' own fallback.
  }
  return measuredAscent;
}

/**
 * One page of the PDF: the real page as pixels, with an invisible, clickable
 * copy of its text on top.
 *
 * Renders only while `isNear`, and tears the canvas back down when it stops
 * being near. Without that, scrolling a textbook to the end leaves every page
 * it passed in memory — the canvases alone reach several gigabytes long before
 * the reader notices anything is wrong.
 */
export function PdfPageView({
  pdf,
  pageNumber,
  scale,
  isNear,
  estimatedWidth,
  estimatedHeight,
  onWord,
  onSpeakWord,
  speech,
  onStopSpeaking,
  notes,
  onOpenNote,
  activeNoteId,
  language,
  boxStore,
  markStore,
  writing = false,
  ocr,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** CSS pixels per PDF unit. */
  scale: number;
  isNear: boolean;
  estimatedWidth: number;
  estimatedHeight: number;
  onWord: PdfWordHandler;
  /**
   * Tap to speak is on. A click SAYS the word, and puts the chip under it at
   * once — the voice showing its progress, and the Translate the click gave up.
   * Resting the cursor offers nothing in this mode; see `handleHover`.
   */
  onSpeakWord?: (word: string) => void;
  /** What tap-to-speak is saying right now, for the chip's voice button. */
  speech?: PdfWordSpeech;
  onStopSpeaking?: () => void;
  /** This page's notes. Drawn from percentages, so they hold at any zoom. */
  notes: PdfNoteMark[];
  onOpenNote: (note: PdfNoteMark) => void;
  activeNoteId?: string | null;
  /** The language the page is written in, for the hovered word's voice. */
  language?: string;
  /** What the learner has written on the pages. This page reads only its own. */
  boxStore?: TextBoxStore;
  /** The arrows, boxes and stamps drawn on the pages. This page reads only its own. */
  markStore?: MarkStore;
  /** Write mode: a click on the page places a text box instead of looking a word up. */
  writing?: boolean;
  /** The OCR text layer for scanned pages. Without it a scan simply has no words. */
  ocr?: PdfOcrLayer;
}) {
  const { t } = useTranslation('reader');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  /**
   * The render currently owning the canvas, if any.
   *
   * pdf.js allows exactly one render per canvas at a time, and a zoom change
   * arrives as a NEW effect while the old one is still in flight. Letting both
   * run meant the newer render was the one refused — so the canvas ended up
   * painted by the stale render, at the old scale, and since that stale pass
   * had already been marked cancelled it returned before building the text
   * layer. The page came out unreadable and with no tappable word on it, and
   * nothing threw. Each pass now waits for the previous one to let go.
   */
  const canvasBusy = useRef<Promise<void> | null>(null);

  // The page's own size in PDF units, learned the first time it renders and
  // then kept forever. Kept UNSCALED so it survives a zoom, and kept after the
  // page scrolls out of range so the wrapper never gives its height back — a
  // page that collapses to page 1's estimate when it leaves the viewport drags
  // everything below it upward and the scroll position jumps.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  /**
   * The word the cursor has settled on, and where to hang its play button.
   *
   * Click to play, never hover to play: sound that starts by itself while you
   * read is startling once and intolerable on a page of five hundred words. The
   * hover only offers.
   */
  const [spoken, setSpoken] = useState<{
    word: string;
    /** The word's line, for when the chip offers the translation instead. */
    context: string;
    x: number;
    y: number;
    /** The note this word sits inside, if any — reached by resting on it. */
    note?: PdfNoteMark;
  } | null>(null);

  // Read inside the imperative hover handler, which is built once per render of
  // the page and must not capture a stale list.
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  /**
   * The note the cursor is over RIGHT NOW, so its underline can come forward.
   *
   * Separate from `spoken`, which waits for the reader to settle: a note
   * lighting up is feedback about where the cursor is and has to be immediate,
   * while offering to say a word is an interruption and has to be earned.
   */
  const [hoveredNote, setHoveredNote] = useState<string | null>(null);

  // Kept in a ref so a new dialog-opening closure on every parent render does
  // not re-render the page — re-rendering a canvas page is not cheap.
  const onWordRef = useRef(onWord);
  useEffect(() => {
    onWordRef.current = onWord;
  }, [onWord]);
  // Same reason: switching tap-to-speak must not re-rasterise a single page.
  const onSpeakWordRef = useRef(onSpeakWord);
  useEffect(() => {
    onSpeakWordRef.current = onSpeakWord;
  }, [onSpeakWord]);

  /*
   * A SCANNED PAGE, MADE TAPPABLE.
   *
   * `scan` is learned from the render: the PDF's own text layer has almost no
   * letters on it, and the page paints an image. From then on the page asks
   * for its OCR words, and when they come the text layer is rebuilt from them —
   * same pdf.js layer, same word spans, same handlers, so a scanned page is
   * tapped, spoken, highlighted and selected exactly like a digital one.
   */
  const [scan, setScan] = useState(false);
  const ocrRef = useRef(ocr);
  useEffect(() => {
    ocrRef.current = ocr;
  }, [ocr]);
  const ocrWords = usePageOcrWords(
    ocr?.documentId,
    pageNumber,
    Boolean(ocr?.active && scan && isNear),
  );
  const pageWaiting = Boolean(scan && !ocrWords && ocr?.waiting);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const ocrWordsRef = useRef<OcrWords | null>(ocrWords);
  // Set by the render once this page is known to be a scan; rebuilds its text
  // layer from OCR words. Null whenever no rendered layer is there to rebuild.
  const ocrMountRef = useRef<((words: OcrWords) => Promise<void>) | null>(null);
  useEffect(() => {
    ocrWordsRef.current = ocrWords;
    if (ocrWords) {
      ocrMountRef.current?.(ocrWords).catch((cause) => {
        console.error('pdf-reader: OCR text layer failed', { pageNumber, cause });
      });
    }
  }, [ocrWords, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = textLayerRef.current;
    if (!canvas || !container) return;

    if (!isNear) {
      // Zero the backing store: `clearRect` leaves it allocated.
      canvas.width = 0;
      canvas.height = 0;
      container.replaceChildren();
      return;
    }

    let cancelled = false;
    let cleanupLayer: (() => void) | undefined;
    // Bumped by every layer build, so a build overtaken by a newer one (the OCR
    // words arriving mid-build) quietly steps aside.
    let mountSeq = 0;
    // The shape actually used: awaited here, cancelled from the cleanup below.
    // Narrowing it to just `cancel` is what let `await task.promise` through
    // lint and straight into a failed production build.
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;

    const run = (async () => {
      // Whatever held the canvas must finish or abort before this pass touches
      // it. Its outcome is irrelevant here — only that it is over.
      await canvasBusy.current?.catch(() => {});
      if (cancelled) return;

      const pdfjs = await loadPdfjs();
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      setNaturalSize({ width: viewport.width / scale, height: viewport.height / scale });
      const ratio = devicePixelRatioFor(viewport.width, viewport.height);

      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      // The cleanup may have fired while the two awaits above were pending, in
      // which case it had no task to cancel yet — so this pass has to check for
      // itself rather than paint over whatever replaced it.
      if (cancelled) {
        task.cancel();
        return;
      }

      try {
        await task.promise;
      } catch {
        // The only way here is our own `cancel()` on unmount or a zoom change.
        return;
      }
      if (cancelled) return;

      /**
       * Build the page's text layer from a source — the PDF's own text, or a
       * scanned page's OCR words — and make every word in it tappable.
       *
       * One path for both, which is the point: everything below this line is
       * the same for a scan as for a digital page. Building again replaces the
       * previous layer, listeners included.
       *
       * @returns the layer's run strings, or null when superseded or cancelled.
       */
      const mount = async (
        source: ConstructorParameters<typeof pdfjs.TextLayer>[0]['textContentSource'],
        lineOf?: number[],
      ): Promise<string[] | null> => {
        const seq = ++mountSeq;
        cleanupLayer?.();
        cleanupLayer = undefined;

        container.replaceChildren();
        // pdf.js sizes runs from this, and writes their positions as percentages
        // of the page — so this is the one number the text layer needs to line up
        // with the canvas. `userUnit` is part of it: a PDF may declare its own.
        container.style.setProperty(
          '--total-scale-factor',
          String(viewport.scale * viewport.userUnit),
        );

        const textLayer = new pdfjs.TextLayer({ textContentSource: source, container, viewport });
        try {
          await textLayer.render();
        } catch (cause) {
          // Our own cancel — the page left, or a newer build replaced this one.
          if (cancelled || seq !== mountSeq) return null;
          throw cause;
        }
        if (cancelled || seq !== mountSeq) {
          textLayer.cancel();
          return null;
        }

        // The constructor sizes the layer with a CSS `round()` expression; pin it
        // to the canvas instead so the two can never disagree by a rounded pixel.
        // On a quarter-turned page the layer is laid out UNROTATED and turned by
        // CSS (`data-main-rotation`, see pdf-text-layer.css), so its sides swap.
        const quarterTurn = viewport.rotation % 180 !== 0;
        container.style.width = quarterTurn ? canvas.style.height : canvas.style.width;
        container.style.height = quarterTurn ? canvas.style.width : canvas.style.height;

        const strings = textLayer.textContentItemsStr;
        const tops = decorateWords(textLayer.textDivs, strings, lineOf);

        // A word split across runs has to light up as one. CSS `:hover` can only
        // reach the piece under the cursor, so the group is marked here instead.
        let hot: HTMLElement[] = [];
        let dwell: ReturnType<typeof setTimeout> | undefined;

        /** The note whose rectangle contains a word's centre, if any. */
        const noteAround = (word: HTMLElement) => {
          const host = container.parentElement;
          if (!host) return undefined;
          const page = host.getBoundingClientRect();
          if (!page.width || !page.height) return undefined;
          const r = word.getBoundingClientRect();
          const x = (((r.left + r.right) / 2 - page.left) / page.width) * 100;
          const y = (((r.top + r.bottom) / 2 - page.top) / page.height) * 100;
          return notesRef.current.find(
            (n) =>
              x >= n.rect_x &&
              x <= n.rect_x + n.rect_w &&
              y >= n.rect_y &&
              y <= n.rect_y + n.rect_h,
          );
        };
        const clearHot = () => {
          for (const piece of hot) piece.classList.remove(HOT_CLASS);
          hot = [];
        };

        /** Hang the chip under a word — every piece of it, however many runs it spans. */
        const placeChip = (pieces: HTMLElement[], word: string) => {
          const host = container.parentElement;
          if (!host || !pieces.length) return;
          // Measured against the PAGE, and stored as percentages, so the button
          // stays on its word through any zoom.
          const page = host.getBoundingClientRect();
          const first = pieces[0].getBoundingClientRect();
          const last = pieces.at(-1)?.getBoundingClientRect() ?? first;
          if (!page.width || !page.height) return;
          setSpoken({
            word,
            context: buildLineContext(Number(pieces[0].dataset.run), tops, strings),
            x: (((first.left + last.right) / 2 - page.left) / page.width) * 100,
            y: ((last.bottom - page.top) / page.height) * 100,
            note: noteAround(pieces[0]),
          });
        };

        const handleClick = (event: MouseEvent) => {
          const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
            '.flexi-pdf-word',
          );
          if (!target) return;
          // A drag that ends on a word is a phrase selection, not a tap — let the
          // translate chip have it rather than opening the dialog on one word.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;

          const word = target.dataset.word;
          if (!word) return;
          // Heard, not looked up — and so not logged either: the log is the words
          // the reader did not know, and checking how one is said is not that.
          if (onSpeakWordRef.current) {
            // The chip comes up NOW, without the hover's wait: a word that has to
            // be fetched before it is heard would otherwise give no sign for a
            // second or more that the click registered at all.
            clearTimeout(dwell);
            const group = target.dataset.group;
            placeChip(
              group
                ? [...container.querySelectorAll<HTMLElement>(`[data-group="${group}"]`)]
                : [target],
              word,
            );
            onSpeakWordRef.current(word);
            return;
          }
          onWordRef.current(
            word,
            buildLineContext(Number(target.dataset.run), tops, strings),
            pageNumber,
          );
        };
        const handleHover = (event: MouseEvent) => {
          const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
            '.flexi-pdf-word',
          );
          const group = target?.dataset.group;
          if (!group) {
            // The highlight follows the cursor; the button deliberately does not.
            clearTimeout(dwell);
            clearHot();
            setHoveredNote(null);
            return;
          }
          if (hot[0]?.dataset.group === group) return;

          clearHot();
          hot = [...container.querySelectorAll<HTMLElement>(`[data-group="${group}"]`)];
          for (const piece of hot) piece.classList.add(HOT_CLASS);

          // Restarted on every new word, so only stopping on one gets you the
          // button — passing the cursor across a line offers nothing.
          clearTimeout(dwell);
          const word = target?.dataset.word;
          if (!word) return;

          // Immediate, unlike the button: the underline is telling you where you
          // are, and a delay there just reads as lag.
          setHoveredNote(noteAround(target)?.id ?? null);
          // Tap to speak offers NOTHING on rest. Its reader is clicking along a
          // line, eyes on the text; a chip surfacing under whatever word the
          // cursor happened to pause on lands in the middle of the next line and
          // interrupts exactly the reading the mode exists for. The chip comes
          // with the click instead.
          if (onSpeakWordRef.current) return;
          dwell = setTimeout(() => {
            // A drag in progress is a phrase, and the phrase chip is already
            // offering to say it. Two speakers over one selection is one too many
            // (the same rule as `TappableText`).
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) return;
            placeChip(hot, word);
          }, HOVER_DWELL_MS);
        };

        container.addEventListener('click', handleClick);
        container.addEventListener('mousemove', handleHover);
        const handleLeave = () => {
          clearTimeout(dwell);
          clearHot();
          setHoveredNote(null);
        };

        container.addEventListener('mouseleave', handleLeave);
        cleanupLayer = () => {
          clearTimeout(dwell);
          clearHot();
          container.removeEventListener('click', handleClick);
          container.removeEventListener('mousemove', handleHover);
          container.removeEventListener('mouseleave', handleLeave);
          textLayer.cancel();
        };
        return strings;
      };

      const own = await mount(page.streamTextContent());
      if (!own) return;

      // A scan: its own text layer is (almost) empty, and it paints an image.
      // The image check keeps a blank page — a verso, a chapter break — from
      // asking for OCR it does not need. A watermark stamped on every page does
      // not count as the page's own text.
      if (!ocrRef.current) return;
      if (countAlphanumerics(own) >= MIN_ALNUM_PER_PAGE) {
        const boilerplate = await ocrRef.current.boilerplate;
        if (
          cancelled ||
          !ocrRef.current ||
          countOwnAlphanumerics(own, boilerplate) >= MIN_ALNUM_PER_PAGE
        )
          return;
      }
      const operators = await page.getOperatorList();
      if (
        cancelled ||
        !paintsImage(pdfjs.OPS as unknown as Record<string, number>, operators.fnArray)
      )
        return;

      const ascent = ocrAscent(pdfjs);
      const mountOcr = async (words: OcrWords) => {
        const built = buildOcrTextContent(words, viewport, ascent);
        await mount(built.content, built.lineOf);
      };
      ocrMountRef.current = mountOcr;
      setScan(true);
      ocrRef.current.onScanPage(pageNumber);
      // Words already fetched — this page at another zoom, or scrolled back to.
      if (ocrWordsRef.current) await mountOcr(ocrWordsRef.current);
    })().catch((cause) => {
      // A page that fails to parse must not take the document down with it: the
      // rest of the book stays readable and this one shows as a blank sheet.
      // It is still REPORTED — a silently blank page in a book the reader paid
      // for is exactly the kind of fault nobody thinks to describe well enough
      // to reproduce.
      if (!cancelled) console.error('pdf-reader: page failed to render', { pageNumber, cause });
    });

    canvasBusy.current = run;

    return () => {
      cancelled = true;
      ocrMountRef.current = null;
      task?.cancel();
      cleanupLayer?.();
    };
  }, [pdf, pageNumber, scale, isNear]);

  // Scrolling, typing, or touching anything else means the reader has moved on,
  // which is when the button has stopped being about anything. Clicking the
  // button itself is the one thing that must NOT dismiss it — that is the click
  // it exists for, and it has to survive long enough to become a pause button.
  useEffect(() => {
    if (!spoken) return;
    const clear = () => setSpoken(null);
    const clearUnlessOurs = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-flexi-say]')) return;
      setSpoken(null);
    };
    window.addEventListener('scroll', clear, { capture: true, passive: true });
    window.addEventListener('keydown', clear);
    document.addEventListener('pointerdown', clearUnlessOurs, true);
    // A speaker already up when a drag starts would sit beside the phrase chip.
    const clearOnSelect = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) setSpoken(null);
    };
    document.addEventListener('selectionchange', clearOnSelect);
    return () => {
      document.removeEventListener('selectionchange', clearOnSelect);
      window.removeEventListener('scroll', clear, { capture: true });
      window.removeEventListener('keydown', clear);
      document.removeEventListener('pointerdown', clearUnlessOurs, true);
    };
  }, [spoken]);

  // This page's boxes only — typing on page 40 re-renders page 40, nothing else.
  const subscribeBoxes = useCallback(
    (listener: () => void) => boxStore?.subscribe(pageNumber, listener) ?? (() => {}),
    [boxStore, pageNumber],
  );
  const boxes = useSyncExternalStore(
    subscribeBoxes,
    () => boxStore?.snapshot(pageNumber) ?? NO_BOXES,
    () => NO_BOXES,
  );

  // Which tool a click on the page uses. A string, so a pen change that is not
  // a tool change (a colour, a size) re-renders none of the pages.
  const subscribePen = useCallback(
    (listener: () => void) => boxStore?.subscribePen(listener) ?? (() => {}),
    [boxStore],
  );
  const tool = useSyncExternalStore<WriteTool>(
    subscribePen,
    () => boxStore?.penSnapshot().tool ?? 'text',
    () => 'text',
  );

  const pageWidth = naturalSize ? Math.floor(naturalSize.width * scale) : estimatedWidth;
  const pageHeight = naturalSize ? Math.floor(naturalSize.height * scale) : estimatedHeight;

  /** Place a box where the reader clicked — onto the printed blank, if they clicked one. */
  const placeBox = (event: ReactMouseEvent<HTMLDivElement>) => {
    const host = event.currentTarget.parentElement;
    const layer = textLayerRef.current;
    if (!boxStore || !host) return;
    setSpoken(null);

    // Clicking away from the box you were writing in FINISHES it. Only a click
    // with nothing selected starts another box — otherwise every click meant to
    // leave a box left a new empty one behind it.
    if (boxStore.penSnapshot().active) {
      boxStore.setActive(null);
      return;
    }
    // The same for a selected mark: the click lets go of it.
    if (markStore?.activeSnapshot()) {
      markStore.setActive(null);
      return;
    }
    const page = host.getBoundingClientRect();
    if (!page.width || !page.height) return;
    const pct = (px: number, of: number) => Math.min(100, Math.max(0, (px / of) * 100));

    const blank = layer ? blankAt(layer, event.clientX, event.clientY) : null;
    let shape: TextBoxShape;
    if (blank) {
      // Sized to the print around it, and sat on the dots rather than over them.
      const fontPx = Math.min(40, Math.max(9, blank.height * 0.85));
      shape = {
        x: pct(blank.left - page.left, page.width),
        y: pct(blank.bottom - page.top - fontPx * 1.3, page.height),
        w: Math.max(4, pct(blank.width, page.width) + 1),
        size: (fontPx / page.width) * 100,
      };
    } else {
      // Written with whatever pen the editor bar holds.
      const fontPx = (boxStore.penSnapshot().size / 100) * page.width;
      const x = pct(event.clientX - page.left, page.width);
      shape = {
        x,
        // The first line centred on the click, which is where the eye is.
        y: pct(event.clientY - page.top - fontPx * 0.65, page.height),
        w: Math.max(3, Math.min(DEFAULT_BOX_WIDTH, 100 - x)),
      };
    }
    boxStore.create(pageNumber, shape);
  };

  /*
   * ALWAYS LTR, WHATEVER THE INTERFACE LANGUAGE.
   *
   * A canvas draws text in the `direction` of its element, and pdf.js paints
   * the page one glyph at a time from a left edge it expects to be the START.
   * Inherited from a Persian or Arabic page, `rtl` makes every glyph's start its
   * RIGHT edge: each letter lands one width to the left of where it belongs and
   * the book prints as "Docum en ts". pdf.js's own viewer pins `.page` to `ltr`
   * for exactly this; the transplanted CSS did not bring that along.
   *
   * The page is a physical coordinate space anyway — notes and text boxes sit at
   * `left: x%` — so the handles on a text box belong on its physical edges too.
   * A right-to-left BOOK is unaffected: a PDF stores every glyph at its printed
   * position, and pdf.js marks the text layer's rtl runs itself.
   */
  return (
    <div
      dir="ltr"
      data-page={pageNumber}
      className="relative mx-auto overflow-hidden rounded-[7px] border border-border bg-white shadow-md"
      // Page size in px: a continuous value (zoom x page size), not expressible as a class.
      style={{ width: pageWidth, height: pageHeight }}
    >
      <canvas ref={canvasRef} className="block" />

      {/*
        UNDERLINED, AND UNTOUCHABLE.

        A note used to be a filled button laid over its words, which made the
        words underneath unreachable: having written a note about a sentence,
        you could no longer look up anything in it. The note is now drawn as a
        rule under the line with `pointer-events: none`, so every word it covers
        stays exactly as clickable as before. The note itself is reached by
        resting on any word inside it — see the chip below.
      */}
      {notes.map((note) => (
        <span
          key={note.id}
          aria-hidden
          // Stored percentages of the page box — continuous values.
          style={{
            left: `${note.rect_x}%`,
            top: `${note.rect_y}%`,
            width: `${note.rect_w}%`,
            height: `${note.rect_h}%`,
          }}
          // Strong enough at rest to find again on a busy textbook page — at 30%
          // the rule vanished into the book's own coloured print.
          className={`pointer-events-none absolute z-[1] border-b-2 transition-colors duration-150 ${
            hoveredNote === note.id || activeNoteId === note.id
              ? 'border-warning bg-warning/30'
              : 'border-warning/90 bg-warning/[0.14]'
          }`}
        />
      ))}

      {/*
        WRITE MODE. A sheet over the words, so a click places a box instead of
        opening the word dialog — the two cannot share a click. The boxes sit
        above it, so clicking into an existing answer edits that answer.
      */}
      {writing && boxStore && tool === 'text' && (
        <div aria-hidden onClick={placeBox} className="absolute inset-0 z-[4] cursor-text" />
      )}

      {boxStore &&
        boxes.map((box) => (
          <PdfTextBox
            key={box.key}
            box={box}
            store={boxStore}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            writing={writing}
          />
        ))}

      {/* Arrows, boxes and stamps. With another tool than text picked up, this
          layer brings its own drawing sheet in place of the one above. */}
      {boxStore && markStore && (
        <PdfMarksLayer
          store={markStore}
          pen={boxStore}
          page={pageNumber}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          writing={writing}
          tool={tool}
        />
      )}

      {/* `data-lookup-text` is what `useSelectionPhrase` looks for: without it a
          selection inside the page is invisible to the chip, so dragging across
          a phrase in a PDF did nothing at all. */}
      <div ref={textLayerRef} data-lookup-text="" className="flexi-pdf-textlayer" />

      {/* A scanned page whose words are still on their way answers a click with the
          "analysing this page" dialog, and the dialog closes by itself when the
          words land. Asking also moves the page to the front of the OCR queue. */}
      {pageWaiting && !writing && (
        <div
          aria-hidden
          data-ocr-waiting=""
          className="absolute inset-0 z-[2] cursor-progress"
          onClick={() => {
            ocrRef.current?.onPageWanted?.(pageNumber);
            setWaitingOpen(true);
          }}
        />
      )}
      <PdfPageWorkingDialog
        open={waitingOpen && pageWaiting}
        onClose={() => setWaitingOpen(false)}
      />

      {/* Offered, never fired. The cursor RESTING on a word puts a speaker
          under it; the sound still waits to be asked for. Audio that started
          by itself would be startling once and intolerable on a page of five
          hundred words. */}
      {spoken && (
        // Deliberately the same object as the selection chip. One word and
        // several words are the same gesture at different sizes; two lookalike
        // controls with different skins would read as two unrelated features.
        <span
          data-flexi-say=""
          // Percentages of the page box — continuous values.
          style={{ left: `${spoken.x}%`, top: `${spoken.y}%` }}
          className="absolute z-[3] flex -translate-x-1/2 translate-y-1 items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-lg"
        >
          {/* With tap to speak on, the click is what speaks — so the voice here
              is not a second way to play the word but the click's own receipt:
              spinning while the word is fetched, a stop square while it plays,
              the speaker again once it is done (and then it replays). Beside it,
              what the click gave up: the same Translate the selection chip
              carries. */}
          {onSpeakWord ? (
            (() => {
              const mine = speech?.word === spoken.word;
              const loading = mine && !!speech?.loading;
              const busy = loading || (mine && !!speech?.speaking);
              return (
                <>
                  <button
                    type="button"
                    onClick={() => (busy ? onStopSpeaking?.() : onSpeakWord(spoken.word))}
                    title={spoken.word}
                    aria-label={t('read.playSelection')}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
                  >
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : busy ? (
                      <Square className="h-3 w-3 fill-current" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onWordRef.current(spoken.word, spoken.context, pageNumber);
                      setSpoken(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-muted"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {t('read.translateSelection')}
                  </button>
                </>
              );
            })()
          ) : (
            <SpeakButton
              text={spoken.word}
              lang={language}
              title={spoken.word}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
            />
          )}

          {spoken.note && (
            <button
              type="button"
              onClick={() => onOpenNote(spoken.note!)}
              title={spoken.note.body || spoken.note.quote}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
