import {
  useCallback,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CircleQuestionMark, Star, X } from 'lucide-react';
import { isStampKind, type Mark, type MarkShape, type MarkStore } from '../lib/mark-store';
import type { TextBoxStore, WriteTool } from '../lib/text-box-store';
import { inkTextClass, inkTextStyle } from '../lib/ink';

const EMPTY: Mark[] = [];

const STAMP_ICONS = { check: Check, cross: X, question: CircleQuestionMark, star: Star } as const;

/**
 * A line's weight in px, from the pen size (a share of page width).
 *
 * Scaled down from the text size it shares a control with: the pen's 1.6 is a
 * comfortable line of handwriting, and the same number as a stroke would be a
 * marker pen. At that size this is about 2px on a laptop-wide page.
 */
const strokeFor = (size: number, pageWidth: number) =>
  Math.max(1.5, ((pageWidth * size) / 100) * 0.14);

/** A stamp's height in px — about one and a half lines of the pen's writing. */
const stampFor = (size: number, pageWidth: number) =>
  Math.max(10, ((pageWidth * size) / 100) * 1.5);

/** An arrow as a shaft and a solid head, both in px. The shaft stops inside the head so no tip pokes through. */
function arrowParts(x1: number, y1: number, x2: number, y2: number, stroke: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(length * 0.6, Math.max(8, stroke * 4.5));
  const half = head * 0.5;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  return {
    shaft: { x1, y1, x2: bx + ux * stroke * 0.5, y2: by + uy * stroke * 0.5 },
    head: `${x2},${y2} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`,
  };
}

/**
 * The book's word under a point — the text layer sits under the drawing sheet,
 * so it is looked up, not clicked.
 *
 * Forgiving sideways: the space between two words is a few pixels, and a press
 * that lands in it ("la▯nationalité") meant one of them. The nearest word on
 * the same line within a short reach counts; nothing above or below does.
 */
function wordAt(x: number, y: number): HTMLElement | null {
  for (const dx of [0, -4, 4, -8, 8, -10, 10]) {
    const hit = document
      .elementsFromPoint(x + dx, y)
      .find((el) => el.classList.contains('flexi-pdf-word'));
    if (hit) return hit as HTMLElement;
  }
  return null;
}

