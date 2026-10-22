import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from 'lucide-react';
import type { EnhancedWord } from '../studio-types';

// ============================================
// Selection state types
// ============================================

export interface SelectionState {
  isSelecting: boolean;
  startIndex: number | null;
  endIndex: number | null;
}

export interface WordRangeSelectionHandlers {
  onWordMouseDown: (wordIndex: number, e: React.MouseEvent) => void;
  onWordMouseEnter: (wordIndex: number) => void;
  onWordMouseUp: (wordIndex: number, e: React.MouseEvent) => void;
}

export interface UseWordRangeSelectionReturn {
  selectionState: SelectionState;
  handlers: WordRangeSelectionHandlers;
  clearSelection: () => void;
  selectedText: string;
  selectedIndices: Set<number>;
  isWordSelected: (wordIndex: number) => boolean;
  isSelectionActive: boolean;
  isDragging: boolean;
}

// ============================================
// Native selection helpers
// ============================================

function getWordIndicesFromRange(range: Range, container: HTMLElement): number[] {
  const indices: number[] = [];
  const wordSpans = container.querySelectorAll('[data-word-index]');
  for (const span of wordSpans) {
    if (range.intersectsNode(span)) {
      const indexStr = (span as HTMLElement).dataset.wordIndex;
      if (indexStr !== undefined) {
        const index = parseInt(indexStr, 10);
        if (!isNaN(index)) indices.push(index);
      }
    }
  }
  return indices;
}

function useNativeSelectionDetection({
  containerRef,
  isCustomDragActive,
  isSelectionActive,
  onNativeSelection,
  onPauseForDialog,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isCustomDragActive: boolean;
  isSelectionActive: boolean;
  onNativeSelection: (startIndex: number, endIndex: number) => void;
  onPauseForDialog?: () => void;
}): void {
  useEffect(() => {
    const handleMouseUp = () => {
      if (isCustomDragActive || isSelectionActive) return;
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const container = containerRef.current;
        if (!container) return;
        if (!container.contains(range.startContainer) && !container.contains(range.endContainer))
          return;
        const wordIndices = getWordIndicesFromRange(range, container);
        if (wordIndices.length < 2) return;
        const minIndex = Math.min(...wordIndices);
        const maxIndex = Math.max(...wordIndices);
        selection.removeAllRanges();
        onPauseForDialog?.();
        onNativeSelection(minIndex, maxIndex);
      }, 10);
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [containerRef, isCustomDragActive, isSelectionActive, onNativeSelection, onPauseForDialog]);
}

// ============================================
// useWordRangeSelection hook
// ============================================

