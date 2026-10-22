import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { MousePointerClick, X } from 'lucide-react';
import type { PodcastTranscriptSegment, PodcastWordTimestamp } from '../types';
import type { EnhancedWord } from '../studio-types';
import { WordDialog } from '@/components/WordDialog';
import { QuickAddNoteDialog } from './QuickAddNoteDialog';
import { cleanWord, cefrCacheKey } from '../utils/words';
import { usePlayerStore } from '../stores/playerStore';
import {
  useWordRangeSelection,
  SelectionActionBar,
  type WordRangeSelectionHandlers,
} from './SubtitleBarSelection';
import { detectCollocations, getCollocationAt, type CollocationMatch } from '../utils/collocations';
import { cn } from '@/lib/utils';

/**
 * The reading zone of the now-playing player (website: `SubtitleStack` + `SubtitleContent`).
 *
 * The line being spoken sits in a soft rounded box at the size the reader chose; the lines around
 * it fade with distance (as many as fit, or the reader's "lines before and after" setting). A tap
 * on a word opens it, a tap on a line around it jumps there, and one drag selects across every line
 * on screen. There is deliberately no full-transcript view.
 */

/** Never shrink the spoken line below this. */
const FONT_SIZE_MIN = 13;
const CONTEXT_OPACITY: Record<number, number> = { 0: 1, 1: 0.3, 2: 0.14, 3: 0.06 };
const CONTEXT_SCALE: Record<number, number> = { 0: 1, 1: 0.6, 2: 0.52, 3: 0.46 };
const ROOMY_OPACITY: Record<number, number> = { 0: 1, 1: 0.5, 2: 0.38, 3: 0.28, 4: 0.2, 5: 0.13 };
const ROOMY_SCALE: Record<number, number> = { 0: 1, 1: 0.64, 2: 0.6, 3: 0.57, 4: 0.54, 5: 0.52 };
const RATIO_FOR_CONTEXT: Record<number, number> = { 0: 0.95, 1: 0.7, 2: 0.6, 3: 0.55 };

function budgetForZone(zoneHeight: number, isNarrow: boolean, roomy: boolean) {
  if (zoneHeight < 150) return { context: 0, activeRatio: 0.95 };
  if (roomy && !isNarrow) {
    if (zoneHeight >= 640) return { context: 5, activeRatio: 0.34 };
    if (zoneHeight >= 480) return { context: 4, activeRatio: 0.4 };
  }
  if (isNarrow) return { context: 1, activeRatio: 0.82 };
  if (zoneHeight < 230) return { context: 1, activeRatio: 0.7 };
  if (zoneHeight < 340) return { context: 2, activeRatio: 0.6 };
  return { context: 3, activeRatio: 0.55 };
}

/** The line the reader is on: the one playing, or in a gap the one that just finished. */
export function displayIndexAt(segments: PodcastTranscriptSegment[], timeMs: number): number {
  let last = -1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (timeMs >= seg.startMs && timeMs <= seg.endMs) return i;
    if (seg.endMs <= timeMs) last = i;
    else break;
  }
  return last;
}

// ── CEFR + phrase marks (website colours, as classes) ─────────────────────────

const CEFR_UNDERLINE: Record<string, string> = {
  A1: 'border-b-cefr-a1',
  A2: 'border-b-cefr-a2',
  B1: 'border-b-cefr-b1',
  B2: 'border-b-cefr-b2',
  C1: 'border-b-cefr-c1',
  C2: 'border-b-cefr-c2',
};
const CEFR_UNDERLINE_ESTIMATED: Record<string, string> = {
  A1: 'border-b-cefr-a1/55',
  A2: 'border-b-cefr-a2/55',
  B1: 'border-b-cefr-b1/55',
  B2: 'border-b-cefr-b2/55',
  C1: 'border-b-cefr-c1/55',
  C2: 'border-b-cefr-c2/55',
};

// Local CEFR cache, per language.
const cefrCache = new Map<string, string>();

interface WordGroup {
  type: 'single' | 'phrase' | 'collocation';
  words: EnhancedWord[];
  wordIndices: number[];
  groupId: string;
  phraseType?: string;
  phraseText?: string;
  phraseDefinition?: string;
}