/** Every piece of a word, however many runs a ligature split it across, as one rectangle. */
function wordRect(word: HTMLElement): DOMRect {
  const group = word.dataset.group;
  const pieces = group
    ? [
        ...(word
          .closest('.flexi-pdf-textlayer')
          ?.querySelectorAll<HTMLElement>(`[data-group="${group}"]`) ?? []),
      ]
    : [];
  const rects = (pieces.length ? pieces : [word]).map((piece) => piece.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * The marks on one page — arrows, boxes, and the tick / cross / question / star
 * stamps — and, in write mode, the drawing of new ones.
 *
 * Drawn in px from percentages, rather than in a 0-100 viewBox stretched over
 * the page: a page is not square, so a stretched viewBox would draw an arrow's
 * head squashed and a line thicker going one way than the other.
 *
 * Outside write mode every mark lets clicks through, exactly like a text box —
 * a word under an arrow stays a word you can look up.
 */
export function PdfMarksLayer({
  store,
  pen,
  page,
  pageWidth,
  pageHeight,
  writing,
  tool,
}: {
  store: MarkStore;
  /** The writing pen: the ink and size a new mark is drawn with, and the text box a mark takes over from. */
  pen: TextBoxStore;
  page: number;
  pageWidth: number;
  pageHeight: number;
  writing: boolean;
  tool: WriteTool;
}) {
  const { t } = useTranslation('reader');

  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(page, listener),
    [store, page],
  );
  const marks = useSyncExternalStore(
    subscribe,
    () => store.snapshot(page),
    () => EMPTY,
  );
  const subscribeActive = useCallback(
    (listener: () => void) => store.subscribeActive(listener),
    [store],
  );
  const active = useSyncExternalStore(
    subscribeActive,
    () => store.activeSnapshot(),
    () => null,
  );

  /** The arrow or box being dragged out, before it exists. */
  const [draft, setDraft] = useState<MarkShape | null>(null);

  const px = (pct: number) => (pct / 100) * pageWidth;
  const py = (pct: number) => (pct / 100) * pageHeight;

  /**
   * Where a pointer is on this page, as percentages.
   *
   * Measured from the element under the pointer's own page every time, not
   * cached at the start of a drag: the page can scroll under a drag in progress.
   */
  const pointAt = (event: { clientX: number; clientY: number }, from: Element) => {
    const rect = from.closest('[data-page]')?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  };

  /** Picking up a mark takes over from any text box, and shows the mark's own pen in the bar. */
  const select = (mark: Mark) => {
    pen.setActive(null);
    pen.style({ size: mark.size, color: mark.color }, { remember: false });
    store.setActive(mark.key);
  };

  /**
   * Drag a mark: the whole of it, or just one end.
   *
   * Shown moving on every frame and saved once, when it is let go — see
   * `MarkStore.update`. A press that never moves only selects.
   */
  const startDrag =
    (mark: Mark, part: 'whole' | 'start' | 'end') => (event: ReactPointerEvent<Element>) => {
      if (!writing) return;
      event.preventDefault();
      event.stopPropagation();
      select(mark);
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const origin = pointAt(event, handle);
      let moved = false;

      const move = (moveEvent: PointerEvent) => {
        const at = pointAt(moveEvent, handle);
        const dx = at.x - origin.x;
        const dy = at.y - origin.y;
        if (!moved && Math.hypot(dx, dy) < 0.3) return;
        moved = true;
        if (part === 'whole') {
          store.update(
            mark.key,
            { x1: mark.x1 + dx, y1: mark.y1 + dy, x2: mark.x2 + dx, y2: mark.y2 + dy },
            { save: false },
          );
        } else if (part === 'start') {
          store.update(mark.key, { x1: at.x, y1: at.y }, { save: false });
        } else {
          store.update(mark.key, { x2: at.x, y2: at.y }, { save: false });
        }
      };
      const end = () => {
        handle.removeEventListener('pointermove', move as (event: Event) => void);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        if (moved) store.commit(mark.key);
      };
      handle.addEventListener('pointermove', move as (event: Event) => void);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    };

  /**
   * Choosing an option: press on a word, let go — on the same word, or further
   * along the line for a phrase like "la nationalité". The mark takes the
   * words' own bounds, so it sits exactly on the print, as the book's example
   * underlines "ville". A press on no word only clears the selection.
   */
  const startHighlight = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    pen.setActive(null);
    const sheet = event.currentTarget;
    const first = wordAt(event.clientX, event.clientY);
    const finish = (upEvent: PointerEvent) => {
      sheet.removeEventListener('pointerup', finish);
      sheet.removeEventListener('pointercancel', cancel);
      // Either end missing a word takes the other end's: the drag was still
      // aimed at the words it did reach.
      const last = wordAt(upEvent.clientX, upEvent.clientY) ?? first;
      const start = first ?? last;
      const pageRect = sheet.closest('[data-page]')?.getBoundingClientRect();
      if (!start || !last || !pageRect?.width || !pageRect.height) {
        store.setActive(null);
        return;
      }
      const a = wordRect(start);
      const b = wordRect(last);
      // One line only: a drag onto the next line keeps just the first word
      // rather than boxing the whole paragraph between them.
      const sameLine = Math.abs(a.top - b.top) < a.height * 0.6;
      const left = sameLine ? Math.min(a.left, b.left) : a.left;
      const right = sameLine ? Math.max(a.right, b.right) : a.right;
      const top = sameLine ? Math.min(a.top, b.top) : a.top;
      const bottom = sameLine ? Math.max(a.bottom, b.bottom) : a.bottom;
      const padX = a.height * 0.12;
      const pct = (value: number, from: number, size: number) => ((value - from) / size) * 100;
      const { size, color } = pen.penSnapshot();
      store.create(page, {
        kind: 'highlight',
        x1: pct(left - padX, pageRect.left, pageRect.width),
        y1: pct(top - a.height * 0.08, pageRect.top, pageRect.height),
        x2: pct(right + padX, pageRect.left, pageRect.width),
        y2: pct(bottom + a.height * 0.12, pageRect.top, pageRect.height),
        size,
        color,
      });
    };
    const cancel = () => {
      sheet.removeEventListener('pointerup', finish);
      sheet.removeEventListener('pointercancel', cancel);
    };
    sheet.setPointerCapture(event.pointerId);
    sheet.addEventListener('pointerup', finish);
    sheet.addEventListener('pointercancel', cancel);
  };

  /** Arrow and box: press, drag, let go. A press that goes nowhere just clears the selection. */
  const startDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === 'highlight') {
      startHighlight(event);
      return;
    }
    if (tool !== 'arrow' && tool !== 'box') return;
    event.preventDefault();
    pen.setActive(null);
    const sheet = event.currentTarget;
    sheet.setPointerCapture(event.pointerId);
    const from = pointAt(event, sheet);
    const { size, color } = pen.penSnapshot();
    let shape: MarkShape = {
      kind: tool,
      x1: from.x,
      y1: from.y,
      x2: from.x,
      y2: from.y,
      size,
      color,
    };
    setDraft(shape);

    const move = (moveEvent: PointerEvent) => {
      const at = pointAt(moveEvent, sheet);
      shape = { ...shape, x2: at.x, y2: at.y };
      setDraft(shape);
    };
    const end = () => {
      sheet.removeEventListener('pointermove', move as (event: Event) => void);
      sheet.removeEventListener('pointerup', end);
      sheet.removeEventListener('pointercancel', end);
      setDraft(null);
      // Measured in page WIDTHS on both axes, so "long enough" means the same
      // thing across the page as down it.
      const w = Math.abs(shape.x2 - shape.x1);
      const h = (Math.abs(shape.y2 - shape.y1) * pageHeight) / pageWidth;
      const drawn = shape.kind === 'arrow' ? Math.hypot(w, h) >= 1.5 : w >= 1 && h >= 1;
      if (drawn) store.create(page, shape);
      else store.setActive(null);
    };
    sheet.addEventListener('pointermove', move as (event: Event) => void);
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  };

  /** Stamps: one click, centred where it landed. */
  const placeStamp = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (tool === 'text' || !isStampKind(tool)) return;
    pen.setActive(null);
    const at = pointAt(event, event.currentTarget);
    const { size, color } = pen.penSnapshot();
    store.create(page, { kind: tool, x1: at.x, y1: at.y, x2: at.x, y2: at.y, size, color });
  };

  const drawingTool = writing && tool !== 'text';
  const lines = marks.filter((mark) => !isStampKind(mark.kind));
  const stamps = marks.filter((mark) => isStampKind(mark.kind));
  const selected = writing ? marks.find((mark) => mark.key === active) : undefined;

  const renderLine = (mark: MarkShape & { key: string }, preview = false) => {
    const stroke = strokeFor(mark.size, pageWidth);
    const x1 = px(mark.x1);
    const y1 = py(mark.y1);
    const x2 = px(mark.x2);
    const y2 = py(mark.y2);
    // A line thin enough to read well is too thin to grab: an invisible wider
    // copy takes the pointer.
    const grab =
      writing && !preview
        ? {
            onPointerDown: startDrag(mark as Mark, 'whole'),
            stroke: 'transparent',
            strokeWidth: Math.max(14, stroke * 4),
            fill: 'none',
            pointerEvents: 'stroke' as const,
            className: 'cursor-move',
          }
        : null;

    if (mark.kind === 'arrow') {
      const { shaft, head } = arrowParts(x1, y1, x2, y2, stroke);
      return (
        <g
          key={mark.key}
          className={inkTextClass(mark.color)}
          style={inkTextStyle(mark.color)}
          opacity={preview ? 0.7 : 1}
        >
          <line {...shaft} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
          <polygon
            points={head}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={stroke * 0.5}
            strokeLinejoin="round"
          />
          {grab && <line x1={x1} y1={y1} x2={x2} y2={y2} {...grab} />}
        </g>
      );
    }
    const box = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
      rx: Math.min(6, stroke * 2),
    };
    if (mark.kind === 'highlight') {
      // A tint over the word, so the choice reads at a glance, and a rule under
      // it, the way the book's own example marks its answer.
      return (
        <g key={mark.key} className={inkTextClass(mark.color)} style={inkTextStyle(mark.color)}>
          <rect {...box} rx={2} fill="currentColor" fillOpacity={0.16} />
          <line
            x1={box.x}
            y1={box.y + box.height}
            x2={box.x + box.width}
            y2={box.y + box.height}
            stroke="currentColor"
            strokeWidth={Math.max(1.5, stroke)}
            strokeLinecap="round"
          />
          {grab && <rect {...box} {...grab} fill="transparent" pointerEvents="all" />}
        </g>
      );
    }
    return (
      <g
        key={mark.key}
        className={inkTextClass(mark.color)}
        style={inkTextStyle(mark.color)}
        opacity={preview ? 0.7 : 1}
      >
        <rect {...box} fill="none" stroke="currentColor" strokeWidth={stroke} />
        {grab && <rect {...box} {...grab} />}
      </g>
    );
  };

  /** The selected mark's controls: round handles on a line's two points, and delete. */
  const renderControls = (mark: Mark) => {
    const stamp = isStampKind(mark.kind);
    const half = stamp ? (stampFor(mark.size, pageWidth) / 2 / pageWidth) * 100 : 0;
    // Top-right of the mark's box, as percentages — where the delete button sits.
    const right = stamp ? mark.x1 + half : Math.max(mark.x1, mark.x2);
    const top = stamp ? mark.y1 - (half * pageWidth) / pageHeight : Math.min(mark.y1, mark.y2);
    return (
      <>
        {/* A highlight takes its bounds from the words; there is nothing to reshape. */}
        {!stamp && mark.kind !== 'highlight' && (
          <svg
            width={pageWidth}
            height={pageHeight}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            {(['start', 'end'] as const).map((part) => (
              <circle
                key={part}
                cx={px(part === 'start' ? mark.x1 : mark.x2)}
                cy={py(part === 'start' ? mark.y1 : mark.y2)}
                r={6}
                pointerEvents="all"
                onPointerDown={startDrag(mark, part)}
                className="cursor-grab fill-card stroke-primary"
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
        <button
          type="button"
          onClick={() => store.remove(mark.key)}
          aria-label={t('pdf.write.delete')}
          title={t('pdf.write.delete')}
          style={{ left: `${right}%`, top: `${top}%` }}
          className="pointer-events-auto absolute inline-flex h-5 w-5 -translate-y-1/2 translate-x-1 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-error"
        >
          <X className="h-3 w-3" />
        </button>
      </>
    );
  };

  return (
    <>
      {/* The drawing surface, under the marks and the text boxes, so pressing
          on an existing one picks it up instead of drawing over it. */}
      {drawingTool && (
        <div
          aria-hidden
          onPointerDown={startDrawing}
          onClick={placeStamp}
          className={`absolute inset-0 z-[4] touch-none ${
            tool === 'arrow' || tool === 'box'
              ? 'cursor-crosshair'
              : tool === 'highlight'
                ? 'cursor-pointer'
                : 'cursor-copy'
          }`}
        />
      )}

      <div className={`pointer-events-none absolute inset-0 ${writing ? 'z-[5]' : 'z-[2]'}`}>
        <svg width={pageWidth} height={pageHeight} className="absolute inset-0 overflow-visible">
          {lines.map((mark) => renderLine(mark))}
          {draft && renderLine({ ...draft, key: 'draft' }, true)}
        </svg>

        {stamps.map((mark) => {
          const Icon = STAMP_ICONS[mark.kind as keyof typeof STAMP_ICONS];
          const size = stampFor(mark.size, pageWidth);
          return (
            <span
              key={mark.key}
              onPointerDown={writing ? startDrag(mark, 'whole') : undefined}
              style={{
                left: `${mark.x1}%`,
                top: `${mark.y1}%`,
                width: size,
                height: size,
                ...inkTextStyle(mark.color),
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${inkTextClass(mark.color)} ${
                writing ? 'pointer-events-auto cursor-move touch-none' : ''
              } ${mark.key === active && writing ? 'rounded-[4px] ring-2 ring-primary/45' : ''}`}
            >
              <Icon className="h-full w-full" strokeWidth={2.75} />
            </span>
          );
        })}

        {selected && renderControls(selected)}

        {/* Said on the mark it happened to, with the one thing that fixes it. */}
        {marks
          .filter((mark) => mark.failed)
          .map((mark) => (
            <button
              key={`retry-${mark.key}`}
              type="button"
              onClick={() => store.retry(mark.key)}
              style={{
                left: `${Math.min(mark.x1, mark.x2)}%`,
                top: `${Math.max(mark.y1, mark.y2)}%`,
              }}
              className="pointer-events-auto absolute mt-1 inline-flex whitespace-nowrap rounded-md bg-error/10 px-1.5 py-0.5 text-[11px] font-semibold text-error"
            >
              {t('pdf.write.retry')}
            </button>
          ))}
      </div>
    </>
  );
}