export function useWordRangeSelection(
  words: EnhancedWord[],
  subtitleId: string | undefined,
  onPauseForDialog?: () => void,
  onResumeAfterDialog?: () => void,
  containerRef?: React.RefObject<HTMLDivElement | null>,
): UseWordRangeSelectionReturn {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    isSelecting: false,
    startIndex: null,
    endIndex: null,
  });
  const [confirmedSelection, setConfirmedSelection] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);

  const mouseDownIndexRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const pausedForDragRef = useRef(false);

  const prevSubtitleIdRef = useRef(subtitleId);
  useEffect(() => {
    if (prevSubtitleIdRef.current !== subtitleId) {
      prevSubtitleIdRef.current = subtitleId;
      setSelectionState({ isSelecting: false, startIndex: null, endIndex: null });
      setConfirmedSelection(null);
      hasDraggedRef.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);
      mouseDownIndexRef.current = null;
      window.getSelection()?.removeAllRanges();
      if (pausedForDragRef.current) {
        pausedForDragRef.current = false;
        onResumeAfterDialog?.();
      }
    }
  }, [subtitleId, onResumeAfterDialog]);

  const clearSelection = useCallback(
    (skipResume?: boolean) => {
      setSelectionState({ isSelecting: false, startIndex: null, endIndex: null });
      setConfirmedSelection(null);
      hasDraggedRef.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);
      mouseDownIndexRef.current = null;
      window.getSelection()?.removeAllRanges();
      if (pausedForDragRef.current) {
        pausedForDragRef.current = false;
        if (!skipResume) {
          onResumeAfterDialog?.();
        }
      }
    },
    [onResumeAfterDialog],
  );

  const onWordMouseDown = useCallback((wordIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setConfirmedSelection(null);
    mouseDownIndexRef.current = wordIndex;
    hasDraggedRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
    setSelectionState({
      isSelecting: true,
      startIndex: wordIndex,
      endIndex: wordIndex,
    });
  }, []);

  const onWordMouseEnter = useCallback(
    (wordIndex: number) => {
      if (mouseDownIndexRef.current === null) return;
      if (!selectionState.isSelecting) return;
      if (wordIndex !== mouseDownIndexRef.current) {
        if (!hasDraggedRef.current) {
          onPauseForDialog?.();
          pausedForDragRef.current = true;
        }
        hasDraggedRef.current = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      setSelectionState((prev) => ({ ...prev, endIndex: wordIndex }));
    },
    [selectionState.isSelecting, onPauseForDialog],
  );

  const onWordMouseUp = useCallback((wordIndex: number) => {
    if (mouseDownIndexRef.current === null) return;
    const startIdx = mouseDownIndexRef.current;
    const didDrag = hasDraggedRef.current;
    if (didDrag && startIdx !== wordIndex) {
      const minIdx = Math.min(startIdx, wordIndex);
      const maxIdx = Math.max(startIdx, wordIndex);
      setConfirmedSelection({ startIndex: minIdx, endIndex: maxIdx });
      setSelectionState({ isSelecting: false, startIndex: null, endIndex: null });
    } else {
      setSelectionState({ isSelecting: false, startIndex: null, endIndex: null });
    }
    setTimeout(() => {
      isDraggingRef.current = false;
      setIsDragging(false);
    }, 50);
    mouseDownIndexRef.current = null;
    hasDraggedRef.current = false;
  }, []);

  const selectedIndices = useMemo(() => {
    const indices = new Set<number>();
    if (
      selectionState.isSelecting &&
      selectionState.startIndex !== null &&
      selectionState.endIndex !== null
    ) {
      const min = Math.min(selectionState.startIndex, selectionState.endIndex);
      const max = Math.max(selectionState.startIndex, selectionState.endIndex);
      for (let i = min; i <= max; i++) indices.add(i);
    } else if (confirmedSelection) {
      for (let i = confirmedSelection.startIndex; i <= confirmedSelection.endIndex; i++)
        indices.add(i);
    }
    return indices;
  }, [selectionState, confirmedSelection]);

  const isWordSelected = useCallback(
    (wordIndex: number) => selectedIndices.has(wordIndex),
    [selectedIndices],
  );

  const selectedText = useMemo(() => {
    if (selectedIndices.size === 0) return '';
    const sorted = Array.from(selectedIndices).sort((a, b) => a - b);
    return sorted.map((i) => words[i]?.text || '').join(' ');
  }, [selectedIndices, words]);

  const isSelectionActive = confirmedSelection !== null;

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (mouseDownIndexRef.current !== null && selectionState.isSelecting) {
        if (
          hasDraggedRef.current &&
          selectionState.startIndex !== null &&
          selectionState.endIndex !== null
        ) {
          const minIdx = Math.min(selectionState.startIndex, selectionState.endIndex);
          const maxIdx = Math.max(selectionState.startIndex, selectionState.endIndex);
          if (minIdx !== maxIdx) {
            setConfirmedSelection({ startIndex: minIdx, endIndex: maxIdx });
          }
        }
        setSelectionState({
          isSelecting: false,
          startIndex: null,
          endIndex: null,
        });
        mouseDownIndexRef.current = null;
        hasDraggedRef.current = false;
        setTimeout(() => {
          isDraggingRef.current = false;
          setIsDragging(false);
        }, 50);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [selectionState]);

  useEffect(() => {
    if (!isSelectionActive) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        clearSelection();
      }
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isSelectionActive, clearSelection]);

  const handleNativeSelection = useCallback((startIndex: number, endIndex: number) => {
    setConfirmedSelection({ startIndex, endIndex });
    pausedForDragRef.current = true;
  }, []);

  useNativeSelectionDetection({
    containerRef: containerRef || { current: null },
    isCustomDragActive: selectionState.isSelecting,
    isSelectionActive,
    onNativeSelection: handleNativeSelection,
    onPauseForDialog,
  });

  return {
    selectionState,
    handlers: { onWordMouseDown, onWordMouseEnter, onWordMouseUp },
    clearSelection,
    selectedText,
    selectedIndices,
    isWordSelected,
    isSelectionActive,
    isDragging,
  };
}

// ============================================
// SelectionActionBar component
// ============================================

