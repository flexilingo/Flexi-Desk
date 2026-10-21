import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, X } from 'lucide-react';
import type { TextBox, TextBoxStore } from '../lib/text-box-store';
import { inkTextClass, inkTextStyle } from '../lib/ink';

const LINE_HEIGHT = 1.3;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * One thing the learner wrote on the page.
 *
 * Drawn in the accent ink by default — the colour that means "you did this" — so an
 * answer never reads as part of the book's own print. The editor bar can
 * change the ink and weight; see `PdfEditorBar`. The same box in both modes: while
 * writing it is a textarea with handles, otherwise it is plain text that lets
 * every click through to the words underneath, exactly like a note's rule.
 *
 * Position and width are percentages of the page and the text size is a share
 * of its width, so the answer stays on its blank, the same size relative to the
 * print, at any zoom.
 */
export function PdfTextBox({
  box,
  store,
  pageWidth,
  pageHeight,
  writing,
}: {
  box: TextBox;
  store: TextBoxStore;
  /** The page's current size in CSS pixels. */
  pageWidth: number;
  pageHeight: number;
  writing: boolean;
}) {
  const { t } = useTranslation('reader');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fontPx = (box.size / 100) * pageWidth;

  // Which box the editor bar is pointed at. Shown, because the bar keeps
  // pointing at this box while the cursor is off in the settings popover —
  // without a mark, a change would appear to come from nowhere.
  const subscribePen = useCallback((listener: () => void) => store.subscribePen(listener), [store]);
  const activeKey = useSyncExternalStore(
    subscribePen,
    () => store.penSnapshot().active,
    () => null,
  );
  const isActive = writing && activeKey === box.key;

  // The width is the box's; the height is the answer's.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }, [box.body, fontPx, box.w, pageWidth, writing]);

  /** Drag to move, or drag the right edge to widen. Saved once the pointer stops. */
  const startDrag = (mode: 'move' | 'resize') => (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY, left: box.x, top: box.y, width: box.w };
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - start.x) / pageWidth) * 100;
      const dy = ((moveEvent.clientY - start.y) / pageHeight) * 100;
      if (mode === 'move') {
        store.update(box.key, {
          x: clamp(start.left + dx, 0, 100 - box.w),
          y: clamp(start.top + dy, 0, 98),
        });
      } else {
        store.update(box.key, { w: clamp(start.width + dx, 3, 100 - box.x) });
      }
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const textStyle = {
    fontSize: `${fontPx}px`,
    lineHeight: LINE_HEIGHT,
    ...inkTextStyle(box.color),
  };
  // Identical in both modes, so the text does not shift when writing is toggled.
  const textClass = `block w-full whitespace-pre-wrap break-words rounded-[3px] border px-0.5 ${
    box.bold ? 'font-bold' : 'font-medium'
  } ${inkTextClass(box.color)}`;
  // White, like the page, so the print under an answer stops showing through.
  // One class or the other, never both: which of two `bg-*` wins would depend
  // on their order in the stylesheet, not on this line.
  const paper = box.background ? 'bg-white/95' : '';

  return (
    <div
      className={`group absolute ${writing ? 'z-[5]' : 'pointer-events-none z-[2]'} ${
        isActive ? 'rounded-[4px] ring-2 ring-primary/45' : ''
      }`}
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%` }}
    >
      {writing ? (
        <textarea
          ref={areaRef}
          // A box the reader just placed takes the cursor; one reopened later does not.
          autoFocus={box.fresh}
          value={box.body}
          rows={1}
          dir="auto"
          spellCheck={false}
          aria-label={t('pdf.write.box')}
          onChange={(event) => store.update(box.key, { body: event.target.value })}
          // The editor bar follows the cursor: it shows, and changes, this box.
          onFocus={() => store.setActive(box.key)}
          onBlur={() => {
            // The bar keeps pointing here: opening its popover blurs this very
            // textarea, and the change still has to land on this box.
            // A box left empty was a misclick, not an answer.
            if (!box.body.trim()) store.remove(box.key);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur();
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
              event.preventDefault();
              store.style({ bold: !box.bold });
            }
          }}
          style={textStyle}
          className={`${textClass} resize-none overflow-hidden border-dashed border-accent/70 outline-none focus:border-solid focus:border-accent ${
            paper || 'bg-transparent focus:bg-card/85'
          }`}
        />
      ) : (
        <div dir="auto" style={textStyle} className={`${textClass} border-transparent ${paper}`}>
          {box.body}
        </div>
      )}

      {writing && (
        <>
          <button
            type="button"
            onPointerDown={startDrag('move')}
            aria-label={t('pdf.write.move')}
            title={t('pdf.write.move')}
            className="absolute -start-5 top-0 inline-flex h-5 w-5 cursor-move touch-none items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => store.remove(box.key)}
            aria-label={t('pdf.write.delete')}
            title={t('pdf.write.delete')}
            className="absolute -end-2.5 -top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-error group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
          <span
            onPointerDown={startDrag('resize')}
            aria-hidden
            className="absolute -end-1 bottom-0 top-0 w-2 cursor-ew-resize touch-none"
          />
        </>
      )}

      {/* Said on the box it happened to, with the one thing that fixes it. */}
      {box.failed && (
        <button
          type="button"
          onClick={() => store.retry(box.key)}
          className="pointer-events-auto absolute start-0 top-full mt-0.5 inline-flex whitespace-nowrap rounded-md bg-error/10 px-1.5 py-0.5 text-[11px] font-semibold text-error"
        >
          {t('pdf.write.retry')}
        </button>
      )}
    </div>
  );
}