function groupWords(words: EnhancedWord[]): WordGroup[] {
  const groups: WordGroup[] = [];
  const processed = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    if (processed.has(i)) continue;
    const word = words[i];
    const key = word.phraseId ?? word.collocationId;
    if (key) {
      const indices: number[] = [];
      const members = words.filter((w, idx) => {
        const same = (w.phraseId ?? w.collocationId) === key && !processed.has(idx);
        if (same) indices.push(idx);
        return same;
      });
      indices.forEach((idx) => processed.add(idx));
      groups.push({
        type: word.phraseId ? 'phrase' : 'collocation',
        words: members,
        wordIndices: indices,
        groupId: key,
        phraseType: word.phraseType,
        phraseText: word.phraseText ?? word.collocationText,
        phraseDefinition: word.phraseDefinition,
      });
    } else {
      processed.add(i);
      groups.push({ type: 'single', words: [word], wordIndices: [i], groupId: `single-${i}` });
    }
  }
  return groups;
}

function ClickableWord({
  word,
  wordIndex,
  onClick,
  fontSize,
  isSelected,
  isSelecting,
  selectionHandlers,
  isActiveWord,
  onPauseOnHover,
  onResumeOnLeave,
}: {
  word: EnhancedWord;
  wordIndex: number;
  onClick: (word: EnhancedWord) => void;
  fontSize: number;
  isSelected: boolean;
  isSelecting: boolean;
  selectionHandlers: WordRangeSelectionHandlers;
  isActiveWord: boolean;
  onPauseOnHover?: () => void;
  onResumeOnLeave?: () => void;
}) {
  const isPhrasalVerb = word.phraseType === 'phrasal_verb';
  const isPhrase = !!word.isPartOfPhrase;
  const isCollocation = !!word.collocationId;
  const underline =
    word.cefr !== 'unknown' && word.cefr !== 'phrase'
      ? ((word.isEstimated ? CEFR_UNDERLINE_ESTIMATED : CEFR_UNDERLINE)[word.cefr] ??
        'border-b-transparent')
      : 'border-b-transparent';
  return (
    <span
      data-word-index={wordIndex}
      style={{ fontSize: `${fontSize}px` }}
      onClick={() => word.isClickable && onClick(word)}
      onMouseDown={(e) => selectionHandlers.onWordMouseDown(wordIndex, e)}
      onMouseEnter={() => {
        onPauseOnHover?.();
        selectionHandlers.onWordMouseEnter(wordIndex);
      }}
      onMouseUp={(e) => selectionHandlers.onWordMouseUp(wordIndex, e)}
      onMouseLeave={() => onResumeOnLeave?.()}
      className={cn(
        'relative m-px inline-block rounded-[6px] border-x-2 border-b-[3px] border-t-2 border-x-transparent border-t-transparent px-1 py-px transition-all duration-150',
        underline,
        word.isClickable ? 'cursor-pointer' : 'cursor-default',
        isActiveWord ? 'font-semibold' : 'font-medium',
        isSelected
          ? 'bg-success/30 ring-2 ring-success/45'
          : isActiveWord
            ? 'bg-success/25'
            : isPhrasalVerb
              ? 'bg-accent/18 outline-1 outline-dashed outline-accent/65 hover:bg-primary-light/30'
              : isPhrase
                ? 'bg-terra-600/12 outline-1 outline-dashed outline-terra-600/55 hover:bg-primary-light/30'
                : isCollocation
                  ? 'bg-terra-400/15 outline-1 outline-dashed outline-terra-400/55 hover:bg-primary-light/30'
                  : 'hover:bg-primary-light/30',
        isSelecting && 'select-none',
        word.status === 'mastered' && 'opacity-70',
      )}
    >
      {word.text}
    </span>
  );
}