interface SelectionActionBarProps {
  selectedText: string;
  words: EnhancedWord[];
  selectedIndices: Set<number>;
  onClear: (skipResume?: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPauseForDialog?: () => void;
  onResumeAfterDialog?: () => void;
  onTranslate?: (text: string) => void;
  onAskLena?: (selectedText: string) => void;
  onAddToDeck?: (word: EnhancedWord) => void;
  onAddNote?: (text: string, time: number) => void;
  /** No podcast note for this text (a book track has no episode to pin it to). */
  hideNote?: boolean;
  currentTime?: number;
  /**
   * Drawn on the page, over the line, rather than inside it (website: the now-playing reading zone
   * scrolls and clips, and a bar inside it was cut off).
   */
  floating?: boolean;
  /** The element a floating bar sits above when it is not the container (a selection that starts on a line above). */
  anchor?: () => HTMLElement | null;
}

/** The website's selection bar: the chosen words, Add to Deck, Translate, Note, Copy (and Ask Lena where offered). */
export function SelectionActionBar({
  selectedText,
  words,
  selectedIndices,
  onClear,
  containerRef,
  onPauseForDialog,
  onTranslate,
  onAskLena,
  onAddToDeck,
  onAddNote,
  hideNote = false,
  currentTime = 0,
  floating = false,
  anchor: anchorElement,
}: SelectionActionBarProps) {
  const { t } = useTranslation();
  const { t: tp } = useTranslation('podcastUi');
  const [copied, setCopied] = useState(false);
  // Where the floating bar sits: centred over the line, 12px above it.
  const [anchor, setAnchor] = useState<{ bottom: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!floating) return;
    const place = () => {
      const el = anchorElement?.() ?? containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ bottom: window.innerHeight - r.top + 12, left: r.left + r.width / 2 });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [floating, containerRef, anchorElement]);

  const syntheticWord = useMemo<EnhancedWord>(() => {
    const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
    const firstWord = words[sortedIndices[0]] || ({} as EnhancedWord);
    const cleanText = sortedIndices
      .map((i) => words[i]?.cleanText || words[i]?.text || '')
      .join(' ');
    return {
      ...firstWord,
      text: selectedText,
      cleanText,
      phraseText: selectedText,
      phraseType: undefined,
      phraseDefinition: undefined,
    };
  }, [selectedText, words, selectedIndices]);

  const handleAddToDeck = useCallback(() => {
    onPauseForDialog?.();
    onAddToDeck?.(syntheticWord);
  }, [onPauseForDialog, onAddToDeck, syntheticWord]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = selectedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selectedText]);

  const handleAskLena = useCallback(() => {
    onAskLena?.(selectedText);
    onClear(true);
  }, [onAskLena, selectedText, onClear]);

  const handleNote = useCallback(() => {
    onPauseForDialog?.();
    onAddNote?.(selectedText, currentTime);
  }, [onPauseForDialog, onAddNote, selectedText, currentTime]);

  const handleTranslate = useCallback(() => {
    onPauseForDialog?.();
    if (onTranslate) {
      onTranslate(selectedText);
      onClear();
    }
  }, [selectedText, onPauseForDialog, onClear, onTranslate]);

  const displayText = selectedText.length > 40 ? selectedText.slice(0, 37) + '...' : selectedText;
  const quiet =
    'inline-flex items-center gap-1 rounded-[7px] border border-transparent px-2.5 py-1.5 text-sm text-primary-light transition-colors duration-150 hover:bg-muted hover:text-foreground';

  const bar = (
    <div
      data-selection-bar=""
      className={`${floating ? 'relative animate-in fade-in duration-100' : 'absolute z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150'} flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-2 text-foreground shadow-md`}
      style={
        floating
          ? undefined
          : { bottom: 'calc(100% + 12px)', left: '50%', transform: 'translateX(-50%)' }
      }
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="max-w-[200px] truncate rounded-[7px] border border-border bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
        &quot;{displayText}&quot;
      </span>
      <div className="h-5 w-px bg-border" />
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-[7px] border border-transparent bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent/90"
        onClick={handleAddToDeck}
      >
        <span className="text-base leading-none">+</span>
        {t('podcast.addToDeck')}
      </button>
      <button type="button" className={quiet} onClick={handleTranslate}>
        {t('podcast.translate')}
      </button>
      {!hideNote && (
        <button type="button" className={quiet} onClick={handleNote}>
          {t('podcast.note')}
        </button>
      )}
      <button
        type="button"
        className={
          copied
            ? 'inline-flex items-center gap-1 rounded-[7px] border border-success/30 bg-success/10 px-2.5 py-1.5 text-sm text-success transition-colors duration-150'
            : quiet
        }
        onClick={handleCopy}
      >
        {copied ? t('podcast.copied') : t('podcast.copy')}
      </button>
      {onAskLena && (
        <>
          <div className="h-5 w-px bg-border" />
          <button type="button" className={`${quiet} font-medium`} onClick={handleAskLena}>
            <MessageCircle size={14} />
            {t('podcast.askLena')}
          </button>
        </>
      )}
      <button
        type="button"
        aria-label={tp('subtitle.clearSelection')}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-caption transition-colors duration-150 hover:bg-muted hover:text-foreground"
        onClick={() => onClear()}
      >
        <X className="h-3 w-3" />
      </button>
      <div
        className="absolute border-b border-r border-border bg-card"
        style={{
          bottom: '-5px',
          left: '50%',
          transform: 'translateX(-50%) rotate(45deg)',
          width: 10,
          height: 10,
        }}
      />
    </div>
  );

  // Floating: nothing until its place is measured, so it never shows somewhere else first and jumps.
  if (!floating) return bar;
  if (!anchor) return null;
  return createPortal(
    <div
      className="fixed z-[10010]"
      style={{ bottom: anchor.bottom, left: anchor.left, transform: 'translateX(-50%)' }}
    >
      {bar}
    </div>,
    document.body,
  );
}
