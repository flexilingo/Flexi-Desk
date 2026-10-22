import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { getPlayerAudio, setProgressSuppressed, usePlayerStore } from '../../stores/playerStore';
import type { SyncPoint } from '../../types';
import { compileProgram } from '../lib/compile-program';
import {
  clearPersistedProgram,
  loadPersistedProgram,
  savePersistedProgram,
} from '../lib/programPersistence';
import { windowEndingAt, windowStartingAt, type TranscriptSegment } from '../lib/clip-math';
import { getProgram } from '../lib/programs';
import type {
  ClipRange,
  PlaybackSnapshot,
  ProgramGate,
  ProgramRunMode,
  ProgramRunState,
  ResolvedStep,
  StepAnswer,
} from '../types';
import { IDLE_GATE } from '../types';
import { currentStep as selectCurrentStep, gateFor, programReducer } from './program-reducer';
import { useClipPlayer } from './useClipPlayer';

export interface StartOptions {
  definitionId: string;
  runMode: ProgramRunMode;
  /** Length of the drill window in seconds. */
  windowSec: number;
  /** Where to start from, SUBTITLE timeline. Defaults to the live position. */
  fromSec?: number;
}

interface ProgramActions {
  start: (opts: StartOptions) => void;
  stop: () => void;
  advance: () => void;
  replay: () => void;
  submit: (answer: Omit<StepAnswer, 'replays' | 'peeked' | 'at'>) => void;
  reveal: () => void;
  pause: () => void;
  resume: () => void;
  /** The host reports its overlay state; the engine decides what to do about it. */
  setHostOverlayOpen: (open: boolean) => void;
  /** Segments for the current episode, so the launcher can preview a window. */
  getSegments: () => TranscriptSegment[];
  /** Resolve a window without starting, for the launcher's duration estimate. */
  previewWindow: (
    fromSec: number,
    windowSec: number,
  ) => { range: ClipRange; indices: number[] } | null;
}

interface ProgramStateValue {
  run: ProgramRunState | null;
  step: ResolvedStep | null;
  segments: TranscriptSegment[];
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** Bumped every time the engine wants a fresh arm of the current clip. */
  armToken: number;
  /** A saved run for this episode, offered as "resume" rather than auto-resumed. */
  resumable: { definitionId: string; stepIndex: number; total: number } | null;
  dismissResumable: () => void;
}

const ProgramActionsContext = createContext<ProgramActions | null>(null);
const ProgramGateContext = createContext<ProgramGate>(IDLE_GATE);
const ProgramStateContext = createContext<ProgramStateValue | null>(null);

const NOOP_ACTIONS: ProgramActions = {
  start: () => {},
  stop: () => {},
  advance: () => {},
  replay: () => {},
  submit: () => {},
  reveal: () => {},
  pause: () => {},
  resume: () => {},
  setHostOverlayOpen: () => {},
  getSegments: () => [],
  previewWindow: () => null,
};

/**
 * Safe outside the provider — when the feature flag is off ProgramProvider is a
 * pass-through, and the host player still calls this unconditionally.
 */
export function useProgramActions(): ProgramActions {
  return useContext(ProgramActionsContext) ?? NOOP_ACTIONS;
}

/** Safe outside the provider — returns the idle gate. */
export function useProgramGate(): ProgramGate {
  return useContext(ProgramGateContext);
}

export function useProgramState(): ProgramStateValue | null {
  return useContext(ProgramStateContext);
}

interface ProgramProviderProps {
  /** The local episode id: the run is keyed by it. */
  videoId: string;
  enabled: boolean;
  /** The episode's lines on the SUBTITLE timeline, in seconds. */
  segments: TranscriptSegment[];
  syncPoints: SyncPoint[];
  children: React.ReactNode;
}

