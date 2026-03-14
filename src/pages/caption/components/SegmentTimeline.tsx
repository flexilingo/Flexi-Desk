import { useState, useCallback } from 'react';
import type { CaptionSegment } from '../types';
import { formatTimestampMs } from '../types';
import { WordPopover } from './WordPopover';

interface SegmentTimelineProps {
  segments: CaptionSegment[];
}

export function SegmentTimeline({ segments }: SegmentTimelineProps) {
  const [selectedWord, setSelectedWord] = useState<{
    word: string;
    startMs: number;
    endMs: number;
    rect: DOMRect;
  } | null>(null);

  const handleWordClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: string, startMs: number, endMs: number) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setSelectedWord({ word, startMs, endMs, rect });
    },
    [],
  );

  const closePopover = useCallback(() => {
    setSelectedWord(null);
  }, []);

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Transcript</h3>

      <div className="space-y-3">
        {segments.map((segment) => (
          <SegmentRow key={segment.id} segment={segment} onWordClick={handleWordClick} />
        ))}
      </div>

      {selectedWord && (
        <WordPopover
          word={selectedWord.word}
          startMs={selectedWord.startMs}
          endMs={selectedWord.endMs}
          anchorRect={selectedWord.rect}
          onClose={closePopover}
        />
      )}
    </div>
  );
}

// ── Segment Row ─────────────────────────────────────────────

function SegmentRow({
  segment,
  onWordClick,
}: {
  segment: CaptionSegment;
  onWordClick: (
    e: React.MouseEvent<HTMLSpanElement>,
    word: string,
    startMs: number,
    endMs: number,
  ) => void;
}) {
  const hasWordTimestamps = segment.wordTimestamps.length > 0;

  const confidenceColor =
    segment.confidence >= 0.8
      ? 'border-l-[#8BB7A3]'
      : segment.confidence >= 0.5
        ? 'border-l-[#C58C6E]'
        : 'border-l-error';

  return (
    <div
      className={`group flex gap-3 rounded-md border-l-2 px-3 py-2 transition-colors hover:bg-muted/30 ${confidenceColor}`}
    >
      {/* Timestamp */}
      <div className="shrink-0 pt-0.5">
        <span className="font-mono text-xs text-muted-foreground">
          {formatTimestampMs(segment.startTimeMs)}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 text-sm text-foreground leading-relaxed">
        {hasWordTimestamps ? (
          segment.wordTimestamps.map((wt, i) => (
            <span
              key={i}
              onClick={(e) => onWordClick(e, wt.word, wt.startMs, wt.endMs)}
              className="cursor-pointer rounded px-0.5 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {wt.word}
            </span>
          ))
        ) : (
          <span>{segment.text}</span>
        )}
      </div>

      {/* Confidence badge (on hover) */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground">
          {Math.round(segment.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}
