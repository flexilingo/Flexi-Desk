import { useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatTimeMs } from '../types';
import type { PodcastTranscriptSegment } from '../types';

interface TranscriptSegmentRowProps {
  segment: PodcastTranscriptSegment;
  isActive: boolean;
  onClick: () => void;
}

export function TranscriptSegmentRow({ segment, isActive, onClick }: TranscriptSegmentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

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
          ? 'flex items-start gap-3 rounded-md px-3 py-2 bg-primary/10 border-l-2 border-primary font-medium cursor-pointer transition-colors'
          : 'flex items-start gap-3 rounded-md px-3 py-2 border-l-2 border-transparent hover:bg-muted/50 cursor-pointer transition-colors'
      }
    >
      <Badge
        variant="secondary"
        className="shrink-0 mt-0.5 text-xs text-muted-foreground font-mono"
      >
        {formatTimeMs(segment.startMs)}
      </Badge>

      <span className="text-sm text-foreground leading-relaxed">{segment.text}</span>
    </div>
  );
}
