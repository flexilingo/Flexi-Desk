import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Badge } from '@/components/ui/badge';
import type { PodcastTranscriptSegment, PodcastWordTimestamp } from '../types';
import { formatTimeMs } from '../types';
import { WordDialog } from './WordDialog';
import { usePlayerStore } from '../stores/playerStore';

interface TranscriptPanelProps {
  segments: PodcastTranscriptSegment[];
  currentTime: number; // seconds
  onSeek: (timeSeconds: number) => void;
  isLoading?: boolean;
  episodeId?: string;
  sourceLang?: string;
  targetLang?: string;
  syncOffset?: number;
}

// ── CEFR underline colors ────────────────────────────────

const CEFR_UNDERLINE: Record<string, string> = {
  A1: '#8BB7A3',
  A2: '#8BB7A3',
  B1: '#C58C6E',
  B2: '#C58C6E',
  C1: '#ef4444',
  C2: '#ef4444',
};

const cefrCache = new Map<string, string>();

export function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
  isLoading,
  episodeId,
  sourceLang = 'en',
  targetLang = 'fa',
  syncOffset = 0,
}: TranscriptPanelProps) {
  const effectiveTime = currentTime - syncOffset;
  const currentTimeMs = effectiveTime * 1000;

  // WordDialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [selectedPositionMs, setSelectedPositionMs] = useState<number | undefined>();
  const [selectedSentence, setSelectedSentence] = useState<string | undefined>();

  // CEFR map
  const [cefrMap, setCefrMap] = useState<Record<string, string>>({});

  const recordWordClick = usePlayerStore((s) => s.recordWordClick);

  const activeSegmentId = useMemo(() => {
    const active = segments.find(
      (seg) => currentTimeMs >= seg.startMs && currentTimeMs <= seg.endMs,
    );
    return active?.id ?? null;
  }, [segments, currentTimeMs]);

  // Batch-fetch CEFR for all words (once on mount / segments change)
  useEffect(() => {
    if (!segments.length) return;

    const allWords = new Set<string>();
    for (const seg of segments) {
      const words = seg.words?.length ? seg.words.map((w) => w.word) : seg.text.split(/\s+/);
      for (const w of words) {
        const clean = w.toLowerCase().replace(/[^a-z']/g, '');
        if (clean.length > 1 && !cefrCache.has(clean)) {
          allWords.add(clean);
        }
      }
    }

    if (allWords.size === 0) {
      const map: Record<string, string> = {};
      cefrCache.forEach((v, k) => {
        map[k] = v;
      });
      setCefrMap(map);
      return;
    }

    const unique = [...allWords];
    invoke<[string, string][]>('podcast_get_words_cefr', { words: unique })
      .then((result) => {
        for (const [w, cefr] of result) {
          cefrCache.set(w.toLowerCase(), cefr);
        }
        const map: Record<string, string> = {};
        cefrCache.forEach((v, k) => {
          map[k] = v;
        });
        setCefrMap(map);
      })
      .catch(() => {});
  }, [segments]);

  const handleWordClick = useCallback(
    (e: React.MouseEvent, word: string, startMs: number) => {
      e.stopPropagation();
      recordWordClick();
      setSelectedWord(word);
      setSelectedPositionMs(startMs);
      // Find the segment containing this word for sentence context
      const seg = segments.find((s) => startMs >= s.startMs && startMs <= s.endMs);
      setSelectedSentence(seg?.text);
      setDialogOpen(true);
    },
    [recordWordClick, segments],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading transcript...</p>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No transcript available. Download the episode and transcribe it.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-y-auto space-y-0.5 pr-1">
        {segments.map((segment) => (
          <TranscriptSegmentRow
            key={segment.id}
            segment={segment}
            isActive={segment.id === activeSegmentId}
            cefrMap={cefrMap}
            onClick={() => onSeek(segment.startMs / 1000)}
            onWordClick={handleWordClick}
          />
        ))}
      </div>

      <WordDialog
        word={selectedWord}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        episodeId={episodeId}
        positionMs={selectedPositionMs}
        sourceLang={sourceLang}
        targetLang={targetLang}
        sentenceContext={selectedSentence}
      />
    </>
  );
}

// ── Segment Row ──────────────────────────────────────────

function TranscriptSegmentRow({
  segment,
  isActive,
  cefrMap,
  onClick,
  onWordClick,
}: {
  segment: PodcastTranscriptSegment;
  isActive: boolean;
  cefrMap: Record<string, string>;
  onClick: () => void;
  onWordClick: (e: React.MouseEvent, word: string, startMs: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  const words: PodcastWordTimestamp[] = segment.words?.length
    ? segment.words
    : segment.text.split(/\s+/).map((w) => ({
        word: w,
        startMs: segment.startMs,
        endMs: segment.endMs,
        confidence: 0,
      }));

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={
        isActive
          ? 'flex items-start gap-3 rounded-md px-3 py-2 bg-primary/10 border-l-2 border-primary cursor-pointer transition-colors'
          : 'flex items-start gap-3 rounded-md px-3 py-2 border-l-2 border-transparent hover:bg-muted/50 cursor-pointer transition-colors'
      }
    >
      <Badge
        variant="secondary"
        className="shrink-0 mt-0.5 text-xs text-muted-foreground font-mono"
      >
        {formatTimeMs(segment.startMs)}
      </Badge>

      <span className="text-sm leading-relaxed flex-1 flex flex-wrap gap-x-0.5">
        {words.map((w, wIdx) => {
          const cleanWord = w.word.toLowerCase().replace(/[^a-z']/g, '');
          const cefrLevel = cefrMap[cleanWord];
          const underlineColor = cefrLevel ? CEFR_UNDERLINE[cefrLevel] : undefined;

          return (
            <span
              key={wIdx}
              className={`cursor-pointer hover:bg-white/10 rounded px-0.5 transition-colors ${
                isActive ? 'font-medium' : ''
              }`}
              style={{
                borderBottom: underlineColor ? `2px solid ${underlineColor}` : undefined,
              }}
              onClick={(e) => onWordClick(e, w.word, w.startMs)}
            >
              {w.word}
            </span>
          );
        })}
      </span>
    </div>
  );
}
