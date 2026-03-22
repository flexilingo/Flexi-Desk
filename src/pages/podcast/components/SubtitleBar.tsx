import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import type { PodcastTranscriptSegment, PodcastWordTimestamp } from '../types';
import type { EnhancedWord, EnhancedSubtitle } from '../studio-types';
import { WordDialog } from './WordDialog';
import { QuickAddNoteDialog } from './QuickAddNoteDialog';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { usePlayerStore } from '../stores/playerStore';
import {
  useWordRangeSelection,
  SelectionActionBar,
  type WordRangeSelectionHandlers,
} from './SubtitleBarSelection';
import {
  detectCollocations,
  buildCollocationSet,
  getCollocationAt,
  type CollocationMatch,
} from '../utils/collocations';

// ============================================
// Word grouping (phrase/collocation/single)
// ============================================

interface WordGroup {
  type: 'single' | 'phrase' | 'collocation';
  words: EnhancedWord[];
  wordIndices: number[];
  groupId: string;
  phraseType?: string;
  phraseText?: string;
  phraseDefinition?: string;
  confidence?: number;
}

function groupWords(words: EnhancedWord[]): WordGroup[] {
  const groups: WordGroup[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < words.length; i++) {
    if (processed.has(i)) continue;
    const word = words[i];

    if (word.phraseId) {
      const phraseWordIndices: number[] = [];
      const phraseWords = words.filter((w, idx) => {
        if (w.phraseId === word.phraseId && !processed.has(idx)) {
          phraseWordIndices.push(idx);
          return true;
        }
        return false;
      });
      words.forEach((w, idx) => {
        if (w.phraseId === word.phraseId) processed.add(idx);
      });
      groups.push({
        type: 'phrase',
        words: phraseWords,
        wordIndices: phraseWordIndices,
        groupId: word.phraseId,
        phraseType: word.phraseType,
        phraseText: word.phraseText,
        phraseDefinition: word.phraseDefinition,
        confidence: word.confidence,
      });
    } else if (word.collocationId) {
      const collocationWordIndices: number[] = [];
      const collocationWords = words.filter((w, idx) => {
        if (w.collocationId === word.collocationId && !processed.has(idx)) {
          collocationWordIndices.push(idx);
          return true;
        }
        return false;
      });
      words.forEach((w, idx) => {
        if (w.collocationId === word.collocationId) processed.add(idx);
      });
      groups.push({
        type: 'collocation',
        words: collocationWords,
        wordIndices: collocationWordIndices,
        groupId: word.collocationId,
        phraseText: word.collocationText,
        confidence: word.collocationScore
          ? Math.min(100, Math.round(word.collocationScore * 10))
          : word.confidence,
      });
    } else {
      processed.add(i);
      groups.push({
        type: 'single',
        words: [word],
        wordIndices: [i],
        groupId: `single-${i}`,
      });
    }
  }
  return groups;
}

// ============================================
// CEFR helpers
// ============================================

function getCefrColor(cefr: string, isEstimated?: boolean): string {
  let base: string;
  switch (cefr) {
    case 'A1':
    case 'A2':
      base = '#22c55e';
      break;
    case 'B1':
    case 'B2':
      base = '#eab308';
      break;
    case 'C1':
    case 'C2':
      base = '#ef4444';
      break;
    default:
      return 'transparent';
  }
  return isEstimated ? `${base}99` : base;
}

function getCefrLabel(cefr: string): { label: string; labelFa: string } {
  const labels: Record<string, { label: string; labelFa: string }> = {
    A1: { label: 'Beginner', labelFa: 'مبتدی' },
    A2: { label: 'Elementary', labelFa: 'مقدماتی' },
    B1: { label: 'Intermediate', labelFa: 'متوسط' },
    B2: { label: 'Upper-Int', labelFa: 'بالای متوسط' },
    C1: { label: 'Advanced', labelFa: 'پیشرفته' },
    C2: { label: 'Proficiency', labelFa: 'حرفه‌ای' },
    phrase: { label: 'Phrase', labelFa: 'عبارت' },
  };
  return labels[cefr] ?? { label: cefr, labelFa: '' };
}

