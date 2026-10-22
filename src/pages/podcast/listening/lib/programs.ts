/**
 * The program catalogue. Adding a teaching method is one object literal here
 * plus its i18n keys — no engine changes.
 *
 * Phase 1 ships three. The full nine-method design (cloze, decode, shadowing,
 * retell, spaced re-listen) slots in as further entries.
 */

import type { ProgramDefinition } from '../types';

/**
 * 1. Three-pass: blind -> subtitled -> blind, with a vocabulary warm-up.
 *
 * The blind pass comes first on purpose: failing to understand is what makes
 * the transcript stick. Read first and the second listen feels easy and nothing
 * is encoded.
 */
const threePass: ProgramDefinition = {
  id: 'three-pass',
  labelKey: 'programs.threePass.label',
  descriptionKey: 'programs.threePass.description',
  icon: 'Layers',
  modes: ['focused', 'continuous'],
  defaultWindowSec: 180,
  chunking: { decodeSec: 6, dictationSec: 10, loopSec: 8 },
  countStudyTime: true,
  minSegments: 2,
  steps: [
    {
      id: 'preteach',
      kind: 'preteach',
      clip: null,
      subtitles: 'off',
      completion: { on: 'user-continue' },
      titleKey: 'steps.preteach.title',
      bodyKey: 'steps.preteach.body',
      options: { count: 5, seconds: 20 },
    },
    {
      id: 'blind1',
      kind: 'listen',
      clip: { of: 'window' },
      subtitles: 'off',
      completion: { on: 'clip-end' },
      titleKey: 'steps.blind1.title',
      bodyKey: 'steps.blind1.body',
    },
    {
      id: 'confidence1',
      kind: 'recall',
      clip: null,
      subtitles: 'off',
      completion: { on: 'submit' },
      titleKey: 'steps.confidence.title',
    },
    {
      id: 'guided',
      kind: 'listen',
      clip: { of: 'window' },
      subtitles: 'on',
      completion: { on: 'clip-end' },
      titleKey: 'steps.guided.title',
      bodyKey: 'steps.guided.body',
    },
    {
      id: 'blind2',
      kind: 'listen',
      clip: { of: 'window' },
      subtitles: 'off',
      completion: { on: 'clip-end' },
      titleKey: 'steps.blind2.title',
      bodyKey: 'steps.blind2.body',
    },
    {
      id: 'confidence2',
      kind: 'recall',
      clip: null,
      subtitles: 'off',
      completion: { on: 'submit' },
      titleKey: 'steps.confidence.title',
    },
  ],
};

/**
 * 2. Loop until cracked. Best payoff per line in the whole catalogue.
 *
 * The 700ms gap between passes is load-bearing: back-to-back loops blur into
 * noise. And the reveal is part of the exercise, not the end of it — the clip
 * keeps looping with the text visible, because mapping now-known text onto the
 * sound is the actual learning moment.
 */
const loopCrack: ProgramDefinition = {
  id: 'loop-crack',
  labelKey: 'programs.loopCrack.label',
  descriptionKey: 'programs.loopCrack.description',
  icon: 'RefreshCw',
  modes: ['focused', 'continuous'],
  defaultWindowSec: 120,
  chunking: { decodeSec: 6, dictationSec: 10, loopSec: 8 },
  countStudyTime: true,
  minSegments: 2,
  steps: [
    {
      id: 'brief',
      kind: 'prompt',
      clip: null,
      subtitles: 'off',
      completion: { on: 'user-continue' },
      titleKey: 'steps.loopBrief.title',
      bodyKey: 'steps.loopBrief.body',
    },
    {
      id: 'crack',
      kind: 'loop',
      clip: { of: 'window-chunks', size: 'loop', max: 6 },
      // 'off', not 'reveal': the text appears on demand or when the loop
      // ceiling is hit, never automatically after the first pass.
      subtitles: 'off',
      repeat: 1,
      gapMs: 700,
      completion: { on: 'submit' },
      titleKey: 'steps.loop.title',
      options: { maxLoops: 8, revealLoops: 2 },
    },
  ],
};

/**
 * 3. Dictation. Hard, honest numbers — and the cheapest to grade, because the
 * transcript is the answer key and the diff is a string comparison.
 */
const dictationPass: ProgramDefinition = {
  id: 'dictation',
  labelKey: 'programs.dictation.label',
  descriptionKey: 'programs.dictation.description',
  icon: 'PenLine',
  modes: ['focused', 'continuous'],
  defaultWindowSec: 120,
  chunking: { decodeSec: 6, dictationSec: 10, loopSec: 8 },
  countStudyTime: true,
  minSegments: 2,
  steps: [
    {
      id: 'brief',
      kind: 'prompt',
      clip: null,
      subtitles: 'off',
      completion: { on: 'user-continue' },
      titleKey: 'steps.dictationBrief.title',
      bodyKey: 'steps.dictationBrief.body',
    },
    {
      id: 'write',
      kind: 'dictation',
      clip: { of: 'window-chunks', size: 'dictation', max: 4 },
      subtitles: 'off',
      repeat: 2,
      gapMs: 700,
      completion: { on: 'submit' },
      titleKey: 'steps.dictation.title',
      options: { maxAttempts: 3 },
    },
    {
      id: 'check',
      kind: 'listen',
      clip: { of: 'window' },
      rate: 0.85,
      subtitles: 'on',
      completion: { on: 'clip-end-then-continue' },
      titleKey: 'steps.dictationCheck.title',
      bodyKey: 'steps.dictationCheck.body',
    },
  ],
};

export const PROGRAM_REGISTRY: ProgramDefinition[] = [threePass, loopCrack, dictationPass];

export const DEFAULT_PROGRAM_ID = threePass.id;

export function getProgram(id: string): ProgramDefinition | undefined {
  return PROGRAM_REGISTRY.find((p) => p.id === id);
}

/** Range chips offered by the launcher, in seconds. */
export const RANGE_OPTIONS = [180, 300, 600] as const;
export const DEFAULT_RANGE_SEC = 180;
