/**
 * ProgramDefinition + window + segments -> a flat array of ResolvedStep.
 *
 * Everything clever happens here, once, at Start. The runtime machine only ever
 * walks a flat array by index, and every ResolvedStep.clip is already
 * segment-snapped, padded and inverted onto the AUDIO timeline — so the engine
 * never has to think about sync points.
 *
 * Pipeline: snapToSegments -> chunkSegments -> padClip -> toAudioClip
 */

import type { SyncPoint } from '../../types';
import type { ClipRange, ProgramDefinition, ProgramStepTemplate, ResolvedStep } from '../types';
import {
  type TranscriptSegment,
  CLIP_LEAD_IN_SEC,
  CLIP_TAIL_SEC,
  chunkSegments,
  clipDuration,
  padClip,
  textOf,
  toAudioClip,
} from './clip-math';

/** Fixed time cost of the no-audio steps, for the launcher's estimate. */
const STATIC_STEP_SEC: Partial<Record<string, number>> = {
  preteach: 20,
  recall: 6,
  prompt: 8,
  review: 0,
};

/** Extra seconds a user spends typing / deciding on top of playback. */
const INTERACTION_SEC: Partial<Record<string, number>> = {
  dictation: 45,
  loop: 14,
};

interface CompileInput {
  definition: ProgramDefinition;
  /** SUBTITLE timeline. */
  window: ClipRange;
  windowIndices: number[];
  segments: TranscriptSegment[];
  syncPoints: SyncPoint[];
}

function resolveClips(
  template: ProgramStepTemplate,
  input: CompileInput,
): Array<{ clip: ClipRange; indices: number[]; text: string } | null> {
  const { definition, window, windowIndices, segments } = input;

  if (!template.clip) return [null];

  if (template.clip.of === 'window') {
    return [{ clip: window, indices: windowIndices, text: textOf(segments, windowIndices) }];
  }

  if (template.clip.of === 'window-slice') {
    const span = window.end - window.start;
    const from = window.start + span * template.clip.fromPct;
    const to = window.start + span * template.clip.toPct;
    const indices = windowIndices.filter((i) => segments[i].end > from && segments[i].start < to);
    if (!indices.length) return [null];
    return [
      {
        clip: { start: segments[indices[0]].start, end: segments[indices[indices.length - 1]].end },
        indices,
        text: textOf(segments, indices),
      },
    ];
  }

  // window-chunks: expands to N steps.
  const targetSec =
    template.clip.size === 'decode'
      ? definition.chunking.decodeSec
      : template.clip.size === 'dictation'
        ? definition.chunking.dictationSec
        : definition.chunking.loopSec;

  const chunks = chunkSegments(segments, windowIndices, {
    targetSec,
    maxSec: targetSec * 1.6,
    max: template.clip.max,
  });

  if (!chunks.length) return [null];
  return chunks.map((c) => ({ clip: c.range, indices: c.indices, text: c.text }));
}

export function compileProgram(input: CompileInput): ResolvedStep[] {
  const { definition, window, syncPoints } = input;
  const out: ResolvedStep[] = [];

  for (const template of definition.steps) {
    const resolved = resolveClips(template, input);

    resolved.forEach((r, chunkIndex) => {
      // A clip-bearing template that resolved to nothing is dropped rather than
      // shown as an empty exercise.
      if (template.clip && !r) return;

      const repeat = template.repeat ?? 1;
      const gapMs = template.gapMs ?? 0;
      const rate = template.rate ?? 1;

      let clip: ClipRange | null = null;
      if (r) {
        const padded = padClip(r.clip, CLIP_LEAD_IN_SEC, CLIP_TAIL_SEC, window);
        clip = toAudioClip(padded, syncPoints);
      }

      const playSec = (clipDuration(clip) / rate) * repeat + (gapMs / 1000) * (repeat - 1);
      const estSec =
        (STATIC_STEP_SEC[template.kind] ?? 0) + playSec + (INTERACTION_SEC[template.kind] ?? 0);

      out.push({
        key: resolved.length > 1 ? `${template.id}#${chunkIndex}` : template.id,
        templateId: template.id,
        kind: template.kind,
        clip,
        rate,
        subtitles: template.subtitles,
        repeat,
        gapMs,
        completion: template.completion,
        titleKey: template.titleKey,
        bodyKey: template.bodyKey,
        options: template.options ?? {},
        text: r?.text ?? '',
        segmentIndices: r?.indices ?? [],
        estSec: Math.round(estSec),
      });
    });
  }

  return out;
}

/** Total wall-clock estimate, for the launcher card. */
export function estimateDuration(steps: ResolvedStep[]): number {
  return steps.reduce((a, s) => a + s.estSec, 0);
}
