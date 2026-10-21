import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Check,
  CircleQuestionMark,
  Highlighter,
  Minus,
  MoveUpRight,
  PaintBucket,
  PenLine,
  Pipette,
  Plus,
  Square,
  Star,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  PRESET_COLORS,
  TEXT_SIZES,
  type TextBoxStore,
  type TextColor,
  type WriteTool,
} from '../lib/text-box-store';
import { isStampKind, type MarkStore } from '../lib/mark-store';
import { inkBgClass, inkBgStyle } from '../lib/ink';

/**
 * What a click or drag on the page makes. Text first — it is what the bar was
 * for — then the two shapes you drag out, then the stamps you click down.
 */
const TOOLS: { tool: WriteTool; Icon: LucideIcon }[] = [
  { tool: 'text', Icon: Type },
  { tool: 'highlight', Icon: Highlighter },
  { tool: 'arrow', Icon: MoveUpRight },
  { tool: 'box', Icon: Square },
  { tool: 'check', Icon: Check },
  { tool: 'cross', Icon: X },
  { tool: 'question', Icon: CircleQuestionMark },
  { tool: 'star', Icon: Star },
];

/** How long the colour dialog must go quiet before the shade counts as chosen. */
const COMMIT_PAUSE_MS = 500;

/**
 * The pen, while writing on the page: size, ink, weight — and done.
 *
 * Its own row, under the toolbar, and only while writing. Everything is in
 * reach because this bar exists for the minutes you are filling a page in;
 * hiding a colour behind a menu would cost a click on every answer.
 *
 * It follows the cursor. Inside a box it shows that box's pen and every change
 * lands on it; the same change becomes the pen the next box is written with —
 * the way a real pen stays the colour you last picked.
 *
 * The bar takes no focus: pressing a button here must not blur the box it is
 * meant to style. The box it points at keeps a ring, so a change can never
 * appear to come from nowhere.
 */
