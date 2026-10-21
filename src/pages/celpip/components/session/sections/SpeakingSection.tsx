import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Mic,
  Square,
  X,
  ZoomIn,
  Keyboard,
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
import { saveDraft, loadDraft, clearDraft } from '../../../services/examDraft';
import { useCelpipStore, errorCodeOf } from '../../../stores/celpipStore';

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
  | 'typing' // typed-answers fallback mode
  | 'saving' // transcribing + uploading the recording
  | 'saved' // learning mode only — answer stored, user advances manually
  | 'save-error' // transcribe/upload failed — retry or continue with fallback transcript
  | 'mic-error' // recorder failed to start — retry or continue without answer
  | 'done'; // all tasks answered — section submitted

type SavingPhase = 'transcribing' | 'uploading';

interface AudioAnswer {
  audio_url: string;
  duration_sec: number;
}

// Typing is slower than speaking — give typed-mode users a longer answer window
// than the spoken time limit (a 60s spoken answer is ~130-150 words).
const TYPING_TIME_MULTIPLIER = 3;
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
  /** No-microphone fallback — user types answers instead of recording them. */
  typedMode?: boolean;
  /** Untimed relaxed mode: manual start/stop/next, no prep countdown. */
  learningMode?: boolean;
}

export default function SpeakingSection({
  sessionId,
  prompts,
  onComplete,
  typedMode: typedModeProp = false,
  learningMode = false,
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
  const [typedDraft, setTypedDraft] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // `typedMode` can be restored from a draft even when the parent didn't pass it.
  const [typedMode, setTypedMode] = useState(typedModeProp);
  // Quiet inline notice: local Whisper isn't configured, so the backend will
  // transcribe the uploaded audio instead. Not an error — the answer is saved.
  const [whisperNotice, setWhisperNotice] = useState(false);

  const startTime = useRef<number>(0);
  const recordStartRef = useRef<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const submittedRef = useRef(false);
  // Async handlers (countdown expiry, save callbacks) must read the latest
  // values — mirror the answer maps and typed draft in refs.
  const transcriptsRef = useRef<Record<string, string>>({});
  const audioAnswersRef = useRef<Record<string, AudioAnswer>>({});
  const typedDraftRef = useRef('');
  // Stash enough to resume a failed save: the native file still exists in Rust,
  // so we only need the measured duration and whatever transcript we already got.
  const pendingSaveRef = useRef<{ durationSec: number; transcript: string } | null>(null);

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
  // (typed mode / save-failure fallback). The backend re-transcribes audio
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
    await clearDraft(sessionId, 'speaking');
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
      transcript = await invoke<string>('celpip_transcribe_recording', { sessionId, taskKey });
    } catch (err) {
      if (errorCodeOf(err) === 'WHISPER_NOT_CONFIGURED') {
        whisperUnavailable = true;
      } else {
        pendingSaveRef.current = { durationSec, transcript: '' };
        setTaskState('save-error');
        return;
      }
    }

    // Step 2 — upload the audio file and keep its public URL.
    setSavingPhase('uploading');
    try {
      const audioUrl = await invoke<string>('celpip_upload_recording', { sessionId, taskKey });
      setWhisperNotice(whisperUnavailable);
      setAudioAnswerFor(taskKey, { audio_url: audioUrl, duration_sec: durationSec });
      setTranscriptFor(taskKey, transcript);
      finishTask();
    } catch {
      pendingSaveRef.current = { durationSec, transcript };
      setTaskState('save-error');
    }
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
      startCountdown(
        learningMode ? LEARNING_MAX_RECORDING_SEC : currentTask.speaking_seconds,
        () => void stopRecording(),
      );
    } catch {
      setTaskState('mic-error');
    }
  };

  const startTyping = () => {
    setTypedDraft('');
    typedDraftRef.current = '';
    setTaskState('typing');
    if (!learningMode) {
      startCountdown(currentTask.speaking_seconds * TYPING_TIME_MULTIPLIER, finishTyping);
    }
  };

  const finishTyping = () => {
    clearCountdown();
    commitTranscriptOnly(typedDraftRef.current.trim());
  };

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
        if (draft.typedMode) setTypedMode(true);
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
    setTaskState('prep');
    startCountdown(currentTask.prep_seconds, () => {
      if (typedMode) startTyping();
      else void startRecording();
    });
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
      typedMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIndex, transcripts, audioAnswers, typedMode, ready]);

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
    } else if (taskState === 'typing') {
      if (!typedDraftRef.current.trim()) typedDraftRef.current = DEV_PLACEHOLDER;
      finishTyping();
    } else if (taskState === 'save-error') {
      continueWithoutAudio();
    } else if (taskState === 'mic-error') {
      commitTranscriptOnly('');
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
            : taskState === 'typing'
              ? 'Finish typing'
              : taskState === 'save-error'
                ? 'Skip upload'
                : taskState === 'mic-error'
                  ? 'Skip task'
                  : 'Waiting';

  const formatCountdown = (sec: number) =>
    `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;

  if (!currentTask) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {t('task')} {taskIndex + 1} / {prompts.tasks.length}
          </span>
          {typedMode && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
              <Keyboard className="w-3 h-3" />
              {t('typedModeNotice')}
            </span>
          )}
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
            <h3 className="text-lg font-semibold text-foreground mb-2">{currentTask.title}</h3>

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

            <ExamText base={15} className="text-foreground mb-6">
              <LookupText text={currentTask.prompt} />
            </ExamText>

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
                  onClick={() => (typedMode ? startTyping() : void startRecording())}
                  className="inline-flex items-center gap-1.5"
                >
                  {typedMode ? <Keyboard className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {typedMode ? t('speakingStartTyping') : t('speakingStartRecording')}
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
                <p className="text-xs text-muted-foreground mt-3">
                  {typedMode ? t('typingAutoStart') : t('speakingAutoStart')}
                </p>
              </div>
            )}

            {taskState === 'recording' && (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-error/15 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <Mic className="w-8 h-8 text-error" />
                </div>
                <p className="text-error font-semibold mb-1">{t('speakingRecording')}</p>
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

            {taskState === 'typing' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary">
                    <Keyboard className="w-3.5 h-3.5" />
                    {t('typedAnswerLabel')}
                  </span>
                  {!learningMode && (
                    <span
                      className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${
                        countdown <= 30 ? 'text-error bg-error/10' : 'text-foreground bg-muted'
                      }`}
                    >
                      {formatCountdown(countdown)}
                    </span>
                  )}
                </div>
                <textarea
                  autoFocus
                  className="w-full min-h-[160px] resize-none bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={t('typedAnswerPlaceholder')}
                  value={typedDraft}
                  onChange={(e) => {
                    setTypedDraft(e.target.value);
                    typedDraftRef.current = e.target.value;
                  }}
                />
                <div className="flex justify-end mt-3">
                  <Button onClick={finishTyping} className="inline-flex items-center gap-1.5">
                    {t('typedDone')}
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
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-error/10 border border-error/40">
                <div className="flex items-start gap-2.5">
                  <MicOff className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-[13px] text-error">{t('speakingMicFailed')}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={() => void startRecording()}
                    className="inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t('speakingRetryRecording')}
                  </Button>
                  <button
                    onClick={() => commitTranscriptOnly('')}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                  >
                    {t('speakingSkipTask')}
                  </button>
                </div>
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

      {/* DEV ONLY — floating fast-forward for end-to-end flow testing. */}
      {isDev && (
        <button
          onClick={handleDevSkip}
          disabled={isSubmitting || taskState === 'saving' || taskState === 'done'}
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[10001] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-warning text-white text-[13px] font-semibold border-2 border-dashed border-white/60 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SkipForward className="w-4 h-4" />
          DEV: {devSkipLabel}
        </button>
      )}
    </div>
  );
}
