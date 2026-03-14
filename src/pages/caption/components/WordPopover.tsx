import { useEffect, useRef } from 'react';
import { Clock, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTimestampMs } from '../types';

interface WordPopoverProps {
  word: string;
  startMs: number;
  endMs: number;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function WordPopover({ word, startMs, endMs, anchorRect, onClose }: WordPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Position the popover above the word
  const top = anchorRect.top - 8;
  const left = anchorRect.left + anchorRect.width / 2;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 -translate-x-1/2 -translate-y-full"
      style={{ top, left }}
    >
      <div className="rounded-lg border border-border bg-card shadow-lg p-3 min-w-[200px]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">{word.trim()}</span>
          <button
            onClick={onClose}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTimestampMs(startMs)} – {formatTimestampMs(endMs)}
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-7">
            <BookOpen className="h-3 w-3" />
            Look Up
          </Button>
        </div>
      </div>
    </div>
  );
}