export function PdfEditorBar({
  store,
  marks,
  onDone,
}: {
  store: TextBoxStore;
  /** Arrows, boxes and stamps. The ink and size here land on the selected one too. */
  marks: MarkStore;
  onDone: () => void;
}) {
  const { t } = useTranslation('reader');
  const subscribe = useCallback((listener: () => void) => store.subscribePen(listener), [store]);
  const pen = useSyncExternalStore(
    subscribe,
    () => store.penSnapshot(),
    () => store.penSnapshot(),
  );

  const subscribeMark = useCallback(
    (listener: () => void) => marks.subscribeActive(listener),
    [marks],
  );
  const activeMark = useSyncExternalStore(
    subscribeMark,
    () => marks.activeSnapshot(),
    () => null,
  );

  /** One change, to the pen and to whatever it is pointed at — a box or a mark. */
  const style = (
    patch: { size?: number; color?: TextColor; bold?: boolean; background?: boolean },
    options?: { remember: boolean },
  ) => {
    store.style(patch, options);
    // Bold is text-only; a mark takes the ink and the size.
    if (patch.size !== undefined || patch.color !== undefined) {
      marks.styleActive({ size: patch.size, color: patch.color });
    }
  };

  /** A box snapped to a blank carries that blank's size, so step from the nearest one. */
  const stepSize = (direction: 1 | -1) => {
    let nearest = 0;
    TEXT_SIZES.forEach((size, index) => {
      if (Math.abs(size - pen.size) < Math.abs(TEXT_SIZES[nearest] - pen.size)) nearest = index;
    });
    style({ size: TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, nearest + direction))] });
  };

  const pickTool = (tool: WriteTool) => {
    store.setTool(tool);
    marks.setActive(null);
  };

  // Delete and Escape act on a selected MARK. A text box handles its own keys,
  // and a key typed into any field is that field's — never a deletion.
  useEffect(() => {
    if (!activeMark) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        marks.remove(activeMark);
      } else if (event.key === 'Escape') {
        marks.setActive(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMark, marks]);

  const selected = activeMark ?? pen.active;
  const hint = activeMark
    ? t('pdf.write.hints.mark')
    : pen.active
      ? t('pdf.write.editingHint')
      : pen.tool === 'text'
        ? t('pdf.write.hint')
        : pen.tool === 'arrow' || pen.tool === 'box' || pen.tool === 'highlight'
          ? t(`pdf.write.hints.${pen.tool}`)
          : t('pdf.write.hints.stamp');

  // Cleared on unmount so a pick abandoned by closing the bar remembers nothing.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (commitTimer.current && clearTimeout(commitTimer.current)), []);

  const iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted';
  const divider = <span aria-hidden className="h-6 w-px bg-border" />;

  const swatch = (color: TextColor, label: string) => (
    <button
      key={color}
      type="button"
      role="radio"
      aria-checked={pen.color === color}
      aria-label={label}
      title={label}
      onClick={() => style({ color })}
      style={inkBgStyle(color)}
      className={`inline-flex h-6 w-6 rounded-full ${inkBgClass(color)} ${
        pen.color === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''
      }`}
    />
  );

  return (
    <div
      role="toolbar"
      aria-label={t('pdf.write.pen')}
      // Nothing here takes the cursor out of the box being written in.
      onMouseDown={(event) => event.preventDefault()}
      className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <PenLine className="h-4 w-4" />
        </span>
        {t('pdf.write.pen')}
      </span>

      {divider}

      {/* The tools are the options; the fill is the choice — the same olive a
          switch uses when it is on. */}
      <div
        role="radiogroup"
        aria-label={t('pdf.write.tools.label')}
        className="inline-flex items-center gap-1"
      >
        {TOOLS.map(({ tool, Icon }) => (
          <button
            key={tool}
            type="button"
            role="radio"
            aria-checked={pen.tool === tool}
            aria-label={t(`pdf.write.tools.${tool}`)}
            title={t(`pdf.write.tools.${tool}`)}
            onClick={() => pickTool(tool)}
            className={`${iconButton} ${pen.tool === tool ? '!border-primary/55 !bg-primary/10 !text-primary' : ''}`}
          >
            <Icon
              className="h-4 w-4"
              strokeWidth={tool !== 'text' && isStampKind(tool) ? 2.75 : 2}
            />
          </button>
        ))}
      </div>

      {divider}

      <div className="inline-flex items-center gap-1" aria-label={t('pdf.write.size')}>
        <button
          type="button"
          onClick={() => stepSize(-1)}
          aria-label={t('pdf.write.smaller')}
          title={t('pdf.write.smaller')}
          className={iconButton}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[2.25rem] text-center text-sm font-semibold tabular-nums text-foreground">
          {Math.round(pen.size * 10)}
        </span>
        <button
          type="button"
          onClick={() => stepSize(1)}
          aria-label={t('pdf.write.larger')}
          title={t('pdf.write.larger')}
          className={iconButton}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {divider}

      {/* The inks are the options; the ring is the choice. Colours the learner
          picked sit next to the presets, and the pipette opens any other. */}
      <div
        role="radiogroup"
        aria-label={t('pdf.write.color')}
        className="inline-flex items-center gap-1.5"
      >
        {PRESET_COLORS.map((color) => swatch(color, t(`pdf.write.colors.${color}`)))}
        {pen.recent.map((color) => swatch(color, color))}
        <label
          title={t('pdf.write.custom')}
          // Exempt from the bar's "keep the cursor in the box" rule: the system
          // colour dialog needs this control to take focus normally.
          onMouseDown={(event) => event.stopPropagation()}
          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/55 hover:text-primary"
        >
          <Pipette className="h-3 w-3" />
          <span className="sr-only">{t('pdf.write.custom')}</span>
          {/*
            ONE SWATCH PER PICK.

            The system colour dialog reports every shade the cursor passes over
            — as `input` AND as `change`, both of them many times per drag — so
            there is no event that means "this is the colour". What there is, is
            a PAUSE: the shades stop coming once the reader has settled. So the
            page follows every shade live, and the colour is only remembered
            once none has arrived for a moment, or the control is left.
          */}
          <input
            type="color"
            onChange={(event) => {
              const color = event.target.value;
              style({ color }, { remember: false });
              if (commitTimer.current) clearTimeout(commitTimer.current);
              commitTimer.current = setTimeout(
                () => style({ color }, { remember: true }),
                COMMIT_PAUSE_MS,
              );
            }}
            onBlur={(event) => {
              if (commitTimer.current) clearTimeout(commitTimer.current);
              style({ color: event.target.value }, { remember: true });
            }}
            className="sr-only"
          />
        </label>
      </div>

      {/* Bold is a property of TEXT; with a mark tool it would be a button that does nothing. */}
      {(pen.tool === 'text' || pen.active) && divider}

      {(pen.tool === 'text' || pen.active) && (
        <button
          type="button"
          onClick={() => style({ bold: !pen.bold })}
          aria-pressed={pen.bold}
          aria-label={t('pdf.write.bold')}
          title={`${t('pdf.write.bold')} (Ctrl/⌘ B)`}
          className={`${iconButton} ${pen.bold ? '!border-primary/55 !bg-primary/10 !text-primary' : ''}`}
        >
          <Bold className="h-4 w-4" />
        </button>
      )}

      {/* Optional paper under the answer, for writing over the book's print —
          off by default, because on an empty blank it would hide the dots. */}
      {(pen.tool === 'text' || pen.active) && (
        <button
          type="button"
          onClick={() => style({ background: !pen.background })}
          aria-pressed={pen.background}
          aria-label={t('pdf.write.background')}
          title={t('pdf.write.background')}
          className={`${iconButton} ${pen.background ? '!border-primary/55 !bg-primary/10 !text-primary' : ''}`}
        >
          <PaintBucket className="h-4 w-4" />
        </button>
      )}

      {selected && (
        <button
          type="button"
          onClick={() =>
            activeMark ? marks.remove(activeMark) : pen.active && store.remove(pen.active)
          }
          aria-label={activeMark ? t('pdf.write.delete') : t('pdf.write.deleteSelected')}
          title={activeMark ? t('pdf.write.delete') : t('pdf.write.deleteSelected')}
          className={`${iconButton} hover:text-error`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <span className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">{hint}</span>

      <button
        type="button"
        onClick={onDone}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
      >
        <Check className="h-4 w-4" />
        {t('pdf.write.done')}
      </button>
    </div>
  );
}
