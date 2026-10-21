import { useTranslation } from 'react-i18next';
import { Hand, Minus, MousePointer2, Plus, X } from 'lucide-react';
import { ZOOM_MAX, ZOOM_MIN, stepZoom } from '../text/zoom';

export type PdfPointerTool = 'hand' | 'select';

/**
 * How the reader moves around a page and zooms it — always on screen, over the
 * bottom of the pages, the way every desktop PDF viewer does it.
 *
 * Zoom used to live inside Settings, and a zoomed page could only be moved with
 * scrollbars. The hand drags the page in any direction (a plain click on a word
 * still looks it up); the arrow is for selecting a phrase. Zooming in picks the
 * hand by itself, and says so once.
 */
export function PdfViewControls({
  zoom,
  onZoomChange,
  tool,
  onToolChange,
  showTools,
  hint,
  onDismissHint,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  tool: PdfPointerTool;
  onToolChange: (tool: PdfPointerTool) => void;
  /** Off while writing: a click there places a box, and a drag draws. */
  showTools: boolean;
  /** The one-time line explaining the hand, shown above the bar. */
  hint: boolean;
  onDismissHint: () => void;
}) {
  const { t } = useTranslation('reader');

  const toolButton = (value: PdfPointerTool, label: string, Icon: typeof Hand) => {
    const active = tool === value;
    return (
      <button
        type="button"
        onClick={() => onToolChange(value)}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  const zoomButton = (direction: 1 | -1) => {
    const label = direction > 0 ? t('pdf.view.zoomIn') : t('pdf.view.zoomOut');
    const Icon = direction > 0 ? Plus : Minus;
    return (
      <button
        type="button"
        onClick={() => onZoomChange(stepZoom(zoom, direction))}
        disabled={direction > 0 ? zoom >= ZOOM_MAX : zoom <= ZOOM_MIN}
        aria-label={label}
        title={label}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
      {hint && showTools && (
        <div className="pointer-events-auto inline-flex max-w-md items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground shadow-lg">
          <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t('pdf.view.handHint')}</span>
          <button
            type="button"
            onClick={onDismissHint}
            aria-label={t('pdf.ocr.dismiss')}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Laid out left to right in every language: minus, amount, plus. */}
      <div
        dir="ltr"
        className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-lg"
      >
        {showTools && (
          <>
            {toolButton('hand', t('pdf.view.hand'), Hand)}
            {toolButton('select', t('pdf.view.select'), MousePointer2)}
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          </>
        )}
        {zoomButton(-1)}
        <button
          type="button"
          onClick={() => onZoomChange(1)}
          title={t('pdf.view.fitWidth')}
          aria-label={t('pdf.view.fitWidth')}
          className="inline-flex h-9 min-w-[3.5rem] items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {Math.round(zoom * 100)}%
        </button>
        {zoomButton(1)}
      </div>
    </div>
  );
}