function getPhraseTypeLabel(phraseType?: string): { icon: string; label: string } {
  switch (phraseType) {
    case 'phrasal_verb':
      return { icon: '🔗', label: 'Phrasal Verb' };
    case 'idiom':
      return { icon: '💬', label: 'Idiom' };
    case 'collocation':
      return { icon: '🔤', label: 'Collocation' };
    case 'fixed_expression':
      return { icon: '📝', label: 'Expression' };
    default:
      return { icon: '📖', label: 'Phrase' };
  }
}

function getCefrTranslationKey(cefr: string): string {
  const keyMap: Record<string, string> = {
    A1: 'podcast.cefrBeginner',
    A2: 'podcast.cefrElementary',
    B1: 'podcast.cefrIntermediate',
    B2: 'podcast.cefrIntermediate',
    C1: 'podcast.cefrAdvanced',
    C2: 'podcast.cefrProficiency',
    phrase: 'podcast.cefrPhrase',
  };
  return keyMap[cefr] ?? cefr;
}

// Local CEFR cache
const cefrCache = new Map<string, string>();

// ============================================
// ClickableWord
// ============================================

interface ClickableWordProps {
  word: EnhancedWord;
  wordIndex: number;
  onClick: (word: EnhancedWord) => void;
  onAddToDeck?: (word: EnhancedWord) => void;
  showAddOnWords?: boolean;
  showEstimatedOnSubtitles?: boolean;
  fontSize?: number;
  onWordHover?: () => void;
  isSelected?: boolean;
  isSelecting?: boolean;
  selectionHandlers?: WordRangeSelectionHandlers;
  isActiveWord?: boolean;
  onPauseOnHover?: () => void;
  onResumeOnLeave?: () => void;
}

