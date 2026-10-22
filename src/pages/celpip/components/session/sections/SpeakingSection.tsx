import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Mic,
  Square,
  X,
  ZoomIn,
  Loader2,
  RefreshCw,
  MicOff,
  CloudUpload,
  CheckCircle2,
  Info,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SpeakingPrompts } from '../../../types';
import { LookupText } from '../WordLookup';
import { ExamText } from '../ExamText';
import { saveDraft, loadDraft } from '../../../services/examDraft';
import { useCelpipStore, errorCodeOf } from '../../../stores/celpipStore';
import { MicAccessPanel } from '@/components/mic/MicAccessPanel';
import MicLevelBars from '@/components/mic/MicLevelBars';
import MicLevelCheck from '../../speaking/MicLevelCheck';
import { ConfirmDialog } from '../ConfirmDialog';
import { pretranscribeTask } from '../../../services/celpipCloud';
import { micFailureOf, readMicLevel, type MicFailure } from '../../../services/micProbe';
import {
  LEVEL_POLL_MS,
  QuietWatch,
  TakeMeter,
  everyTakeSilent,
  isSilentTake,
  levelFraction,
  type TakeVerdict,
} from '../../../utils/micLevel';
import { withUploadRetry } from '../../../utils/uploadRetry';

// Real-exam flow: each task starts its preparation countdown the moment it
// appears; recording starts automatically when prep ends; after the answer is
// saved the next task appears automatically. No start/next buttons.
//
// The desk difference from the web original: audio is captured natively by Rust
// (`celpip_record_*`) instead of the browser MediaRecorder, and the fallback
// transcript comes from a LOCAL Whisper model (`celpip_transcribe_recording`)
// rather than the Web Speech API. The recorded file lives in Rust keyed by
// (sessionId, taskKey), so transcribe/upload/retry all reference that key — no
// blob is ever held in JS.
type TaskState =
  | 'prompt' // learning mode only — read freely, recording starts on demand
  | 'prep' // reading time — countdown runs, recording starts on expiry
  | 'recording' // native mic recording with countdown, early stop allowed
  | 'saving' // transcribing + uploading the recording
  | 'saved' // learning mode only — answer stored, user advances manually
  | 'save-error' // transcribe/upload failed — retry or continue with fallback transcript
  | 'mic-error' // recorder failed to start — unblock steps, try again, or skip
  | 'silent' // the answer was (nearly) inaudible — record again or keep it
  | 'done'; // all tasks answered — section submitted

type SavingPhase = 'transcribing' | 'uploading';

interface AudioAnswer {
  audio_url: string;
  duration_sec: number;
}

// Learning mode has no exam timers, but an unbounded recording still needs a
// safety cap so an abandoned mic doesn't record forever.
const LEARNING_MAX_RECORDING_SEC = 300;

const DEV_PLACEHOLDER =
  'This is a dev skip placeholder transcript used only for end-to-end flow testing of the exam pipeline.';

interface SpeakingSectionProps {
  sessionId: string;
  prompts: SpeakingPrompts;
  /** Called once the section has been submitted successfully. */
  onComplete?: () => void;
  /** Untimed relaxed mode: manual start/stop/next, no prep countdown. */
  learningMode?: boolean;
  /** Storage folder under `<user>/` for the recordings (celpip | tcf | tcf_quebec | tcf_irn). */
  recordingSegment?: string;
  /** TCF: a task with no preparation time starts recording at once, with no zero countdown. */
  startWithoutPrep?: boolean;
  /** Language of the exam content: the `lang` attribute and the local Whisper language. */
  contentLang?: 'en' | 'fr';
}

