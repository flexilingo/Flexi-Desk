import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Badge } from '@/components/ui/badge';
import type { PodcastTranscriptSegment, PodcastWordTimestamp } from '../types';
import { formatTimeMs } from '../types';
import { WordDialog } from '@/components/WordDialog';
import { cleanWord, cefrCacheKey } from '../utils/words';
import { usePlayerStore } from '../stores/playerStore';
import { useTranslation } from 'react-i18next';

interface TranscriptPanelProps {
  segments: PodcastTranscriptSegment[];
  currentTime: number; // seconds
  onSeek: (timeSeconds: number) => void;
  isLoading?: boolean;
  episodeId?: string;
  sourceLang?: string;
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
  syncOffset = 0,
}: TranscriptPanelProps) {
  const { t } = useTranslation('podcastUi');
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

  // Batch-fetch CEFR for all words, in the EPISODE's language (once per segments change)
  useEffect(() => {
    if (!segments.length) return;

    // The map handed to the renderer holds only the current language's entries;
    // the cache itself is lang-prefixed so switching episodes can't cross-read.
    const rebuildMap = () => {
      const prefix = `${sourceLang}:`;
      const map: Record<string, string> = {};
      cefrCache.forEach((v, k) => {
        // '' marks "language has no CEFR table" — cached to avoid refetching.
        if (v && k.startsWith(prefix)) {
          map[k.slice(prefix.length)] = v;
        }
      });
      setCefrMap(map);
    };

    const allWords = new Set<string>();
    for (const seg of segments) {
      const words = seg.words?.length ? seg.words.map((w) => w.word) : seg.text.split(/\s+/);
      for (const w of words) {
        const clean = cleanWord(w);
        if (clean.length > 1 && !cefrCache.has(cefrCacheKey(sourceLang, clean))) {
          allWords.add(clean);
        }
      }
    }

    if (allWords.size === 0) {
      rebuildMap();
      return;
    }

    const unique = [...allWords];
    invoke<[string, string][]>('podcast_get_words_cefr', { words: unique, lang: sourceLang })
      .then((result) => {
        const returned = new Set<string>();
        for (const [w, cefr] of result) {
          cefrCache.set(cefrCacheKey(sourceLang, w.toLowerCase()), cefr);
          returned.add(w.toLowerCase());
        }
        for (const w of unique) {
          if (!returned.has(w)) cefrCache.set(cefrCacheKey(sourceLang, w), '');
        }
        rebuildMap();
      })
      .catch(() => {});
  }, [segments, sourceLang]);

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
        <p className="text-sm text-muted-foreground">{t('transcript.loading')}</p>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('transcript.empty')}</p>
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
          const clean = cleanWord(w.word);
          const cefrLevel = cefrMap[clean];
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