export function ProgramProvider({
  videoId,
  enabled,
  segments,
  syncPoints,
  children,
}: ProgramProviderProps) {
  // The one audio element the player owns.
  const audioRef = useRef<HTMLAudioElement | null>(getPlayerAudio());
  const [run, dispatch] = useReducer(programReducer, null);

  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const syncPointsRef = useRef(syncPoints);
  syncPointsRef.current = syncPoints;

  const snapshotRef = useRef<PlaybackSnapshot | null>(null);
  const runRef = useRef<ProgramRunState | null>(null);
  runRef.current = run;
  const [armToken, bumpArm] = useReducer((n: number) => n + 1, 0);

  const step = selectCurrentStep(run);
  const definition = run ? getProgram(run.definitionId) : undefined;
  const countStudyTime = definition?.countStudyTime ?? true;
  const gate = useMemo(() => gateFor(run, countStudyTime), [run, countStudyTime]);

  // -------------------------------------------------------------------------
  // Suppression — the three position-derived write paths.
  // Study time is deliberately NOT suppressed: it counts wall-clock seconds
  // while playing, and replaying a clip five times really is five clips of study.
  // -------------------------------------------------------------------------
  useEffect(() => {
    setProgressSuppressed(gate.suppressWrites);
    return () => setProgressSuppressed(false);
  }, [gate.suppressWrites]);

  // The control bar and mini player read `isPlaying` from the store, but the clip player drives the
  // element directly: mirror the element's real state into the store while a run is on.
  const running = !!run;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !running) return;
    const sync = () => usePlayerStore.setState({ isPlaying: !audio.paused });
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    return () => {
      audio.removeEventListener('play', sync);
      audio.removeEventListener('pause', sync);
    };
  }, [running]);

  // -------------------------------------------------------------------------
  // Snapshot / restore. Only the <audio> element is ever mutated, so only it is
  // snapshotted — subtitle/focus/auto-pause are read-time overrides that we
  // never write, which is why a crash cannot mangle the user's preferences.
  // -------------------------------------------------------------------------
  const restore = useCallback(
    (snap: PlaybackSnapshot, runMode: ProgramRunMode) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.playbackRate = snap.rate;
      audio.volume = snap.volume;
      audio.muted = snap.muted;
      // Un-suppress BEFORE writing the position so the right value lands in
      // localStorage.
      setProgressSuppressed(false);
      // 'continuous' legitimately advanced through the episode; only 'focused'
      // rewinds to where the user was.
      if (runMode === 'focused') audio.currentTime = snap.time;
      if (snap.wasPlaying) audio.play().catch(() => {});
      usePlayerStore.setState({ isPlaying: snap.wasPlaying, currentTime: audio.currentTime });
    },
    [audioRef],
  );

  const stop = useCallback(() => {
    const snap = snapshotRef.current;
    const mode = runRef.current?.runMode ?? 'focused';
    snapshotRef.current = null;
    clearPersistedProgram();
    dispatch({ type: 'stop' });
    if (snap) restore(snap, mode);
  }, [restore]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Unmount / episode switch / page hide. Reads from a ref so an abrupt unmount
  // still sees the snapshot.
  useEffect(() => {
    return () => {
      const snap = snapshotRef.current;
      if (snap) {
        snapshotRef.current = null;
        restore(snap, runRef.current?.runMode ?? 'focused');
      }
      setProgressSuppressed(false);
    };
  }, [restore]);

  useEffect(() => {
    // Episode changed under a running program: end it cleanly. Both refs are
    // deliberately read rather than depended on — this must fire on videoId
    // alone, never on a run/stop identity change.
    if (runRef.current) stopRef.current();
  }, [videoId]);

  useEffect(() => {
    // pagehide, not beforeunload — iOS Safari never fires beforeunload.
    const onHide = () => {
      const snap = snapshotRef.current;
      if (!snap) return;
      setProgressSuppressed(false);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // -------------------------------------------------------------------------
  // Persistence — written at step boundaries only, never on a tick.
  // Resume is offered, never automatic: auto-seeking on page load would break
  // "normal playback is unchanged".
  // -------------------------------------------------------------------------
  const [resumableDismissed, dismissResumable] = useReducer(() => true, false);
  const persisted = useMemo(
    () => (enabled && !resumableDismissed ? loadPersistedProgram(videoId) : null),
    [enabled, videoId, resumableDismissed],
  );
  const resumable = useMemo(() => {
    if (!persisted || run) return null;
    const def = getProgram(persisted.definitionId);
    if (!def) return null;
    return {
      definitionId: persisted.definitionId,
      stepIndex: persisted.stepIndex,
      total: persisted.totalSteps,
    };
  }, [persisted, run]);

  useEffect(() => {
    if (!run || !snapshotRef.current) return;
    savePersistedProgram({
      v: 1,
      videoId: run.videoId,
      definitionId: run.definitionId,
      runMode: run.runMode,
      window: run.window,
      stepIndex: run.stepIndex,
      totalSteps: run.steps.length,
      answers: run.answers,
      cycle: run.cycle,
      snapshot: snapshotRef.current,
      savedAt: Date.now(),
    });
    // Step boundaries only — never on a tick. `run` itself is intentionally not
    // a dep: every field change would write, which is what "never on a tick"
    // rules out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.stepIndex, run?.phase]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const previewWindow = useCallback((fromSec: number, windowSec: number) => {
    return windowStartingAt(segmentsRef.current, fromSec, windowSec);
  }, []);

  const start = useCallback(
    ({ definitionId, runMode, windowSec, fromSec }: StartOptions) => {
      const audio = audioRef.current;
      const def = getProgram(definitionId);
      if (!audio || !def) return;

      snapshotRef.current = {
        time: audio.currentTime,
        rate: audio.playbackRate,
        volume: audio.volume,
        muted: audio.muted,
        wasPlaying: !audio.paused,
      };

      const at = fromSec ?? audio.currentTime;

      if (runMode === 'continuous') {
        // Nothing about playback changes yet. ownsTransport and suppressWrites
        // are both false in cycle-idle.
        dispatch({
          type: 'start',
          run: {
            definitionId,
            runMode,
            videoId,
            window: { start: at, end: at },
            steps: [],
            stepIndex: 0,
            phase: 'cycle-idle',
            repeatsDone: 0,
            armInPlace: false,
            revealed: false,
            replays: 0,
            answers: {},
            cycle: { index: 0, nextTriggerAt: at + windowSec, windowSec },
            startedAt: Date.now(),
            error: null,
          },
        });
        return;
      }

      const win = windowStartingAt(segmentsRef.current, at, windowSec);
      if (!win) return;
      const steps = compileProgram({
        definition: def,
        window: win.range,
        windowIndices: win.indices,
        segments: segmentsRef.current,
        syncPoints: syncPointsRef.current,
      });
      if (!steps.length) return;

      dispatch({
        type: 'start',
        run: {
          definitionId,
          runMode,
          videoId,
          window: win.range,
          steps,
          stepIndex: 0,
          phase: steps[0].clip ? 'arming' : 'awaiting',
          repeatsDone: 0,
          armInPlace: false,
          revealed: false,
          replays: 0,
          answers: {},
          cycle: null,
          startedAt: Date.now(),
          error: null,
        },
      });
      bumpArm();
    },
    [audioRef, videoId],
  );

  const advance = useCallback(() => {
    dispatch({ type: 'advance' });
    bumpArm();
  }, []);

  const replay = useCallback(() => {
    dispatch({ type: 'replay' });
    bumpArm();
  }, []);

  const submit = useCallback((answer: Omit<StepAnswer, 'replays' | 'peeked' | 'at'>) => {
    dispatch({
      type: 'submit',
      answer: { ...answer, replays: 0, peeked: false, at: Date.now() },
    });
    bumpArm();
  }, []);

  const reveal = useCallback(() => dispatch({ type: 'reveal', manual: true }), []);
  const pause = useCallback(() => {
    audioRef.current?.pause();
    dispatch({ type: 'pause', reason: 'user' });
  }, [audioRef]);
  const resume = useCallback(() => {
    dispatch({ type: 'resume' });
    bumpArm();
  }, []);

  const hostOverlayRef = useRef(false);
  const setHostOverlayOpen = useCallback(
    (open: boolean) => {
      if (hostOverlayRef.current === open) return;
      hostOverlayRef.current = open;
      if (!runRef.current) return;
      if (open) {
        audioRef.current?.pause();
        dispatch({ type: 'pause', reason: 'overlay' });
      } else {
        dispatch({ type: 'resume' });
        bumpArm();
      }
    },
    [audioRef],
  );

  const getSegments = useCallback(() => segmentsRef.current, []);

  // -------------------------------------------------------------------------
  // Clip playback
  // -------------------------------------------------------------------------
  const clipActive = run?.phase === 'arming' || run?.phase === 'playing';

  /**
   * The look-back drill: work on the N minutes the user just heard. Reached
   * only after a first session, when they have opted into "keep drilling".
   */
  const fireCycleDrill = useCallback((triggerAt: number) => {
    const state = runRef.current;
    if (!state?.cycle) return;
    const def = getProgram(state.definitionId);
    const win = windowEndingAt(segmentsRef.current, triggerAt, state.cycle.windowSec);
    if (!def || !win) return;
    const steps = compileProgram({
      definition: def,
      window: win.range,
      windowIndices: win.indices,
      segments: segmentsRef.current,
      syncPoints: syncPointsRef.current,
    });
    if (!steps.length) return;
    dispatch({ type: 'cycle-trigger', window: win.range, steps });
    bumpArm();
  }, []);

  const handleEnd = useCallback(() => {
    const state = runRef.current;
    if (!state) return;
    const s = state.steps[state.stepIndex];
    dispatch({ type: 'clip-ended' });

    // More repeats to run: re-arm after the gap.
    if (s && state.repeatsDone + 1 < s.repeat) {
      window.setTimeout(() => {
        dispatch({ type: 'gap-elapsed' });
        bumpArm();
      }, s.gapMs);
      return;
    }
    // Auto-advancing steps need a fresh arm for whatever comes next.
    if (s?.completion.on === 'clip-end') bumpArm();
  }, []);

  const handleExternalSeek = useCallback(() => {
    dispatch({ type: 'pause', reason: 'external' });
  }, []);
  const handleExternalPause = useCallback(() => {
    dispatch({ type: 'pause', reason: 'external' });
  }, []);
  const handleStall = useCallback(() => dispatch({ type: 'stall' }), []);
  const handleArmed = useCallback(() => dispatch({ type: 'armed' }), []);

  /**
   * cycle-idle deliberately does NOT go through useClipPlayer.
   *
   * That hook seeks and plays; in cycle-idle the contract is that playback is
   * completely untouched — ownsTransport and suppressWrites are both false and
   * the user is just listening. So this is a passive watcher: it polls the
   * playhead and fires the drill when it passes the trigger, and touches
   * nothing else.
   */
  const cycleTriggerAt = run?.phase === 'cycle-idle' ? (run.cycle?.nextTriggerAt ?? null) : null;
  useEffect(() => {
    if (cycleTriggerAt === null) return;
    const id = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      if (audio.currentTime >= cycleTriggerAt) fireCycleDrill(cycleTriggerAt);
    }, 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleTriggerAt]);

  useClipPlayer({
    audioRef,
    clip: clipActive ? (step?.clip ?? null) : null,
    rate: step?.rate ?? 1,
    active: clipActive,
    armToken,
    armInPlace: run?.armInPlace ?? false,
    onArmed: handleArmed,
    onEnd: handleEnd,
    onExternalSeek: handleExternalSeek,
    onExternalPause: handleExternalPause,
    onStall: handleStall,
  });

  // -------------------------------------------------------------------------
  // Context values
  // -------------------------------------------------------------------------
  const actions = useMemo<ProgramActions>(
    () => ({
      start,
      stop,
      advance,
      replay,
      submit,
      reveal,
      pause,
      resume,
      setHostOverlayOpen,
      getSegments,
      previewWindow,
    }),
    [
      start,
      stop,
      advance,
      replay,
      submit,
      reveal,
      pause,
      resume,
      setHostOverlayOpen,
      getSegments,
      previewWindow,
    ],
  );

  const stateValue = useMemo<ProgramStateValue>(
    () => ({ run, step, segments, audioRef, armToken, resumable, dismissResumable }),
    [run, step, segments, audioRef, armToken, resumable],
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <ProgramActionsContext.Provider value={actions}>
      <ProgramGateContext.Provider value={gate}>
        <ProgramStateContext.Provider value={stateValue}>{children}</ProgramStateContext.Provider>
      </ProgramGateContext.Provider>
    </ProgramActionsContext.Provider>
  );
}