function ClickableWord({
  word,
  wordIndex,
  onClick,
  onAddToDeck,
  showAddOnWords = true,
  showEstimatedOnSubtitles = true,
  fontSize = 24,
  onWordHover,
  isSelected = false,
  isSelecting = false,
  selectionHandlers,
  isActiveWord = false,
  onPauseOnHover,
  onResumeOnLeave,
}: ClickableWordProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isHovered) timer = setTimeout(() => setShowTooltip(true), 300);
    else setShowTooltip(false);
    return () => clearTimeout(timer);
  }, [isHovered]);

  const isCollocation = !!word.collocationId;
  const isPhrase = !!word.isPartOfPhrase;
  const isPhrasalVerb = word.phraseType === 'phrasal_verb';

  const getBackgroundColor = (): string => {
    if (isSelected) return 'rgba(139, 183, 163, 0.3)';
    if (isActiveWord) return 'rgba(139, 183, 163, 0.25)';
    if (isHovered) return 'rgba(59, 87, 47, 0.3)';
    if (isPhrasalVerb) return 'rgba(147, 51, 234, 0.2)';
    if (isPhrase) return 'rgba(249, 115, 22, 0.15)';
    if (isCollocation) return 'rgba(249, 115, 22, 0.15)';
    return 'transparent';
  };

  const getOutline = (): string => {
    if (isPhrasalVerb) return '1px dashed rgba(147, 51, 234, 0.6)';
    if (isPhrase) return '1px dashed rgba(249, 115, 22, 0.5)';
    if (isCollocation) return '1px dashed rgba(249, 115, 22, 0.5)';
    return 'none';
  };

  const wordStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '4px 8px',
    margin: '2px',
    borderRadius: '6px',
    fontSize: `${fontSize}px`,
    fontWeight: isActiveWord ? 600 : 500,
    cursor: word.isClickable ? 'pointer' : 'default',
    borderBottom:
      word.cefr !== 'unknown'
        ? `3px solid ${getCefrColor(word.cefr, word.isEstimated)}`
        : '3px solid transparent',
    borderTop: '2px solid transparent',
    borderLeft: '2px solid transparent',
    borderRight: '2px solid transparent',
    backgroundColor: getBackgroundColor(),
    transition: 'all 0.15s ease',
    position: 'relative',
    outline: getOutline(),
    boxSizing: 'border-box',
    boxShadow: isSelected
      ? '0 0 0 2px rgba(139, 183, 163, 0.5)'
      : isActiveWord
        ? '0 0 8px rgba(139, 183, 163, 0.4)'
        : 'none',
    userSelect: isSelecting ? 'none' : 'auto',
    opacity: word.status === 'mastered' ? 0.7 : 1,
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToDeck?.(word);
  };

  const hasTooltipContent = word.cefr !== 'unknown' || !!word.phraseText || !!word.collocationText;

  return (
    <span
      style={wordStyle}
      data-word-index={wordIndex}
      onClick={() => word.isClickable && onClick(word)}
      onMouseDown={
        selectionHandlers ? (e) => selectionHandlers.onWordMouseDown(wordIndex, e) : undefined
      }
      onMouseEnter={() => {
        setIsHovered(true);
        onWordHover?.();
        onPauseOnHover?.();
        selectionHandlers?.onWordMouseEnter(wordIndex);
      }}
      onMouseUp={
        selectionHandlers ? (e) => selectionHandlers.onWordMouseUp(wordIndex, e) : undefined
      }
      onMouseLeave={() => {
        setIsHovered(false);
        onResumeOnLeave?.();
      }}
    >
      {word.text}
      {showEstimatedOnSubtitles && word.isEstimated && word.cefr !== 'unknown' && (
        <span
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-4px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#fbbf24',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          ?
        </span>
      )}
      {isHovered && !isSelecting && showAddOnWords && word.isClickable && (
        <button
          type="button"
          className="absolute -top-2.5 -left-2.5 w-5 h-5 p-0 border-0 rounded-full bg-blue-500 text-white text-sm font-bold flex items-center justify-center cursor-pointer shadow-md z-10"
          onClick={handleAddClick}
          onMouseEnter={() => setIsHovered(true)}
          title={t('podcast.addToDeck')}
        >
          +
        </button>
      )}
      {showTooltip && !isSelecting && hasTooltipContent && (
        <div className="absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 rounded-xl px-4 py-3 min-w-[180px] max-w-[280px] z-[1000] shadow-xl border border-border bg-card backdrop-blur-xl">
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rotate-45 w-3 h-3 border-r border-b border-border bg-card" />
          {word.phraseText && (
            <div className="mb-2.5 pb-2.5 border-b border-border">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span>{getPhraseTypeLabel(word.phraseType).icon}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                  {getPhraseTypeLabel(word.phraseType).label}
                </span>
              </div>
              <div className="text-[15px] font-medium text-foreground mb-1">
                &quot;{word.phraseText}&quot;
              </div>
              {word.phraseDefinition && (
                <div className="text-xs text-muted-foreground leading-snug">
                  {word.phraseDefinition}
                </div>
              )}
            </div>
          )}
          {word.cefr !== 'unknown' && (
            <div className="flex items-center gap-2.5">
              <span
                className="px-2.5 py-1 rounded-md text-[13px] font-bold text-primary-foreground shadow-sm"
                style={{ backgroundColor: getCefrColor(word.cefr, false) }}
              >
                {word.cefr}
              </span>
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-[13px] font-medium text-foreground">
                  {t(getCefrTranslationKey(word.cefr))}
                </span>
                <span className="text-[11px] text-muted-foreground font-[Vazirmatn]">
                  {getCefrLabel(word.cefr).labelFa}
                </span>
              </div>
              {word.confidence != null && word.confidence < 100 && (
                <span className="text-[11px] text-amber-400/90 bg-amber-400/15 px-2 py-0.5 rounded">
                  {word.confidence}%{word.isEstimated && ' estimated'}
                </span>
              )}
            </div>
          )}
          {word.collocationText && word.collocationText !== word.phraseText && (
            <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-white/10 text-xs text-white/80">
              <span className="opacity-70">🔤</span>
              <span>&quot;{word.collocationText}&quot;</span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ============================================
// PhraseGroup
// ============================================

interface PhraseGroupProps {
  group: WordGroup;
  onClick: (word: EnhancedWord) => void;
  onAddToDeck?: (word: EnhancedWord) => void;
  showAddOnWords?: boolean;
  fontSize?: number;
  onWordHover?: () => void;
  isWordSelected?: (wordIndex: number) => boolean;
  isSelecting?: boolean;
  selectionHandlers?: WordRangeSelectionHandlers;
  activeWordIndex?: number;
  onPauseOnHover?: () => void;
  onResumeOnLeave?: () => void;
}

function PhraseGroup({
  group,
  onClick,
  onAddToDeck,
  showAddOnWords = true,
  fontSize = 24,
  onWordHover,
  isWordSelected,
  isSelecting,
  selectionHandlers,
  activeWordIndex,
  onPauseOnHover,
  onResumeOnLeave,
}: PhraseGroupProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isHovered) timer = setTimeout(() => setShowTooltip(true), 300);
    else setShowTooltip(false);
    return () => clearTimeout(timer);
  }, [isHovered]);

  const primaryWord = group.words.find((w) => w.isClickable) || group.words[0];
  const phraseWord = useMemo<EnhancedWord>(
    () => ({
      ...primaryWord,
      text: group.words.map((w) => w.text).join(' '),
      cleanText: group.words.map((w) => w.cleanText).join(' '),
      phraseText: group.phraseText,
      phraseType: group.phraseType,
      phraseDefinition: group.phraseDefinition,
    }),
    [primaryWord, group.words, group.phraseText, group.phraseType, group.phraseDefinition],
  );

  const hasSelectedWord = isWordSelected && group.wordIndices.some((idx) => isWordSelected(idx));
  const isActiveGroup =
    activeWordIndex !== undefined && Math.max(...group.wordIndices) <= activeWordIndex;

  const isPhrasalVerb = group.phraseType === 'phrasal_verb';
  const isIdiom = group.phraseType === 'idiom';
  const isCollocation = group.type === 'collocation';

  const borderColor = isPhrasalVerb
    ? 'rgba(147, 51, 234, 0.6)'
    : isIdiom
      ? 'rgba(236, 72, 153, 0.6)'
      : isCollocation
        ? 'rgba(249, 115, 22, 0.5)'
        : 'rgba(59, 130, 246, 0.5)';

  const typeLabel = isPhrasalVerb
    ? 'Phrasal Verb'
    : isIdiom
      ? 'Idiom'
      : isCollocation
        ? 'Collocation'
        : group.phraseType === 'fixed_expression'
          ? 'Expression'
          : 'Phrase';

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToDeck?.(phraseWord);
  };

  return (
    <span
      className="inline-flex items-center gap-0 py-1 px-1.5 mx-0.5 rounded-lg font-medium cursor-pointer relative transition-all duration-150"
      style={{
        fontSize: `${fontSize}px`,
        borderTop: `2px dashed ${borderColor}`,
        borderLeft: `2px dashed ${borderColor}`,
        borderRight: `2px dashed ${borderColor}`,
        borderBottom: `3px dashed ${borderColor}`,
        backgroundColor: hasSelectedWord
          ? 'rgba(139, 183, 163, 0.3)'
          : isActiveGroup
            ? 'rgba(139, 183, 163, 0.2)'
            : isHovered
              ? 'rgba(59, 87, 47, 0.15)'
              : 'transparent',
        boxShadow: hasSelectedWord
          ? '0 0 0 2px rgba(139, 183, 163, 0.5)'
          : isActiveGroup
            ? '0 0 8px rgba(139, 183, 163, 0.4)'
            : 'none',
      }}
      onClick={() => onClick(phraseWord)}
      onMouseEnter={() => {
        setIsHovered(true);
        onWordHover?.();
        onPauseOnHover?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onResumeOnLeave?.();
      }}
    >
      {group.words.map((word, idx) => {
        const wordIdx = group.wordIndices[idx];
        return (
          <span
            key={idx}
            data-word-index={wordIdx}
            className={idx < group.words.length - 1 ? 'mr-0.5' : ''}
            onMouseDown={
              selectionHandlers ? (e) => selectionHandlers.onWordMouseDown(wordIdx, e) : undefined
            }
            onMouseEnter={
              selectionHandlers ? () => selectionHandlers.onWordMouseEnter(wordIdx) : undefined
            }
            onMouseUp={
              selectionHandlers ? (e) => selectionHandlers.onWordMouseUp(wordIdx, e) : undefined
            }
          >
            {word.text}
          </span>
        );
      })}
      {isHovered && !isSelecting && showAddOnWords && (
        <button
          type="button"
          className="absolute -top-2.5 -left-2.5 w-5 h-5 p-0 border-0 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center cursor-pointer z-10"
          onClick={handleAddClick}
          onMouseEnter={() => setIsHovered(true)}
          title="Add to Deck"
        >
          +
        </button>
      )}
      {showTooltip && !isSelecting && (
        <div className="absolute bottom-[calc(100%+16px)] left-1/2 -translate-x-1/2 rounded-2xl px-5 py-4 min-w-[200px] max-w-[320px] z-[1000] shadow-xl border border-border bg-card backdrop-blur-xl">
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rotate-45 w-4 h-4 border-r border-b border-border bg-card shadow-sm" />
          <div className="flex items-center gap-2 mb-2.5 pb-2.5 border-b border-border">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              {typeLabel}
            </span>
            {group.confidence != null && (
              <span className="text-[11px] font-medium text-success bg-success/15 px-2 py-0.5 rounded ml-auto">
                {group.confidence}%
              </span>
            )}
          </div>
          {group.phraseText && (
            <div className="text-[17px] font-semibold text-foreground mb-2 leading-snug">
              &quot;{group.phraseText}&quot;
            </div>
          )}
          {group.phraseDefinition && (
            <div
              className="text-[13px] text-muted-foreground leading-snug font-[Vazirmatn] text-right"
              dir="rtl"
            >
              {group.phraseDefinition}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ============================================
// SubtitleBar props and component
// ============================================

interface SubtitleBarProps {
  segments: PodcastTranscriptSegment[];
  currentTime: number;
  onSeek: (timeSeconds: number) => void;
  fontSize?: number;
  subtitleBgOpacity?: number;
  episodeId?: string;
  subtitlesEnabled?: boolean;
  sourceLang?: string;
  targetLang?: string;
  syncOffset?: number;
  autoPauseOnBoundary?: boolean;
  pauseOnHover?: boolean;
  subtitleAlignment?: 'left' | 'center' | 'right';
  showEstimatedOnSubtitles?: boolean;
  onAddToDeck?: (words: string[]) => void;
  onDialogOpenChange?: (open: boolean) => void;
}

const justifyMap = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const;

export function SubtitleBar({
  segments,
  currentTime,
  onSeek,
  fontSize = 24,
  subtitleBgOpacity = 75,
  episodeId,
  subtitlesEnabled = true,
  sourceLang = 'en',
  targetLang: targetLangProp,
  syncOffset = 0,
  autoPauseOnBoundary = false,
  pauseOnHover = false,
  subtitleAlignment = 'center',
  showEstimatedOnSubtitles = true,
  onAddToDeck,
  onDialogOpenChange,
}: SubtitleBarProps) {
  const { t } = useTranslation();
  const { nativeLang } = useLanguageSettings();
  const targetLang = targetLangProp || nativeLang;
  const containerRef = useRef<HTMLDivElement>(null);
  const effectiveTime = currentTime - syncOffset;
  const currentTimeMs = effectiveTime * 1000;

  // WordDialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [selectedPositionMs, setSelectedPositionMs] = useState<number | undefined>();

  // Note dialog state
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  // CEFR map for current segment words
  const [cefrMap, setCefrMap] = useState<Record<string, string>>({});

  // Hover-pause refs
  const hoverPausedRef = useRef(false);
  const lastSegmentIdRef = useRef<string | null>(null);

  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  // Find active segment
  const activeSegment = useMemo(() => {
    return (
      segments.find((seg) => currentTimeMs >= seg.startMs && currentTimeMs <= seg.endMs) ?? null
    );
  }, [segments, currentTimeMs]);

  // Find active word index
  const activeWordIndex = useMemo(() => {
    if (!activeSegment?.words?.length) return -1;
    return activeSegment.words.findIndex(
      (w) => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs,
    );
  }, [activeSegment, currentTimeMs]);

  // Raw words from segment
  const rawWords = useMemo(() => {
    if (!activeSegment) return [];
    if (activeSegment.words?.length) return activeSegment.words;
    return activeSegment.text.split(/\s+/).map(
      (word) =>
        ({
          word,
          startMs: activeSegment.startMs,
          endMs: activeSegment.endMs,
          confidence: 0,
        }) as PodcastWordTimestamp,
    );
  }, [activeSegment]);

  // Detect collocations
  const collocations = useMemo(() => {
    if (!rawWords.length) return [] as CollocationMatch[];
    return detectCollocations(rawWords.map((w) => w.word));
  }, [rawWords]);

  // Fetch CEFR levels
  useEffect(() => {
    if (!rawWords.length) return;

    const uncached = rawWords
      .map((w) => w.word.toLowerCase().replace(/[^a-z']/g, ''))
      .filter((w) => w.length > 1 && !cefrCache.has(w));

    if (uncached.length === 0) {
      const map: Record<string, string> = {};
      for (const w of rawWords) {
        const clean = w.word.toLowerCase().replace(/[^a-z']/g, '');
        if (clean.length > 1 && cefrCache.has(clean)) {
          map[clean] = cefrCache.get(clean)!;
        }
      }
      setCefrMap(map);
      return;
    }

    const unique = [...new Set(uncached)];
    invoke<[string, string][]>('podcast_get_words_cefr', { words: unique })
      .then((result) => {
        const map: Record<string, string> = {};
        for (const [w, cefr] of result) {
          cefrCache.set(w.toLowerCase(), cefr);
          map[w.toLowerCase()] = cefr;
        }
        for (const w of rawWords) {
          const clean = w.word.toLowerCase().replace(/[^a-z']/g, '');
          if (clean.length > 1 && cefrCache.has(clean)) {
            map[clean] = cefrCache.get(clean)!;
          }
        }
        setCefrMap(map);
      })
      .catch(() => {});
  }, [rawWords]);

  // Convert raw words to EnhancedWord[]
  const enhancedWords = useMemo<EnhancedWord[]>(() => {
    return rawWords.map((w, idx) => {
      const cleanWord = w.word.toLowerCase().replace(/[^a-z']/g, '');
      const cefr = cefrMap[cleanWord] || 'unknown';
      const collMatch = getCollocationAt(idx, collocations);

      return {
        text: w.word,
        cleanText: cleanWord,
        index: idx,
        cefr: cefr as EnhancedWord['cefr'],
        status: 'new' as const,
        isClickable: cleanWord.length > 1,
        collocationId: collMatch ? `coll-${collMatch.startIdx}` : undefined,
        collocationText: collMatch?.phrase,
        collocationScore: collMatch?.score,
      };
    });
  }, [rawWords, cefrMap, collocations]);

  // Build enhanced subtitle for selection hook
  const enhancedSubtitle = useMemo<EnhancedSubtitle | null>(() => {
    if (!activeSegment) return null;
    return {
      id: activeSegment.id,
      text: activeSegment.text,
      startTime: activeSegment.startMs / 1000,
      endTime: activeSegment.endMs / 1000,
      words: enhancedWords,
      difficulty: 0,
      isProcessed: true,
      activeWordIndex,
    };
  }, [activeSegment, enhancedWords, activeWordIndex]);

  // Word range selection
  const selection = useWordRangeSelection(
    enhancedWords,
    activeSegment?.id,
    undefined,
    undefined,
    containerRef,
  );

  // Word groups
  const wordGroups = useMemo(() => {
    if (!enhancedWords.length) return [];
    return groupWords(enhancedWords);
  }, [enhancedWords]);

  // Auto-pause on subtitle boundary
  useEffect(() => {
    if (!autoPauseOnBoundary || !activeSegment) return;
    if (lastSegmentIdRef.current && lastSegmentIdRef.current !== activeSegment.id) {
      pause();
    }
    lastSegmentIdRef.current = activeSegment.id;
  }, [activeSegment?.id, autoPauseOnBoundary, pause]);

  useEffect(() => {
    if (!autoPauseOnBoundary) {
      lastSegmentIdRef.current = null;
    }
  }, [autoPauseOnBoundary]);

  // Hover pause handlers
  const handlePauseOnHover = useCallback(() => {
    if (pauseOnHover && isPlaying) {
      pause();
      hoverPausedRef.current = true;
    }
  }, [pauseOnHover, isPlaying, pause]);

  const handleResumeOnLeave = useCallback(() => {
    if (hoverPausedRef.current) {
      resume();
      hoverPausedRef.current = false;
    }
  }, [resume]);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setDialogOpen(open);
      onDialogOpenChange?.(open);
    },
    [onDialogOpenChange],
  );

  const handleWordClick = useCallback(
    (word: EnhancedWord) => {
      if (selection.isDragging || selection.isSelectionActive) return;
      setSelectedWord(word.text);
      setSelectedPositionMs(rawWords[word.index]?.startMs);
      handleDialogOpenChange(true);
    },
    [selection.isDragging, selection.isSelectionActive, rawWords, handleDialogOpenChange],
  );

  const handleAddToDeckWord = useCallback(
    (word: EnhancedWord) => {
      onAddToDeck?.([word.cleanText || word.text]);
    },
    [onAddToDeck],
  );

  // Translate: open WordDialog with selected text
  const handleTranslateSelection = useCallback(
    (text: string) => {
      setDialogSentenceContext(activeSegment?.text);
      setSelectedWord(text);
      setSelectedPositionMs(Math.round(currentTime * 1000));
      handleDialogOpenChange(true);
    },
    [activeSegment?.text, currentTime, handleDialogOpenChange],
  );

  // Note: open QuickAddNoteDialog with selected text
  const handleNoteSelection = useCallback(
    (text: string, _time: number) => {
      setNoteText(text);
      setNoteDialogOpen(true);
    },
    [],
  );

  // Store sentence context for dialog (persists even when segment changes)
  const [dialogSentenceContext, setDialogSentenceContext] = useState<string | undefined>();

  // Update sentence context when opening dialog
  const handleWordClickWrapped = useCallback(
    (word: EnhancedWord) => {
      setDialogSentenceContext(activeSegment?.text);
      handleWordClick(word);
    },
    [handleWordClick, activeSegment?.text],
  );

  if (!subtitlesEnabled) {
    return (
      <WordDialog
        word={selectedWord}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        episodeId={episodeId}
        positionMs={selectedPositionMs}
        sourceLang={sourceLang}
        targetLang={targetLang}
        sentenceContext={dialogSentenceContext}
      />
    );
  }

  // Waiting state
  if (!activeSegment) {
    return (
      <>
        {segments.length > 0 && currentTime < segments[0].startMs / 1000 && (
          <div
            className="text-center text-base md:text-lg py-4 md:py-6 px-4 md:px-8"
            style={{
              backgroundColor: `hsl(var(--color-card) / ${subtitleBgOpacity / 100})`,
            }}
          >
            <span className="text-muted-foreground">{t('podcast.waitingForSubtitle')}</span>
          </div>
        )}
        <WordDialog
          word={selectedWord}
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          episodeId={episodeId}
          positionMs={selectedPositionMs}
          sourceLang={sourceLang}
          targetLang={targetLang}
          sentenceContext={dialogSentenceContext}
        />
      </>
    );
  }

  const justify = justifyMap[subtitleAlignment];

  return (
    <>
      <div
        className="flex flex-col items-center gap-2 md:gap-3 max-w-full relative px-4 py-3 pb-4 md:px-6 md:py-4 md:pb-5 select-none"
        style={{
          backgroundColor: `hsl(var(--color-card) / ${subtitleBgOpacity / 100})`,
        }}
        ref={containerRef}
        onMouseLeave={() => {
          handleResumeOnLeave();
        }}
      >
        {selection.isSelectionActive && enhancedSubtitle?.words && (
          <SelectionActionBar
            selectedText={selection.selectedText}
            words={enhancedSubtitle.words}
            selectedIndices={selection.selectedIndices}
            onClear={selection.clearSelection}
            containerRef={containerRef}
            onAddToDeck={handleAddToDeckWord}
            onTranslate={handleTranslateSelection}
            onAddNote={handleNoteSelection}
            onPauseForDialog={pause}
            onResumeAfterDialog={resume}
            currentTime={currentTime}
          />
        )}

        <div
          className="flex flex-wrap items-center gap-1 leading-relaxed w-full"
          style={{
            fontSize: `${fontSize}px`,
            justifyContent: justify,
          }}
        >
          {wordGroups.map((group) =>
            group.type === 'single' ? (
              <ClickableWord
                key={group.groupId}
                word={group.words[0]}
                wordIndex={group.wordIndices[0]}
                onClick={handleWordClickWrapped}
                onAddToDeck={handleAddToDeckWord}
                showAddOnWords={true}
                showEstimatedOnSubtitles={showEstimatedOnSubtitles}
                fontSize={fontSize}
                isSelected={selection.isWordSelected(group.wordIndices[0])}
                isSelecting={selection.selectionState.isSelecting}
                selectionHandlers={selection.handlers}
                isActiveWord={activeWordIndex >= 0 && activeWordIndex >= group.wordIndices[0]}
                onPauseOnHover={handlePauseOnHover}
                onResumeOnLeave={handleResumeOnLeave}
              />
            ) : (
              <PhraseGroup
                key={group.groupId}
                group={group}
                onClick={handleWordClickWrapped}
                onAddToDeck={handleAddToDeckWord}
                showAddOnWords={true}
                fontSize={fontSize}
                isWordSelected={selection.isWordSelected}
                isSelecting={selection.selectionState.isSelecting}
                selectionHandlers={selection.handlers}
                activeWordIndex={activeWordIndex >= 0 ? activeWordIndex : undefined}
                onPauseOnHover={handlePauseOnHover}
                onResumeOnLeave={handleResumeOnLeave}
              />
            ),
          )}
        </div>
      </div>

      <WordDialog
        word={selectedWord}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        episodeId={episodeId}
        positionMs={selectedPositionMs}
        sourceLang={sourceLang}
        targetLang={targetLang}
        sentenceContext={dialogSentenceContext}
      />

      {episodeId && (
        <QuickAddNoteDialog
          open={noteDialogOpen}
          onClose={() => {
            setNoteDialogOpen(false);
            resume();
          }}
          episodeId={episodeId}
          currentTime={Math.round(currentTime * 1000)}
          subtitleText={noteText || activeSegment?.text}
        />
      )}
    </>
  );
}
