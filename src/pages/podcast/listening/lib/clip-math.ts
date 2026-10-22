/**
 * Pure clip geometry. No React, no audio element, no side effects.
 *
 * Two rules everything here exists to enforce:
 *
 *  1. A clip boundary always lands on a whole segment edge. There are no
 *     word-level timestamps in the system, so a boundary chosen anywhere else
 *     cuts a word in half and sounds like a bug.
 *  2. Segment times are on the SUBTITLE timeline. Anything that will be handed
 *     to audio.currentTime must go through toAudioClip() first.
 */

import type { SyncPoint } from '../../types';
import { getEffectiveOffset } from '../../types';
import type { ClipRange } from '../types';

/** A subtitle line on the SUBTITLE timeline, in seconds. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Chunk {
  /** SUBTITLE timeline. */
  range: ClipRange;
  indices: number[];
  text: string;
}

/** Index of the segment containing t; else the next one; else -1. */
export function segmentIndexAt(segments: TranscriptSegment[], t: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (t < segments[i].end) return i;
  }
  return -1;
}

export function textOf(segments: TranscriptSegment[], indices: number[]): string {
  return indices
    .map((i) => segments[i]?.text ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rangeOf(segments: TranscriptSegment[], indices: number[]): ClipRange {
  return {
    start: segments[indices[0]].start,
    end: segments[indices[indices.length - 1]].end,
  };
}

/**
 * Snap [from, to] outward to whole segment boundaries.
 * Returns null when the range covers no segment at all.
 */
export function snapToSegments(
  segments: TranscriptSegment[],
  from: number,
  to: number,
  opts?: { minSec?: number; maxSec?: number },
): { range: ClipRange; indices: number[] } | null {
  if (!segments.length || to <= from) return null;

  const indices: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    // Any overlap at all pulls the whole segment in.
    if (segments[i].end > from && segments[i].start < to) indices.push(i);
  }
  if (!indices.length) return null;

  // Grow forward to reach minSec — never backward, because the user picked
  // "from here" and rewinding past that point is surprising.
  const minSec = opts?.minSec ?? 0;
  let last = indices[indices.length - 1];
  while (
    minSec > 0 &&
    segments[last].end - segments[indices[0]].start < minSec &&
    last + 1 < segments.length
  ) {
    last += 1;
    indices.push(last);
  }

  // Trim from the end to respect maxSec, but never below one segment.
  const maxSec = opts?.maxSec ?? Infinity;
  while (
    indices.length > 1 &&
    segments[indices[indices.length - 1]].end - segments[indices[0]].start > maxSec
  ) {
    indices.pop();
  }

  return { range: rangeOf(segments, indices), indices };
}

/** "N seconds from here" — the focused-mode window. */
export function windowStartingAt(
  segments: TranscriptSegment[],
  at: number,
  lengthSec: number,
): { range: ClipRange; indices: number[] } | null {
  return snapToSegments(segments, at, at + lengthSec, { minSec: lengthSec * 0.5 });
}

/** "the last N seconds ending at `at`" — continuous mode's look-back window. */
export function windowEndingAt(
  segments: TranscriptSegment[],
  at: number,
  lengthSec: number,
): { range: ClipRange; indices: number[] } | null {
  return snapToSegments(segments, Math.max(0, at - lengthSec), at);
}

/**
 * Group consecutive segments into chunks by accumulating until >= targetSec.
 *
 * NEVER splits a segment. Whisper segments are sentence-sized (often 8-15s), so
 * targetSec is a LOWER bound, not a target you will hit exactly. A single
 * segment longer than maxSec stands alone rather than being cut — cutting it
 * would need word timings we do not have.
 */
export function chunkSegments(
  segments: TranscriptSegment[],
  indices: number[],
  opts: { targetSec: number; maxSec?: number; max?: number },
): Chunk[] {
  const maxSec = opts.maxSec ?? opts.targetSec * 1.6;
  const chunks: Chunk[] = [];
  let current: number[] = [];

  const flush = () => {
    if (!current.length) return;
    chunks.push({
      range: rangeOf(segments, current),
      indices: current,
      text: textOf(segments, current),
    });
    current = [];
  };

  for (const i of indices) {
    const seg = segments[i];
    if (!seg) continue;
    const wouldSpan = current.length ? seg.end - segments[current[0]].start : seg.end - seg.start;

    // Adding this segment would blow past maxSec and we already have something:
    // close the chunk first so we never merge two long sentences.
    if (current.length && wouldSpan > maxSec) {
      flush();
      current.push(i);
    } else {
      current.push(i);
    }

    if (segments[current[current.length - 1]].end - segments[current[0]].start >= opts.targetSec) {
      flush();
    }
  }
  flush();

  // A trailing scrap shorter than half the target is folded back into its
  // predecessor rather than shown as a 2-second exercise.
  if (chunks.length > 1) {
    const tail = chunks[chunks.length - 1];
    if (tail.range.end - tail.range.start < opts.targetSec * 0.5) {
      const prev = chunks[chunks.length - 2];
      const merged = [...prev.indices, ...tail.indices];
      chunks.splice(chunks.length - 2, 2, {
        range: rangeOf(segments, merged),
        indices: merged,
        text: textOf(segments, merged),
      });
    }
  }

  return typeof opts.max === 'number' ? chunks.slice(0, opts.max) : chunks;
}

/**
 * Whisper boundaries clip the first phoneme and swallow the last. Pad outward,
 * clamped to `bounds` so a clip never leaks outside its window.
 */
export function padClip(
  clip: ClipRange,
  leadInSec: number,
  tailSec: number,
  bounds: ClipRange,
): ClipRange {
  return {
    start: Math.max(bounds.start, clip.start - leadInSec),
    end: Math.min(bounds.end, clip.end + tailSec),
  };
}

export const CLIP_LEAD_IN_SEC = 0.15;
export const CLIP_TAIL_SEC = 0.25;

/**
 * SUBTITLE time -> AUDIO time. Desk keeps the offset as a function of AUDIO time, so the inverse is
 * found by two fixed-point steps (the offset moves slowly between sync points).
 */
export function subtitleToAudioTime(t: number, syncPoints: SyncPoint[]): number {
  if (!syncPoints.length) return t;
  let audio = t + getEffectiveOffset(t, syncPoints);
  audio = t + getEffectiveOffset(audio, syncPoints);
  return audio;
}

/**
 * SUBTITLE-timeline clip -> AUDIO-timeline clip.
 * Identity when the user has no sync points, which is the common case.
 */
export function toAudioClip(clip: ClipRange, syncPoints: SyncPoint[]): ClipRange {
  if (!syncPoints.length) return clip;
  return {
    start: subtitleToAudioTime(clip.start, syncPoints),
    end: subtitleToAudioTime(clip.end, syncPoints),
  };
}

/** Mean and standard deviation of words-per-second across an episode's segments. */
export function speechRateStats(segments: TranscriptSegment[]): { mean: number; std: number } {
  const rates: number[] = [];
  for (const s of segments) {
    const dur = s.end - s.start;
    if (dur < 2) continue; // Whisper padding biases short segments downward.
    const words = s.text.trim().split(/\s+/).filter(Boolean).length;
    if (words > 0) rates.push(words / dur);
  }
  if (!rates.length) return { mean: 0, std: 1 };
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
  return { mean, std: Math.sqrt(variance) || 1 };
}

export function clipDuration(clip: ClipRange | null): number {
  return clip ? Math.max(0, clip.end - clip.start) : 0;
}

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
