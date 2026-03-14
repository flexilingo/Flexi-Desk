import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
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
  currentTime?: number;
}

export function SelectionActionBar({
  selectedText,
  words,
  selectedIndices,
  onClear,
  onPauseForDialog,
  onTranslate,
  onAskLena,
  onAddToDeck,
  onAddNote,
  currentTime = 0,
}: SelectionActionBarProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = selectedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
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

  return (
    <div
      className="absolute flex items-center gap-2 px-3 py-2 bg-slate-700 border border-white/10 rounded-xl shadow-lg z-[100] whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={{
        bottom: 'calc(100% + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-sm font-medium text-slate-200 max-w-[200px] truncate px-2 py-1 bg-slate-600 rounded-lg">
        &quot;{displayText}&quot;
      </span>
      <div className="w-px h-5 bg-white/10" />
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium border-0 cursor-pointer hover:bg-emerald-700 transition-colors duration-150"
        onClick={handleAddToDeck}
      >
        <span className="text-base">+</span>
        {t('podcast.addToDeck')}
      </button>
      <button
        type="button"
        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-600 text-slate-300 rounded-lg text-sm border-0 cursor-pointer hover:bg-slate-500 transition-colors duration-150"
        onClick={handleTranslate}
      >
        {t('podcast.translate')}
      </button>
      <button
        type="button"
        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-600 text-slate-300 rounded-lg text-sm border-0 cursor-pointer hover:bg-slate-500 transition-colors duration-150"
        onClick={handleNote}
      >
        {t('podcast.note')}
      </button>
      <button
        type="button"
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm border-0 cursor-pointer transition-colors duration-150 ${
          copied ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
        }`}
        onClick={handleCopy}
      >
        {copied ? t('podcast.copied') : t('podcast.copy')}
      </button>
      {onAskLena && (
        <>
          <div className="w-px h-5 bg-white/10" />
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8BB7A3]/20 text-[#8BB7A3] hover:bg-[#8BB7A3]/30 rounded-lg text-sm font-medium border-0 cursor-pointer transition-colors duration-150"
            onClick={handleAskLena}
          >
            <MessageCircle size={14} />
            {t('podcast.askLena')}
          </button>
        </>
      )}
      <button
        type="button"
        className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-600 text-slate-400 hover:bg-slate-500 hover:text-slate-200 border-0 cursor-pointer transition-colors duration-150 text-xs"
        onClick={() => onClear()}
      >
        ✕
      </button>
      <div
        className="absolute bg-slate-700 border-r border-b border-white/10"
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
}