function PhraseGroup({
  group,
  onClick,
  fontSize,
  isWordSelected,
  selectionHandlers,
  activeWordIndex,
  onPauseOnHover,
  onResumeOnLeave,
}: {
  group: WordGroup;
  onClick: (word: EnhancedWord) => void;
  fontSize: number;
  isWordSelected: (index: number) => boolean;
  selectionHandlers: WordRangeSelectionHandlers;
  activeWordIndex: number;
  onPauseOnHover?: () => void;
  onResumeOnLeave?: () => void;
}) {
  const primary = group.words.find((w) => w.isClickable) || group.words[0];
  const phraseWord: EnhancedWord = {
    ...primary,
    text: group.words.map((w) => w.text).join(' '),
    cleanText: group.words.map((w) => w.cleanText).join(' '),
    phraseText: group.phraseText,
    phraseType: group.phraseType,
    phraseDefinition: group.phraseDefinition,
  };
  const selected = group.words.some((w) => isWordSelected(w.index));
  const active =
    activeWordIndex >= 0 && Math.max(...group.words.map((w) => w.index)) <= activeWordIndex;
  const border =
    group.phraseType === 'phrasal_verb'
      ? 'border-accent/65'
      : group.phraseType === 'idiom'
        ? 'border-terra-600/65'
        : group.type === 'collocation'
          ? 'border-terra-400/55'
          : 'border-primary-light/50';
  return (
    <span
      style={{ fontSize: `${fontSize}px` }}
      onClick={() => onClick(phraseWord)}
      onMouseEnter={() => onPauseOnHover?.()}
      onMouseLeave={() => onResumeOnLeave?.()}
      className={cn(
        'relative mx-0.5 inline-flex cursor-pointer items-center rounded-lg border-2 border-b-[3px] border-dashed px-1.5 py-1 font-medium transition-all duration-150',
        border,
        selected
          ? 'bg-success/30 ring-2 ring-success/45'
          : active
            ? 'bg-success/20'
            : 'hover:bg-primary-light/15',
      )}
    >
      {group.words.map((w, i) => (
        <span
          key={w.index}
          data-word-index={w.index}
          className={i < group.words.length - 1 ? 'mr-0.5' : ''}
          onMouseDown={(e) => selectionHandlers.onWordMouseDown(w.index, e)}
          onMouseEnter={() => selectionHandlers.onWordMouseEnter(w.index)}
          onMouseUp={(e) => selectionHandlers.onWordMouseUp(w.index, e)}
        >
          {w.text}
        </span>
      ))}
    </span>
  );
}

// ── The one-time "tap any word" hint (website: TapWordHint) ───────────────────

const HINT_KEY = 'flexi.hint.tapWord';
const HINT_CHANGED = 'flexi:tap-word-hint';

function subscribeHint(onChange: () => void) {
  window.addEventListener(HINT_CHANGED, onChange);
  return () => window.removeEventListener(HINT_CHANGED, onChange);
}
function hintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) !== null;
  } catch {
    return true;
  }
}
function dismissHint() {
  try {
    if (hintDismissed()) return;
    window.localStorage.setItem(HINT_KEY, new Date().toISOString());
    window.dispatchEvent(new Event(HINT_CHANGED));
  } catch {
    // storage blocked: the hint simply stays
  }
}

