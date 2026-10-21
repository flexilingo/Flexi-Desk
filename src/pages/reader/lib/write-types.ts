import type { ReaderMarkKind } from '../types';

/**
 * The shapes the page view needs from the write-mode stores.
 *
 * PHASE E: `text-box-store.ts` and `mark-store.ts` are ported (with their local
 * data layer) and these declarations are replaced by the real classes of the same
 * names. Until then nothing constructs a store, so the viewer passes none and
 * write mode stays inert — only the types exist, so the page view keeps its
 * write-mode code paths exactly as on the website.
 */

export type TextColor = string;

export interface TextBox {
  /** Stable for the box's whole life — including before the store has given it an id. */
  key: string;
  page: number;
  body: string;
  /** Top-left corner and width, as percentages of the page box. */
  x: number;
  y: number;
  w: number;
  /** Text size as a percentage of the page's width, so it scales with the page. */
  size: number;
  color: TextColor;
  bold: boolean;
  /** Drawn on white, so the book's print does not show through the answer. */
  background: boolean;
  /** Just placed by the reader, so it should take the cursor. */
  fresh: boolean;
  /** The last save did not reach the store. Shown on the box, with a retry. */
  failed: boolean;
}

/** Where a new box goes. Its size comes from the blank it sits on, or from the pen. */
export type TextBoxShape = Pick<TextBox, 'x' | 'y' | 'w'> & { size?: number };

/** What a click or drag on the page makes: a text box, or one of the marks. */
export type WriteTool = 'text' | ReaderMarkKind;

export interface PenState {
  tool: WriteTool;
  size: number;
  color: TextColor;
  bold: boolean;
  background: boolean;
  /** The box the bar's changes apply to. */
  active: string | null;
  recent: TextColor[];
}

/** The part of the text-box store the page view uses. */
export interface TextBoxStore {
  subscribe(page: number, listener: () => void): () => void;
  snapshot(page: number): TextBox[];
  subscribePen(listener: () => void): () => void;
  penSnapshot(): PenState;
  setActive(key: string | null): void;
  create(page: number, shape: TextBoxShape): string;
}

/** The part of the mark store the page view uses. */
export interface MarkStore {
  activeSnapshot(): string | null;
  setActive(key: string | null): void;
}
