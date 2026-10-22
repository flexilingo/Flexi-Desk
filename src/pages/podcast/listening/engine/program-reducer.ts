/**
 * The step machine. PURE — it decides, useProgramEngine executes.
 *
 * Nothing in this file may touch the audio element, localStorage, or the clock
 * beyond Date.now() for stamping answers. That separation is what makes a
 * double-play race impossible: two dispatches can never both start playback,
 * because dispatching does not start playback.
 */

import type {
  ProgramAction,
  ProgramGate,
  ProgramPhase,
  ProgramRunState,
  ResolvedStep,
} from '../types';

export type ProgramState = ProgramRunState | null;

function stepAt(state: ProgramRunState, i: number): ResolvedStep | undefined {
  return state.steps[i];
}

/** Phase a step should enter when it becomes current. */
function entryPhase(step: ResolvedStep | undefined): ProgramPhase {
  if (!step) return 'finished';
  return step.clip ? 'arming' : 'awaiting';
}

function goToStep(state: ProgramRunState, index: number): ProgramRunState {
  const step = stepAt(state, index);
  if (!step) {
    // A cycling run never "finishes" — it drops back to plain listening and
    // waits for the next trigger. Only a one-off run shows a summary.
    if (state.cycle) {
      return {
        ...state,
        phase: 'cycle-idle',
        steps: [],
        stepIndex: 0,
        repeatsDone: 0,
        replays: 0,
        armInPlace: false,
        revealed: false,
        cycle: { ...state.cycle, nextTriggerAt: state.window.end + state.cycle.windowSec },
      };
    }
    return { ...state, stepIndex: state.steps.length, phase: 'finished' };
  }
  return {
    ...state,
    stepIndex: index,
    phase: entryPhase(step),
    repeatsDone: 0,
    replays: 0,
    armInPlace: false,
    // 'reveal' steps start hidden; every other policy is decided by subtitleFor().
    revealed: false,
  };
}

export function programReducer(state: ProgramState, action: ProgramAction): ProgramState {
  if (action.type === 'start') return action.run;
  if (action.type === 'stop') return null;
  if (!state) return state;

  const step = stepAt(state, state.stepIndex);

  switch (action.type) {
    case 'armed':
      return state.phase === 'arming' ? { ...state, phase: 'playing' } : state;

    case 'clip-ended': {
      if (!step) return state;
      const repeatsDone = state.repeatsDone + 1;

      // More repeats to go: sit in the gap, engine re-arms when it elapses.
      if (repeatsDone < step.repeat) {
        return {
          ...state,
          repeatsDone,
          armInPlace: false,
          phase: step.gapMs > 0 ? 'gap' : 'arming',
        };
      }

      const revealed = step.subtitles === 'reveal' ? true : state.revealed;

      if (step.completion.on === 'clip-end') {
        return goToStep({ ...state, revealed }, state.stepIndex + 1);
      }
      // clip-end-then-continue / submit both park in 'awaiting'.
      return { ...state, repeatsDone, revealed, phase: 'awaiting' };
    }

    case 'gap-elapsed':
      return state.phase === 'gap' ? { ...state, phase: 'arming', armInPlace: false } : state;

    case 'advance':
      return goToStep(state, state.stepIndex + 1);

    case 'jump':
      return goToStep(state, action.stepIndex);

    /** Same step, play the clip again. Counted, never charged. */
    case 'replay':
      if (!step?.clip) return state;
      return {
        ...state,
        phase: 'arming',
        repeatsDone: 0,
        armInPlace: false,
        replays: state.replays + 1,
      };

    case 'submit': {
      if (!step) return state;
      const answers = {
        ...state.answers,
        [step.key]: { ...action.answer, replays: state.replays, peeked: state.revealed },
      };
      return goToStep({ ...state, answers }, state.stepIndex + 1);
    }

    case 'reveal':
      return { ...state, revealed: true };

    case 'pause':
      // 'finished' and 'cycle-idle' are not interruptible playback states.
      if (state.phase === 'finished' || state.phase === 'idle') return state;
      if (state.phase === 'paused') return state;
      return { ...state, phase: 'paused' };

    case 'resume': {
      if (state.phase !== 'paused') return state;
      if (!step) return { ...state, phase: 'finished' };
      // Carry on from the live playhead, keeping the repeat count. Pauses here
      // are almost always the user tapping a word to look it up — restarting
      // the sentence every time they check a meaning is maddening. The clip
      // player falls back to clip.start if the playhead has drifted outside.
      return { ...state, phase: step.clip ? 'arming' : 'awaiting', armInPlace: true };
    }

    case 'stall':
      return { ...state, phase: 'paused', error: 'STALLED' };

    case 'cycle-trigger':
      return {
        ...state,
        window: action.window,
        steps: action.steps,
        stepIndex: 0,
        phase: entryPhase(action.steps[0]),
        repeatsDone: 0,
        replays: 0,
        revealed: false,
        answers: {},
        cycle: state.cycle ? { ...state.cycle, index: state.cycle.index + 1 } : null,
      };

    case 'enter-cycle-idle':
      return {
        ...state,
        phase: 'cycle-idle',
        steps: [],
        stepIndex: 0,
        repeatsDone: 0,
        replays: 0,
        revealed: false,
        cycle: state.cycle ? { ...state.cycle, nextTriggerAt: action.nextTriggerAt } : null,
      };

    case 'finish':
      return { ...state, phase: 'finished' };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Derivations the host player and UI read. Kept here so the rules live next to
// the machine that produces the states they depend on.
// ---------------------------------------------------------------------------

export function currentStep(state: ProgramState): ResolvedStep | null {
  if (!state) return null;
  return state.steps[state.stepIndex] ?? null;
}

/** True while the engine is the only thing allowed to call play()/pause(). */
export function ownsTransport(state: ProgramState): boolean {
  if (!state) return false;
  return state.phase !== 'cycle-idle' && state.phase !== 'idle' && state.phase !== 'finished';
}

/**
 * Position-derived persistence must not fire while the engine is seeking.
 * In continuous mode's normal-playback stretches it fires as usual.
 */
export function suppressWrites(state: ProgramState): boolean {
  if (!state) return false;
  return state.phase !== 'cycle-idle' && state.phase !== 'idle';
}

/** null = leave the user's own subtitle setting alone. */
export function subtitleLockFor(state: ProgramState): boolean | null {
  const step = currentStep(state);
  if (!state || !step) return null;
  if (state.phase === 'cycle-idle' || state.phase === 'finished') return null;

  switch (step.subtitles) {
    case 'user':
      return null;
    case 'on':
      return true;
    case 'off':
      // A manual peek wins — we report it, we don't fight it.
      return state.revealed ? true : false;
    case 'reveal':
      return state.revealed;
    default:
      return null;
  }
}

export function gateFor(state: ProgramState, countStudyTime: boolean): ProgramGate {
  return {
    running: !!state,
    ownsTransport: ownsTransport(state),
    suppressWrites: suppressWrites(state),
    subtitleLock: subtitleLockFor(state),
    countStudyTime,
  };
}

/** Steps the rail draws dots for — the no-audio review step is not one of them. */
export function railSteps(state: ProgramState): ResolvedStep[] {
  return state?.steps ?? [];
}

export function isBlindStep(step: ResolvedStep | null): boolean {
  return !!step && (step.subtitles === 'off' || step.subtitles === 'reveal');
}