function TapWordHint() {
  const { t } = useTranslation('podcastUi');
  const dismissed = useSyncExternalStore(subscribeHint, hintDismissed, () => true);
  if (dismissed) return null;
  return (
    <div
      role="status"
      className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-primary-light/30 bg-card py-1 ps-3 pe-1 text-[12.5px] font-semibold text-primary shadow-xs"
    >
      <MousePointerClick className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t('np.tapWordHint')}
      <button
        type="button"
        onClick={dismissHint}
        aria-label={t('shared.close')}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-primary hover:bg-primary-light/15"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── The stack ─────────────────────────────────────────────────────────────────

interface SubtitleStackProps {
  segments: PodcastTranscriptSegment[];
  /** Player time, seconds. */
  currentTime: number;
  /** Seconds added to a line's time to get the player's (sync points). */
  syncOffset?: number;
  fontSize: number;
  /** The reader's cap on lines before/after the spoken one (null = as many as fit). */
  maxContext?: number | null;
  /** A tall zone (the desktop reading card): more lines around the spoken one. */
  roomy?: boolean;
  episodeId?: string;
  sourceLang?: string;
  autoPauseOnBoundary?: boolean;
  pauseOnHover?: boolean;
  waitingLabel: string;
  /** Jump to a line around the spoken one (player seconds). */
  onSeek: (timeSeconds: number) => void;
  onAddToDeck?: (words: string[]) => void;
  onDialogOpenChange?: (open: boolean) => void;
  className?: string;
}

export function SubtitleStack({
  segments,
  currentTime,
  syncOffset = 0,
  fontSize,
  maxContext = null,
  roomy = false,
  episodeId,
  sourceLang = 'en',
  autoPauseOnBoundary = false,
  pauseOnHover = false,
  waitingLabel,
  onSeek,
  onAddToDeck,
  onDialogOpenChange,
  className,
}: SubtitleStackProps) {
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const recordWordClick = usePlayerStore((s) => s.recordWordClick);

  const timeMs = (currentTime - syncOffset) * 1000;
  const displayIndex = useMemo(() => displayIndexAt(segments, timeMs), [segments, timeMs]);
  const active = displayIndex >= 0 ? segments[displayIndex] : null;
  const isBetween = !!active && !(timeMs >= active.startMs && timeMs <= active.endMs);

  // ── Zone measurement ──
  const [zone, setZone] = useState({ h: 0, w: 0 });
  const zoneElRef = useRef<HTMLDivElement | null>(null);
  const zoneRoRef = useRef<ResizeObserver | null>(null);
  const setZoneRef = useCallback((node: HTMLDivElement | null) => {
    zoneRoRef.current?.disconnect();
    zoneRoRef.current = null;
    zoneElRef.current = node;
    if (!node) return;
    const measure = () => setZone({ h: node.clientHeight, w: node.clientWidth });
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    zoneRoRef.current = ro;
    measure();
  }, []);
  useEffect(() => () => zoneRoRef.current?.disconnect(), []);

  const budget = budgetForZone(zone.h, zone.w > 0 && zone.w < 520, roomy);
  const contextCount =
    maxContext === null ? budget.context : Math.min(budget.context, Math.max(0, maxContext));
  const activeRatio =
    contextCount < budget.context
      ? Math.max(budget.activeRatio, RATIO_FOR_CONTEXT[contextCount] ?? budget.activeRatio)
      : budget.activeRatio;
  const maxActiveHeight = zone.h > 0 ? Math.floor(zone.h * activeRatio) : 0;

  // ── The spoken line's words, levels and collocations ──
  const rawWords = useMemo<PodcastWordTimestamp[]>(() => {
    if (!active) return [];
    if (active.words?.length) return active.words;
    return active.text
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({ word, startMs: active.startMs, endMs: active.endMs, confidence: 0 }));
  }, [active]);
  const collocations = useMemo<CollocationMatch[]>(
    () => (rawWords.length ? detectCollocations(rawWords.map((w) => w.word)) : []),
    [rawWords],
  );
  const [cefrMap, setCefrMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!rawWords.length) return;
    const rebuild = () => {
      const map: Record<string, string> = {};
      for (const w of rawWords) {
        const clean = cleanWord(w.word);
        const cached = cefrCache.get(cefrCacheKey(sourceLang, clean));
        if (clean.length > 1 && cached) map[clean] = cached;
      }
      setCefrMap(map);
    };
    const unique = [
      ...new Set(
        rawWords
          .map((w) => cleanWord(w.word))
          .filter((w) => w.length > 1 && !cefrCache.has(cefrCacheKey(sourceLang, w))),
      ),
    ];
    if (unique.length === 0) {
      rebuild();
      return;
    }
    invoke<[string, string][]>('podcast_get_words_cefr', { words: unique, lang: sourceLang })
      .then((result) => {
        const returned = new Set<string>();
        for (const [w, cefr] of result) {
          cefrCache.set(cefrCacheKey(sourceLang, w.toLowerCase()), cefr);
          returned.add(w.toLowerCase());
        }
        // Unsupported language: negative-cache so each line does not ask again.
        for (const w of unique)
          if (!returned.has(w)) cefrCache.set(cefrCacheKey(sourceLang, w), '');
        rebuild();
      })
      .catch(() => {});
  }, [rawWords, sourceLang]);

  const activeWordIndex = useMemo(() => {
    if (!active?.words?.length) return -1;
    return active.words.findIndex((w) => timeMs >= w.startMs && timeMs <= w.endMs);
  }, [active, timeMs]);

  // ── One selection across every line on screen ──
  const offsets = useMemo(() => {
    const out: number[] = [];
    for (let i = -contextCount; i <= contextCount; i++) out.push(i);
    return out;
  }, [contextCount]);

  const visible = useMemo(() => {
    const words: EnhancedWord[] = [];
    const lines = new Map<number, { start: number; words: EnhancedWord[] }>();
    for (const offset of offsets) {
      const idx = displayIndex + offset;
      if (idx < 0 || idx >= segments.length) continue;
      const start = words.length;
      let lineWords: EnhancedWord[];
      if (offset === 0) {
        lineWords = rawWords.map((w, i) => {
          const clean = cleanWord(w.word);
          const coll = getCollocationAt(i, collocations);
          return {
            text: w.word,
            cleanText: clean,
            index: start + i,
            cefr: (cefrMap[clean] || 'unknown') as EnhancedWord['cefr'],
            status: 'new' as const,
            isClickable: clean.length > 1,
            collocationId: coll ? `coll-${coll.startIdx}` : undefined,
            collocationText: coll?.phrase,
            collocationScore: coll?.score,
          };
        });
      } else {
        lineWords = segments[idx].text
          .split(/\s+/)
          .filter(Boolean)
          .map((text, i) => ({
            text,
            cleanText: cleanWord(text),
            index: start + i,
            cefr: 'unknown' as const,
            status: 'new' as const,
            isClickable: false,
          }));
      }
      lines.set(offset, { start, words: lineWords });
      words.push(...lineWords);
    }
    return { words, lines };
  }, [offsets, displayIndex, segments, rawWords, collocations, cefrMap]);

  const activeLine = visible.lines.get(0);
  const activeStart = activeLine?.start ?? 0;
  const selection = useWordRangeSelection(
    visible.words,
    active ? `${active.id}|${contextCount}` : undefined,
    pause,
    resume,
    zoneElRef,
  );
  const { selectedIndices, isSelectionActive, clearSelection } = selection;
  const anchor = useCallback((): HTMLElement | null => {
    if (selectedIndices.size === 0) return null;
    const first = Math.min(...selectedIndices);
    if (first >= activeStart) return null;
    return (
      zoneElRef.current
        ?.querySelector(`[data-word-index="${first}"]`)
        ?.closest<HTMLElement>('[data-context-line]') ?? null
    );
  }, [selectedIndices, activeStart]);
  const showContextSelection = selectedIndices.size > 1;

  useEffect(() => {
    if (!isSelectionActive) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (zoneElRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-selection-bar]')) return;
      if ((target as Element).closest?.('[role="dialog"]')) return;
      clearSelection();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 10);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
    };
  }, [isSelectionActive, clearSelection]);

  // ── Auto-fit the spoken line (floor: 80% of the chosen size) ──
  const fitKey = `${displayIndex}|${fontSize}|${maxActiveHeight}`;
  const [fit, setFit] = useState({ key: '', font: fontSize });
  const autoFont = fit.key === fitKey ? fit.font : fontSize;
  const activeElRef = useRef<HTMLDivElement | null>(null);
  const measureActive = useCallback(() => {
    const el = activeElRef.current;
    if (!el || !maxActiveHeight) return;
    const h = el.scrollHeight;
    if (h <= maxActiveHeight + 1) return;
    setFit((prev) => {
      const current = prev.key === fitKey ? prev.font : fontSize;
      const floor = Math.max(FONT_SIZE_MIN, Math.round(fontSize * 0.8));
      if (current <= floor) return prev;
      const next = Math.max(floor, Math.floor((current * maxActiveHeight) / h));
      return next < current ? { key: fitKey, font: next } : prev;
    });
  }, [fitKey, fontSize, maxActiveHeight]);
  const activeRoRef = useRef<ResizeObserver | null>(null);
  const setActiveEl = useCallback(
    (node: HTMLDivElement | null) => {
      activeRoRef.current?.disconnect();
      activeRoRef.current = null;
      activeElRef.current = node;
      if (!node) return;
      const ro = new ResizeObserver(() => measureActive());
      ro.observe(node);
      activeRoRef.current = ro;
      measureActive();
    },
    [measureActive],
  );
  useEffect(() => () => activeRoRef.current?.disconnect(), []);

  // ── Auto-pause at each new line, and pause while a word is hovered ──
  const lastLineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoPauseOnBoundary) {
      lastLineRef.current = null;
      return;
    }
    if (!active || isBetween) return;
    if (lastLineRef.current && lastLineRef.current !== active.id && isPlaying) pause();
    lastLineRef.current = active.id;
  }, [active, isBetween, autoPauseOnBoundary, isPlaying, pause]);
  const hoverPausedRef = useRef(false);
  const pauseOnWordHover = useCallback(() => {
    if (pauseOnHover && usePlayerStore.getState().isPlaying) {
      pause();
      hoverPausedRef.current = true;
    }
  }, [pauseOnHover, pause]);
  const resumeOnWordLeave = useCallback(() => {
    if (hoverPausedRef.current) {
      hoverPausedRef.current = false;
      resume();
    }
  }, [resume]);

  // ── The word dialog and the note dialog ──
  const [dialog, setDialog] = useState<{
    word: string;
    positionMs?: number;
    context?: string;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const openWord = useCallback(
    (text: string, positionMs?: number) => {
      dismissHint();
      setDialog({ word: text, positionMs, context: active?.text });
      onDialogOpenChange?.(true);
    },
    [active?.text, onDialogOpenChange],
  );
  const closeWord = (open: boolean) => {
    if (open) return;
    setDialog(null);
    onDialogOpenChange?.(false);
  };
  const handleWordClick = (word: EnhancedWord) => {
    if (selection.isDragging || selection.isSelectionActive) return;
    recordWordClick();
    openWord(word.text, rawWords[word.index - activeStart]?.startMs);
  };

  const wordGroups = useMemo(() => (activeLine ? groupWords(activeLine.words) : []), [activeLine]);

  const zoneClass = cn(
    'relative flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden px-3 py-2',
    className,
  );

  const dialogs = (
    <>
      <WordDialog
        word={dialog?.word ?? ''}
        open={!!dialog}
        onOpenChange={closeWord}
        episodeId={episodeId}
        positionMs={dialog?.positionMs}
        sourceLang={sourceLang}
        sentenceContext={dialog?.context}
      />
      {episodeId && (
        <QuickAddNoteDialog
          open={note !== null}
          onClose={() => {
            setNote(null);
            resume();
          }}
          episodeId={episodeId}
          currentTime={Math.round(currentTime * 1000)}
          subtitleText={note || active?.text}
        />
      )}
    </>
  );

  if (!active) {
    return (
      <div ref={setZoneRef} className={zoneClass} data-subtitle-layout="stack">
        <span className="text-sm text-muted-foreground">{waitingLabel}</span>
        {dialogs}
      </div>
    );
  }

  return (
    <div ref={setZoneRef} className={zoneClass} data-subtitle-layout="stack">
      {offsets.map((offset) => {
        const idx = displayIndex + offset;
        const segment = idx >= 0 && idx < segments.length ? segments[idx] : null;
        const dist = Math.abs(offset);
        const opacity = (roomy ? ROOMY_OPACITY : CONTEXT_OPACITY)[dist] ?? 0;
        const scale = (roomy ? ROOMY_SCALE : CONTEXT_SCALE)[dist] ?? 0.46;

        if (offset === 0) {
          return (
            <div
              key="active"
              className="relative flex w-full shrink-0 flex-col items-center overflow-y-auto rounded-2xl bg-foreground/[0.03] py-1 transition-opacity duration-200"
              style={{ maxHeight: maxActiveHeight || undefined, opacity: isBetween ? 0.55 : 1 }}
            >
              <div
                ref={setActiveEl}
                className="relative flex max-w-full flex-col items-center px-1 text-center"
                onMouseLeave={resumeOnWordLeave}
              >
                <TapWordHint />
                {isSelectionActive && (
                  <SelectionActionBar
                    floating
                    anchor={anchor}
                    selectedText={selection.selectedText}
                    words={visible.words}
                    selectedIndices={selectedIndices}
                    onClear={clearSelection}
                    containerRef={activeElRef}
                    onPauseForDialog={pause}
                    onResumeAfterDialog={resume}
                    currentTime={currentTime}
                    onAddToDeck={(w) => onAddToDeck?.([w.cleanText || w.text])}
                    onTranslate={(text) => openWord(text, Math.round(currentTime * 1000))}
                    onAddNote={(text) => setNote(text)}
                  />
                )}
                <div
                  dir="ltr"
                  className={cn(
                    'flex flex-wrap items-center justify-center gap-0.5 leading-snug text-foreground',
                    selection.selectionState.isSelecting && 'select-none',
                  )}
                  style={{ fontSize: `${autoFont}px` }}
                >
                  {wordGroups.map((group) =>
                    group.type === 'single' ? (
                      <ClickableWord
                        key={group.groupId}
                        word={group.words[0]}
                        wordIndex={group.words[0].index}
                        onClick={handleWordClick}
                        fontSize={autoFont}
                        isSelected={selection.isWordSelected(group.words[0].index)}
                        isSelecting={selection.selectionState.isSelecting}
                        selectionHandlers={selection.handlers}
                        isActiveWord={
                          activeWordIndex >= 0 &&
                          activeWordIndex + activeStart >= group.words[0].index
                        }
                        onPauseOnHover={pauseOnWordHover}
                        onResumeOnLeave={resumeOnWordLeave}
                      />
                    ) : (
                      <PhraseGroup
                        key={group.groupId}
                        group={group}
                        onClick={handleWordClick}
                        fontSize={autoFont}
                        isWordSelected={selection.isWordSelected}
                        selectionHandlers={selection.handlers}
                        activeWordIndex={activeWordIndex >= 0 ? activeWordIndex + activeStart : -1}
                        onPauseOnHover={pauseOnWordHover}
                        onResumeOnLeave={resumeOnWordLeave}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          );
        }

        const ctxFont = Math.max(10, autoFont * scale);
        const slotHeight = Math.ceil(ctxFont * 1.35 * 2 + 2);
        const line = visible.lines.get(offset);
        const reached =
          showContextSelection &&
          !!line &&
          line.words.some((w) => selection.isWordSelected(w.index));
        return (
          <div
            key={offset}
            data-context-line=""
            className="flex w-full items-center justify-center overflow-hidden transition-opacity duration-150"
            style={{ height: slotHeight, opacity: reached ? 1 : opacity }}
          >
            {segment && (
              <button
                type="button"
                dir="ltr"
                onClick={() => {
                  if (selection.isDragging) return;
                  onSeek(segment.startMs / 1000 + syncOffset + 0.01);
                }}
                className="line-clamp-2 w-full cursor-pointer border-0 bg-transparent px-2 text-center text-muted-foreground"
                style={{ fontSize: ctxFont, lineHeight: 1.35 }}
              >
                {line
                  ? line.words.map((word, i) => (
                      <React.Fragment key={word.index}>
                        {i > 0 && ' '}
                        <span
                          data-word-index={word.index}
                          className={
                            showContextSelection && selection.isWordSelected(word.index)
                              ? 'rounded-[7px] bg-success/30 ring-2 ring-success/45'
                              : undefined
                          }
                          onMouseDown={(e) => selection.handlers.onWordMouseDown(word.index, e)}
                          onMouseEnter={() => selection.handlers.onWordMouseEnter(word.index)}
                          onMouseUp={(e) => selection.handlers.onWordMouseUp(word.index, e)}
                        >
                          {word.text}
                        </span>
                      </React.Fragment>
                    ))
                  : segment.text}
              </button>
            )}
          </div>
        );
      })}
      {dialogs}
    </div>
  );
}
