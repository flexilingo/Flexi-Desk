/**
 * Listening Practice Program — shared types.
 *
 * A program is DATA: an ordered list of step templates. Adding a new teaching
 * method is one object literal in programs/_registry.ts, never new engine code.
 */

/** Seconds. Which timeline it is on is documented per field — they are not interchangeable. */
export interface ClipRange {
  start: number;
  end: number;
}

export type ProgramRunMode = 'focused' | 'continuous';

export type ProgramStepKind =
  /** Play the clip. Nothing to do but listen. */
  | 'listen'
  /** Play a short chunk, then reveal its text. */
  | 'decode'
  /** Play (repeatable), user types, LCS-graded. */
  | 'dictation'
  /** Play on a loop until the user says they cracked it. */
  | 'loop'
  /** No audio: the pre-teach vocabulary card. */
  | 'preteach'
  /** No audio: one-tap confidence / self-report. */
  | 'recall'
  /** No audio: instructions, wait for a tap. */
  | 'prompt'
  /** No audio: the run summary. */
  | 'review';

/** 'reveal' = subtitles off while the clip plays, on the instant it ends. */
export type SubtitlePolicy = 'on' | 'off' | 'user' | 'reveal';

export type StepCompletion =
  /** Auto-advance the moment repeats are exhausted. */
  | { on: 'clip-end' }
  /** Clip ends, then wait for a tap. */
  | { on: 'clip-end-then-continue' }
  /** Wait for a tap. Only valid when clip is null. */
  | { on: 'user-continue' }
  /** Wait for an answer. */
  | { on: 'submit' };

/** Resolved against the run's window at compile time — never hardcoded seconds. */
export type ClipSelector =
  | { of: 'window' }
  | { of: 'window-slice'; fromPct: number; toPct: number }
  /** Expands into one ResolvedStep per chunk. */
  | { of: 'window-chunks'; size: 'decode' | 'dictation' | 'loop'; max?: number };

export interface ProgramStepTemplate {
  id: string;
  kind: ProgramStepKind;
  clip: ClipSelector | null;
  /** Playback rate for this step. Default 1. */
  rate?: number;
  subtitles: SubtitlePolicy;
  /** How many times the clip plays before the step is considered done. Default 1. */
  repeat?: number;
  /** Silence between repeats. Back-to-back loops blur into noise. Default 0. */
  gapMs?: number;
  completion: StepCompletion;
  /** i18n key under the `listening` namespace. */
  titleKey: string;
  bodyKey?: string;
  /** Free-form per-kind config (maxLoops, preteachCount, ...). */
  options?: Record<string, number | string | boolean>;
}

export interface ProgramDefinition {
  id: string;
  labelKey: string;
  descriptionKey: string;
  /** lucide-react icon name, resolved by the launcher. */
  icon: string;
  modes: ProgramRunMode[];
  defaultWindowSec: number;
  chunking: { decodeSec: number; dictationSec: number; loopSec: number };
  /**
   * Whether wall-clock study time is credited while this program runs.
   * True for everything today — replaying a clip really is study time.
   */
  countStudyTime: boolean;
  /** Below this the window is too thin to drill; the launcher disables the card. */
  minSegments: number;
  steps: ProgramStepTemplate[];
}

export interface ResolvedStep {
  /** `${templateId}#${chunkIndex}` — stable, used as the answer key. */
  key: string;
  templateId: string;
  kind: ProgramStepKind;
  /** AUDIO timeline, already segment-snapped, padded and sync-inverted. */
  clip: ClipRange | null;
  rate: number;
  subtitles: SubtitlePolicy;
  repeat: number;
  gapMs: number;
  completion: StepCompletion;
  titleKey: string;
  bodyKey?: string;
  options: Record<string, number | string | boolean>;
  /** Dictation target / reveal text for this step's segments. */
  text: string;
  segmentIndices: number[];
  /** Rough seconds this step will take, for the launcher's duration estimate. */
  estSec: number;
}

export type ProgramPhase =
  | 'idle'
  /** Seeking to clip.start, waiting for metadata. */
  | 'arming'
  | 'playing'
  /** Silence between repeats. */
  | 'gap'
  /** Clip done; waiting for continue / submit. */
  | 'awaiting'
  /** User paused, or a host overlay opened, or the user grabbed the transport. */
  | 'paused'
  /** Continuous mode: normal playback until nextTriggerAt. */
  | 'cycle-idle'
  | 'finished';

export interface StepAnswer {
  kind: ProgramStepKind;
  /** What the user typed (dictation) or picked (recall). */
  submitted: string;
  /** 0..1 where the step produces a score; null where it is self-reported only. */
  accuracy: number | null;
  /** 1 = Lost, 2 = Half, 3 = Got it. */
  rating?: 1 | 2 | 3;
  missedWords: string[];
  /** How many times the user replayed the clip on this step. */
  replays: number;
  /** True if the user revealed subtitles during a blind pass. */
  peeked: boolean;
  at: number;
}

export interface PlaybackSnapshot {
  time: number;
  rate: number;
  volume: number;
  muted: boolean;
  wasPlaying: boolean;
}

export interface ProgramRunState {
  definitionId: string;
  runMode: ProgramRunMode;
  videoId: string;
  /** The drill window, SUBTITLE timeline (what the user picked, segment-snapped). */
  window: ClipRange;
  steps: ResolvedStep[];
  stepIndex: number;
  phase: ProgramPhase;
  repeatsDone: number;
  /**
   * True when the next arm should pick up from the live playhead instead of
   * seeking back to clip.start. Set by `resume` — a user who tapped a word to
   * check its meaning expects the audio to carry on, not restart the sentence.
   */
  armInPlace: boolean;
  /** For SubtitlePolicy 'reveal', and for a manual peek. */
  revealed: boolean;
  /** Replays the user asked for on the current step. */
  replays: number;
  answers: Record<string, StepAnswer>;
  cycle: { index: number; nextTriggerAt: number; windowSec: number } | null;
  startedAt: number;
  error: string | null;
}

export type ProgramAction =
  | { type: 'start'; run: ProgramRunState }
  | { type: 'armed' }
  | { type: 'clip-ended' }
  | { type: 'gap-elapsed' }
  | { type: 'advance' }
  | { type: 'replay' }
  | { type: 'jump'; stepIndex: number }
  | { type: 'submit'; answer: StepAnswer }
  | { type: 'reveal'; manual: boolean }
  | { type: 'pause'; reason: 'user' | 'overlay' | 'external' }
  | { type: 'resume' }
  | { type: 'stall' }
  | { type: 'cycle-trigger'; window: ClipRange; steps: ResolvedStep[] }
  | { type: 'enter-cycle-idle'; nextTriggerAt: number }
  | { type: 'finish' }
  | { type: 'stop' };

/** What the host player reads to decide how to behave. */
export interface ProgramGate {
  running: boolean;
  /** The engine is the only thing allowed to call play()/pause() right now. */
  ownsTransport: boolean;
  /** Position-derived persistence must not fire. */
  suppressWrites: boolean;
  /** null = leave the user's own subtitle setting alone. */
  subtitleLock: boolean | null;
  /** False while a program that does not credit study time is running. */
  countStudyTime: boolean;
}

export const IDLE_GATE: ProgramGate = {
  running: false,
  ownsTransport: false,
  suppressWrites: false,
  subtitleLock: null,
  countStudyTime: true,
};