export default function SpeakingSection({
  sessionId,
  prompts,
  onComplete,
  learningMode = false,
  recordingSegment = 'celpip',
  startWithoutPrep = false,
  contentLang,
}: SpeakingSectionProps) {
  const { t } = useTranslation('celpip');
  const submit = useCelpipStore((s) => s.submit);
  const isSubmitting = useCelpipStore((s) => s.isSubmitting);

  const [taskIndex, setTaskIndex] = useState(0);
  const [taskState, setTaskState] = useState<TaskState>('prep');
  const [savingPhase, setSavingPhase] = useState<SavingPhase>('uploading');
  const [countdown, setCountdown] = useState(0);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [audioAnswers, setAudioAnswers] = useState<Record<string, AudioAnswer>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Quiet inline notice: local Whisper isn't configured, so the backend will
  // transcribe the uploaded audio instead. Not an error — the answer is saved.
  const [whisperNotice, setWhisperNotice] = useState(false);
  // Why the recorder could not start (drives the unblock steps).
  const [micFailure, setMicFailure] = useState<MicFailure>('denied');
  // Live level while recording: the bars, and the "too quiet" warning.
  const [micLevel, setMicLevel] = useState(0);
  const [micQuiet, setMicQuiet] = useState(false);
  // Every task so far silent: offer the microphone test beside the question.
  const [silentAll, setSilentAll] = useState(false);
  // The microphone died mid-section: skip what is left in one go.
  const [skipRestOpen, setSkipRestOpen] = useState(false);
  const { t: tx } = useTranslation('exam');

  const startTime = useRef<number>(0);
  const recordStartRef = useRef<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const submittedRef = useRef(false);
  // Async handlers (countdown expiry, save callbacks) must read the latest
  // values — mirror the answer maps in refs.
  const transcriptsRef = useRef<Record<string, string>>({});
  const audioAnswersRef = useRef<Record<string, AudioAnswer>>({});
  // Stash enough to resume a failed save: the native file still exists in Rust,
  // so we only need the measured duration and whatever transcript we already got.
  const pendingSaveRef = useRef<{ durationSec: number; transcript: string } | null>(null);
  // The meter of the answer being recorded, the verdict of each task so far this page load,
  // and the silent answer waiting for "record again" / "continue anyway".
  const takeMeterRef = useRef<TakeMeter | null>(null);
  const takeVerdictsRef = useRef<Record<string, TakeVerdict>>({});
  const silentTakeRef = useRef<{
    durationSec: number;
    transcript: string;
    whisperUnavailable: boolean;
  } | null>(null);

  const currentTask = prompts.tasks[taskIndex];
  const isLastTask = taskIndex >= prompts.tasks.length - 1;
  const taskKey = `task_${taskIndex}`;

  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const startCountdown = (seconds: number, onDone: () => void) => {
    clearCountdown();
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearCountdown();
          onDone();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const setTranscriptFor = (key: string, text: string) => {
    const next = { ...transcriptsRef.current, [key]: text };
    transcriptsRef.current = next;
    setTranscripts(next);
  };

  const setAudioAnswerFor = (key: string, answer: AudioAnswer) => {
    const next = { ...audioAnswersRef.current, [key]: answer };
    audioAnswersRef.current = next;
    setAudioAnswers(next);
  };

  // Final payload: audio answers where we have them, transcript text otherwise
  // (save-failure fallback). The backend re-transcribes audio
  // answers server-side and uses string answers as the transcript directly. We
  // still pass `transcripts` so a failed server-side Whisper falls back to the
  // local one.
  const submitSection = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setTaskState('done');
    const answers: Record<string, unknown> = {};
    prompts.tasks.forEach((_, i) => {
      const k = `task_${i}`;
      answers[k] = audioAnswersRef.current[k] ?? transcriptsRef.current[k] ?? '';
    });
    const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
    // The draft stays until the server holds the answers (the store clears it).
    const ok = await submit({
      session_id: sessionId,
      section_type: 'speaking',
      answers,
      time_spent_sec: timeSpent,
      transcripts: transcriptsRef.current,
    });
    if (ok) {
      onComplete?.();
    } else {
      // Stay on the `done` screen with a retry button.
      submittedRef.current = false;
    }
  };

  const retrySubmit = () => {
    submittedRef.current = false;
    void submitSection();
  };

  const advanceOrSubmit = () => {
    if (isLastTask) void submitSection();
    else setTaskIndex((i) => i + 1);
  };

  // Learning mode pauses after each saved answer (manual Next); the real exam
  // advances automatically.
  const finishTask = () => {
    if (learningMode) setTaskState('saved');
    else advanceOrSubmit();
  };

  const commitTranscriptOnly = (text: string) => {
    setTranscriptFor(taskKey, text);
    finishTask();
  };

  // Every task not answered yet goes in unanswered, and the section is submitted:
  // with no microphone, eight one-by-one skips is no way to finish an exam.
  const skipRestOfSection = () => {
    setSkipRestOpen(false);
    prompts.tasks.forEach((_, i) => {
      const k = `task_${i}`;
      if (i >= taskIndex && audioAnswersRef.current[k] === undefined) setTranscriptFor(k, '');
    });
    void submitSection();
  };

  // Transcribe (local Whisper) then upload the native recording. Both steps
  // reference the Rust-side file keyed by (sessionId, taskKey), so a retry just
  // re-runs them.
  const processRecording = async (durationSec: number) => {
    setWhisperNotice(false);
    setTaskState('saving');

    // Step 1 — local Whisper transcript. WHISPER_NOT_CONFIGURED is NOT a
    // failure: upload the audio anyway with an empty transcript and let the
    // backend transcribe it. Any other error means the recording is unusable.
    setSavingPhase('transcribing');
    let transcript = '';
    let whisperUnavailable = false;
    try {
      transcript = await invoke<string>('celpip_transcribe_recording', {
        sessionId,
        taskKey,
        language: contentLang ?? 'en',
      });
    } catch (err) {
      if (errorCodeOf(err) === 'WHISPER_NOT_CONFIGURED') {
        whisperUnavailable = true;
      } else {
        pendingSaveRef.current = { durationSec, transcript: '' };
        setTaskState('save-error');
        return;
      }
    }

    // A (nearly) silent answer stops here and asks, instead of being saved and
    // scored as silence: five exam takers had answers scored as no speech, two
    // recorded all eight tasks silently and got CLB 1. The local transcript
    // overrules the meter - words heard means the meter is the one that is wrong.
    const verdict: TakeVerdict = takeMeterRef.current?.verdict() ?? 'unmeasured';
    takeMeterRef.current = null;
    if (isSilentTake(verdict, transcript)) {
      silentTakeRef.current = { durationSec, transcript, whisperUnavailable };
      const earlier = Array.from(
        { length: taskIndex },
        (_, i) => takeVerdictsRef.current[`task_${i}`],
      );
      setSilentAll(everyTakeSilent([...earlier, 'silent']));
      setTaskState('silent');
      return;
    }
    takeVerdictsRef.current[taskKey] = verdict === 'silent' ? 'heard' : verdict;
    await uploadRecording(durationSec, transcript, whisperUnavailable);
  };

  // Step 2 — upload the audio file and keep its public URL. A dropped connection
  // is retried by itself (after waiting for the computer to be online again).
  const uploadRecording = async (
    durationSec: number,
    transcript: string,
    whisperUnavailable: boolean,
  ) => {
    setTaskState('saving');
    setSavingPhase('uploading');
    try {
      const audioUrl = await withUploadRetry(() =>
        invoke<string>('celpip_upload_recording', {
          sessionId,
          taskKey,
          segment: recordingSegment,
        }),
      );
      setWhisperNotice(whisperUnavailable);
      setAudioAnswerFor(taskKey, { audio_url: audioUrl, duration_sec: durationSec });
      setTranscriptFor(taskKey, transcript);
      // The server transcribes this answer while the learner records the next one,
      // so scoring has nothing left to transcribe. A failure is harmless.
      void pretranscribeTask({
        session_id: sessionId,
        task_key: taskKey,
        audio_url: audioUrl,
      }).catch(() => {});
      finishTask();
    } catch {
      pendingSaveRef.current = { durationSec, transcript };
      setTaskState('save-error');
    }
  };

  // "Continue anyway": keep the silent answer - saved and scored like any other.
  const keepSilentTake = () => {
    const take = silentTakeRef.current;
    silentTakeRef.current = null;
    if (!take) return;
    takeVerdictsRef.current[taskKey] = 'silent';
    void uploadRecording(take.durationSec, take.transcript, take.whisperUnavailable);
  };

  // "Record again": throw the silent answer away and run the task again.
  const rerecordSilentTake = () => {
    silentTakeRef.current = null;
    delete takeVerdictsRef.current[taskKey];
    void startRecording();
  };

  const stopRecording = async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    clearCountdown();
    setTaskState('saving');
    setSavingPhase('transcribing');
    let durationSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
    try {
      const res = await invoke<{ local_path: string; duration_sec: number }>('celpip_record_stop', {
        sessionId,
        taskKey,
      });
      if (res?.duration_sec) durationSec = Math.max(1, Math.round(res.duration_sec));
    } catch {
      // NO_ACTIVE_RECORDING — nothing captured. processRecording will surface a
      // save-error (RECORDING_NOT_FOUND) where the user can continue without audio.
    }
    await processRecording(durationSec);
  };

  const startRecording = async () => {
    setTaskState('recording');
    try {
      try {
        await invoke('celpip_record_start', { sessionId, taskKey });
      } catch (err) {
        // A stale recording from a previous attempt — discard it and retry once.
        if (errorCodeOf(err) === 'RECORDING_ALREADY_ACTIVE') {
          await invoke('celpip_record_cancel').catch(() => {});
          await invoke('celpip_record_start', { sessionId, taskKey });
        } else {
          throw err;
        }
      }
      recordStartRef.current = Date.now();
      stoppingRef.current = false;
      takeMeterRef.current = new TakeMeter();
      setMicQuiet(false);
      startCountdown(
        learningMode ? LEARNING_MAX_RECORDING_SEC : currentTask.speaking_seconds,
        () => void stopRecording(),
      );
    } catch (err) {
      setMicFailure(micFailureOf(err));
      setTaskState('mic-error');
    }
  };

  // While recording: read the native level, feed the quiet watch (live warning)
  // and the take meter (verdict when the answer ends).
  useEffect(() => {
    if (taskState !== 'recording') {
      setMicLevel(0);
      return;
    }
    const watch = new QuietWatch(Date.now());
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      readMicLevel()
        .then((dbfs) => {
          setMicLevel(levelFraction(dbfs));
          takeMeterRef.current?.push(dbfs);
          setMicQuiet(watch.push(Date.now(), dbfs));
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, LEVEL_POLL_MS);
    return () => clearInterval(timer);
  }, [taskState]);

  const retryUpload = () => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    void processRecording(pending.durationSec);
  };

  const continueWithoutAudio = () => {
    const fallback = pendingSaveRef.current?.transcript ?? '';
    pendingSaveRef.current = null;
    commitTranscriptOnly(fallback);
  };

  // Restore draft on mount; cancel any in-flight native recording + clear the
  // countdown on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraft(sessionId, 'speaking');
      if (cancelled) return;
      if (draft) {
        const restoredTr = (draft.answers as Record<string, string>) || {};
        const restoredAudio = draft.audioAnswers || {};
        transcriptsRef.current = restoredTr;
        audioAnswersRef.current = restoredAudio;
        setTranscripts(restoredTr);
        setAudioAnswers(restoredAudio);
        // Resume at the first task with no saved answer yet.
        const firstUnanswered = prompts.tasks.findIndex(
          (_, i) =>
            restoredAudio[`task_${i}`] === undefined && restoredTr[`task_${i}`] === undefined,
        );
        setTaskIndex(firstUnanswered === -1 ? prompts.tasks.length - 1 : firstUnanswered);
        startTime.current = draft.sectionStartedAt || Date.now();
      } else {
        startTime.current = Date.now();
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      clearCountdown();
      void invoke('celpip_record_cancel').catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-exam behaviour: the prep countdown starts the moment a task appears.
  useEffect(() => {
    if (!ready || !currentTask) return;
    const k = `task_${taskIndex}`;
    if (audioAnswersRef.current[k] !== undefined || transcriptsRef.current[k] !== undefined) {
      // Already answered (restored draft) — move on.
      if (taskIndex < prompts.tasks.length - 1) setTaskIndex((i) => i + 1);
      else void submitSection();
      return;
    }
    setWhisperNotice(false);
    if (learningMode) {
      // Untimed: read the task freely, start when ready.
      setTaskState('prompt');
      return;
    }
    // A task with no preparation time (TCF tasks 1 and 3) records at once.
    if (startWithoutPrep && !(currentTask.prep_seconds > 0)) {
      void startRecording();
      return;
    }
    setTaskState('prep');
    startCountdown(currentTask.prep_seconds, () => void startRecording());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, taskIndex]);

  // Save draft on state changes.
  useEffect(() => {
    if (startTime.current === 0 || !ready) return;
    void saveDraft(sessionId, 'speaking', {
      partIndex: 0,
      currentQuestion: 0,
      taskIndex,
      answers: transcripts,
      audioAnswers,
      sectionStartedAt: startTime.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex, transcripts, audioAnswers, ready]);

  // DEV ONLY — fast-forward the current sub-stage without waiting for timers.
  const isDev = import.meta.env.DEV;
  const handleDevSkip = () => {
    if (taskState === 'prompt') {
      commitTranscriptOnly(DEV_PLACEHOLDER);
    } else if (taskState === 'saved') {
      advanceOrSubmit();
    } else if (taskState === 'prep') {
      clearCountdown();
      commitTranscriptOnly(DEV_PLACEHOLDER);
    } else if (taskState === 'recording') {
      void stopRecording();
    } else if (taskState === 'save-error') {
      continueWithoutAudio();
    } else if (taskState === 'mic-error') {
      commitTranscriptOnly('');
    } else if (taskState === 'silent') {
      keepSilentTake();
    }
  };
  const devSkipLabel =
    taskState === 'prompt'
      ? 'Fake answer'
      : taskState === 'saved'
        ? 'Next task'
        : taskState === 'prep'
          ? 'Fake answer'
          : taskState === 'recording'
            ? 'Stop recording'
            : taskState === 'save-error'
              ? 'Skip upload'
              : taskState === 'mic-error'
                ? 'Skip task'
                : 'Waiting';

  if (!currentTask) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {t('task')} {taskIndex + 1} / {prompts.tasks.length}
          </span>
        </div>
        <div className="flex gap-1">
          {prompts.tasks.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < taskIndex ? 'bg-primary' : i === taskIndex ? 'bg-primary/50' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Task content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center p-8 min-h-full justify-center">
          <div
            className={`w-full ${currentTask.type === 'comparing_persuading' ? 'max-w-2xl' : 'max-w-lg'}`}
          >
            <h3 lang={contentLang} className="text-lg font-semibold text-foreground mb-2">
              {currentTask.title}
            </h3>

            {/* Context / situation */}
            {currentTask.situation && (
              <ExamText
                as="div"
                base={14}
                className="bg-muted border border-border rounded-lg px-4 py-3 mb-4 text-foreground"
              >
                <LookupText text={currentTask.situation} />
              </ExamText>
            )}

            {/* Task 5: Two option images side by side */}
            {currentTask.type === 'comparing_persuading' &&
              currentTask.option_a &&
              currentTask.option_b && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[currentTask.option_a, currentTask.option_b].map((opt, i) => (
                    <div key={i} className="border border-border rounded-lg overflow-hidden">
                      {opt.image_url ? (
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(opt.image_url!)}
                          className="relative w-full aspect-square group block"
                        >
                          <img
                            src={opt.image_url}
                            alt={opt.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ) : (
                        <div className="w-full aspect-square bg-muted flex items-center justify-center">
                          <span className="text-xs text-muted-foreground text-center px-2">
                            {opt.label}
                          </span>
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-semibold text-foreground">{opt.label}</p>
                        <ExamText base={12} className="text-muted-foreground mt-0.5">
                          <LookupText text={opt.description} />
                        </ExamText>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {/* Tasks 3, 4, 8: Single image */}
            {currentTask.image_url && currentTask.type !== 'comparing_persuading' && (
              <button
                type="button"
                onClick={() => setLightboxUrl(currentTask.image_url!)}
                className="relative w-full mb-4 rounded-lg overflow-hidden border border-border group block"
              >
                <img
                  src={currentTask.image_url}
                  alt="Speaking task scene"
                  className="w-full object-cover max-h-64"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            )}

            {/* Topic for Task 7 */}
            {currentTask.topic && (
              <ExamText
                as="div"
                base={14}
                className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 mb-4 font-medium text-foreground"
              >
                <LookupText text={currentTask.topic} />
              </ExamText>
            )}

            {/* TCF tasks carry a consigne (and, for the entretien, the examiner's
                guiding questions) instead of a prompt. */}
            <div lang={contentLang}>
              {currentTask.consigne ? (
                <>
                  <ExamText base={15} className="text-foreground mb-3 whitespace-pre-line">
                    {currentTask.consigne}
                  </ExamText>
                  {currentTask.guiding_questions && currentTask.guiding_questions.length > 0 && (
                    <ul className="mb-6 space-y-1.5">
                      {currentTask.guiding_questions.map((q, i) => (
                        <ExamText key={i} as="li" base={14} className="flex gap-2 text-foreground">
                          <span className="shrink-0 font-bold text-accent">•</span>
                          {q}
                        </ExamText>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <ExamText base={15} className="text-foreground mb-6 whitespace-pre-line">
                  <LookupText text={currentTask.prompt} />
                </ExamText>
              )}
            </div>

            {/* Quiet inline notice: local Whisper unavailable, backend will transcribe */}
            {whisperNotice && (
              <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-md bg-muted border border-border text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{t('speakingWhisperUnavailable')}</span>
              </div>
            )}

            {taskState === 'prompt' && (
              <div className="flex justify-center">
                <Button
                  onClick={() => void startRecording()}
                  className="inline-flex items-center gap-1.5"
                >
                  <Mic className="w-4 h-4" />
                  {t('speakingStartRecording')}
                </Button>
              </div>
            )}

            {taskState === 'saved' && (
              <div className="text-center py-4 flex flex-col items-center gap-3">
                <p className="text-[13px] text-success font-semibold inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('speakingAnswerSaved')}
                </p>
                <Button onClick={advanceOrSubmit} className="inline-flex items-center gap-1.5">
                  {isLastTask ? t('speakingSubmitRetry') : t('speakingNextTask')}
                </Button>
              </div>
            )}

            {taskState === 'prep' && (
              <div className="text-center py-6">
                <p className="text-muted-foreground mb-2">{t('speakingPreparing')}</p>
                <span className="text-4xl font-bold text-primary">{countdown}</span>
                <p className="text-sm text-muted-foreground mt-1">{t('seconds')}</p>
                <p className="text-xs text-muted-foreground mt-3">{t('speakingAutoStart')}</p>
              </div>
            )}

            {taskState === 'recording' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-error/15 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <Mic className="w-8 h-8 text-error" />
                </div>
                <MicLevelBars level={micLevel} label={tx('micLevelLabel')} />
                <p className="text-error font-semibold mb-1">{t('speakingRecording')}</p>
                {micQuiet && (
                  <p
                    role="status"
                    className="mx-auto mb-2 flex max-w-sm items-start justify-center gap-1.5 text-[12.5px] font-semibold text-warning"
                  >
                    <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {tx('speakingMicQuiet')}
                  </p>
                )}
                <span className="text-2xl font-bold text-foreground">{countdown}</span>
                <p className="text-sm text-muted-foreground mt-1">{t('seconds')}</p>
                <div className="flex justify-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => void stopRecording()}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Square className="w-4 h-4" />
                    {t('speakingStopRecording')}
                  </Button>
                </div>
              </div>
            )}

            {taskState === 'saving' && (
              <div className="text-center py-6">
                {savingPhase === 'transcribing' ? (
                  <>
                    <Loader2 className="w-8 h-8 text-primary mx-auto mb-2 animate-spin" />
                    <p className="text-muted-foreground">{t('speakingTranscribing')}</p>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-8 h-8 text-primary mx-auto mb-2 animate-pulse" />
                    <p className="text-muted-foreground">{t('speakingSaving')}</p>
                  </>
                )}
              </div>
            )}

            {taskState === 'save-error' && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-error/10 border border-error/40">
                <p className="text-[13px] text-error">{t('speakingSaveError')}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={retryUpload} className="inline-flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t('speakingRetryUpload')}
                  </Button>
                  <button
                    onClick={continueWithoutAudio}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    {t('speakingContinueNoAudio')}
                  </button>
                </div>
              </div>
            )}

            {taskState === 'mic-error' && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-error">{t('speakingMicFailed')}</p>
                <MicAccessPanel
                  status={micFailure}
                  onRetry={() => void startRecording()}
                  fallbackSlot={
                    <>
                      <button
                        onClick={() => commitTranscriptOnly('')}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                      >
                        {t('speakingSkipTask')}
                      </button>
                      {!isLastTask && (
                        <button
                          data-testid="skip-rest-of-speaking"
                          onClick={() => setSkipRestOpen(true)}
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                        >
                          {t('micSkipSection')}
                        </button>
                      )}
                    </>
                  }
                />
              </div>
            )}

            {taskState === 'silent' && (
              <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
                <div className="flex items-start gap-2.5">
                  <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[13px] font-bold text-foreground">
                      {tx('speakingSilentTitle')}
                    </p>
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                      {tx('speakingSilentMessage')}
                    </p>
                    {silentAll && taskIndex > 0 && (
                      <p className="text-[12.5px] font-semibold leading-relaxed text-foreground">
                        {tx('speakingSilentAllMessage')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={rerecordSilentTake} className="inline-flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5" />
                    {tx('speakingSilentRerecord')}
                  </Button>
                  <button
                    onClick={keepSilentTake}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                  >
                    {isLastTask && !learningMode
                      ? tx('speakingSilentSubmit')
                      : tx('speakingSilentContinue')}
                  </button>
                </div>
                {silentAll && <MicLevelCheck />}
              </div>
            )}

            {taskState === 'done' && (
              <div className="text-center py-6">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-muted-foreground">{t('speakingSubmitting')}</p>
                  </>
                ) : (
                  <div className="flex justify-center">
                    <Button onClick={retrySubmit} className="inline-flex items-center gap-1.5">
                      {t('speakingSubmitRetry')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/30 rounded-full p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Fullscreen"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <ConfirmDialog
        open={skipRestOpen}
        onOpenChange={setSkipRestOpen}
        variant="warning"
        title={t('micSkipSectionTitle')}
        description={t('micSkipSectionBody')}
        confirmText={t('micSkipSectionConfirm')}
        cancelText={t('cancel')}
        onConfirm={skipRestOfSection}
      />

      {/* DEV ONLY — floating fast-forward for end-to-end flow testing. */}
      {isDev && (
        <button
          onClick={handleDevSkip}
          disabled={isSubmitting || taskState === 'saving' || taskState === 'done'}
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[10001] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-warning text-warning-foreground text-[13px] font-semibold border-2 border-dashed border-white/60 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SkipForward className="w-4 h-4" />
          DEV: {devSkipLabel}
        </button>
      )}
    </div>
  );
}
