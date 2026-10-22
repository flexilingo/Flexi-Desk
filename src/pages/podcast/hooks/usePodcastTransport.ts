import { useCallback, useMemo, useRef } from 'react';
import type { PodcastTranscriptSegment } from '../types';
import {
  lineIndexAt,
  nextLineStep,
  prevLineStep,
  type LastStep,
  type StepLine,
  type StepResult,
} from '../utils/transport';

interface Options {
  segments: PodcastTranscriptSegment[];
  /** Sync offset in seconds (segment time + offset = player time). */
  syncOffset: number;
  currentTime: number;
  episodeId: string | null;
  /** Seeks to an absolute time (starts the episode first when it is not the playing one). */
  seekTo: (time: number) => void;
  /** Relative seek, used where there is no line to step to. */
  skip: (seconds: number) => void;
}

/**
 * The previous/next-line buttons, the arrow keys and the OS media keys all go through here, so they
 * agree: a line at a time (5 s where there is no line), a press within 1.5 s counts from the line
 * the last press went to, and "previous" only restarts the line once you are 1.5 s into it.
 */
export function usePodcastTransport({
  segments,
  syncOffset,
  currentTime,
  episodeId,
  seekTo,
  skip,
}: Options) {
  const lines = useMemo<StepLine[]>(
    () =>
      segments.map((s) => ({
        start: s.startMs / 1000 + syncOffset,
        end: s.endMs / 1000 + syncOffset,
      })),
    [segments, syncOffset],
  );
  const lastStepRef = useRef<LastStep | null>(null);
  // The latest time lives in a ref: the store's time reaches React a render late.
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;

  const apply = useCallback(
    (result: StepResult) => {
      if (result.kind === 'skip') {
        lastStepRef.current = null;
        skip(result.seconds);
        return;
      }
      const line = lines[result.index];
      seekTo(Math.max(0, line.start));
      lastStepRef.current = { index: result.index, at: performance.now(), episodeId };
    },
    [lines, seekTo, skip, episodeId],
  );

  const input = useCallback(
    () => ({
      lines,
      time: timeRef.current,
      activeIndex: lineIndexAt(lines, timeRef.current),
      last: lastStepRef.current,
      episodeId,
      nowMs: performance.now(),
    }),
    [lines, episodeId],
  );

  const prevLine = useCallback(() => {
    if (lines.length === 0) return skip(-5);
    apply(prevLineStep(input()));
  }, [lines.length, apply, input, skip]);
  const nextLine = useCallback(() => {
    if (lines.length === 0) return skip(5);
    apply(nextLineStep(input()));
  }, [lines.length, apply, input, skip]);

  return { lineSteps: lines.length > 0, prevLine, nextLine, lines };
}
