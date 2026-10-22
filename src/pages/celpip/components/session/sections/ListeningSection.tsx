import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '../ConfirmDialog';
import { AudioPlayer } from '../AudioPlayer';
import { McqQuestion } from '../McqQuestion';
import { QuestionDots } from '../QuestionDots';
import { DevSkipButton } from '../DevSkipButton';
import { LookupText } from '../WordLookup';
import { ExamText } from '../ExamText';
import type { ListeningContent } from '../../../types';
import { saveDraft, elapsedSince } from '../../../services/examDraft';
import { initialTimeLeft, resumeAudio } from '../../../utils/examClocks';
import { useLoadedDraft } from '../tcf/tcfShared';
import type { ExamSectionDraft } from '../../../types';

const TIME_LIMIT_SEC = 55 * 60;
// Per-question answer window by section type (key = part_index). The official
// per-question timing isn't published; these are approximations — monologue /
// analytical parts get slightly more time. No exact data lives in the exam model.
const DEFAULT_QUESTION_TIME_SEC = 30;
const QUESTION_TIME_BY_PART: Record<number, number> = {
  0: 30, // Problem Solving
  1: 30, // Daily Life Conversation
  2: 30, // Listening for Information
  3: 40, // News Item
  4: 40, // Discussion
  5: 40, // Viewpoints
};
const questionTimeForPart = (partIndex0: number) =>
  QUESTION_TIME_BY_PART[partIndex0] ?? DEFAULT_QUESTION_TIME_SEC;

interface ListeningSectionProps {
  sessionId: string;
  content: ListeningContent;
  audioUrls: Record<string, string>;
  onSubmit: (answers: Record<string, number>, timeSpent: number) => void;
  isSubmitting: boolean;
  /** Untimed relaxed mode: no countdowns, free back-nav, replayable audio, transcript */
  learningMode?: boolean;
  /**
   * Practice: the section clock stands still while the learner is away, so a part
   * left half-heard still has the time it needs on return. A full sitting keeps
   * the wall clock, as the real test does.
   */
  pauseClockWhileAway?: boolean;
}

/**
 * Drafts live in SQLite, so reading one is async: the section opens only once its
 * draft is known, straight from it - the part, the questions answered, the clock
 * and where the recording stood (`audio`) - instead of opening blank and filling in
 * a moment later.
 */
export function ListeningSection(props: ListeningSectionProps) {
  const { ready, draft } = useLoadedDraft(props.sessionId, 'listening');
  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }
  return <ListeningInner {...props} draft={draft} />;
}

function ListeningInner({
  sessionId,
  content,
  audioUrls,
  onSubmit,
  isSubmitting,
  learningMode = false,
  pauseClockWhileAway = false,
  draft,
}: ListeningSectionProps & { draft: ExamSectionDraft | null }) {
  const { t, i18n } = useTranslation('celpip');
  const [resume] = useState(() => ({ partIndex: draft?.partIndex ?? 0, ...resumeAudio(draft) }));
  const [partIndex, setPartIndex] = useState(draft?.partIndex ?? 0);
  const [audioComplete, setAudioComplete] = useState(resume.done);
  const [currentQuestion, setCurrentQuestion] = useState(draft?.currentQuestion ?? 0);
  const [answers, setAnswers] = useState<Record<string, number>>(
    () => (draft?.answers as Record<string, number> | undefined) ?? {},
  );
  const [questionTimeLeft, setQuestionTimeLeft] = useState(DEFAULT_QUESTION_TIME_SEC);
  const [timeLeft, setTimeLeft] = useState(() =>
    initialTimeLeft(draft, TIME_LIMIT_SEC, pauseClockWhileAway, Date.now()),
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [devAudioSkip, setDevAudioSkip] = useState(false);
  const [sectionStartedAt] = useState(() => draft?.sectionStartedAt || Date.now());
  const startTime = useRef<number>(sectionStartedAt);
  const autoSubmitRef = useRef(false);

  // Latest values for persist(), which also runs from the clock and the audio.
  const audioStateRef = useRef(draft?.audio);
  // Seconds the clock has run, counted by the tick itself so a save never reads a value one render behind.
  const activeSecRef = useRef(TIME_LIMIT_SEC - timeLeft);
  const progressRef = useRef({ partIndex, currentQuestion, answers });
  useEffect(() => {
    progressRef.current = { partIndex, currentQuestion, answers };
  }, [partIndex, currentQuestion, answers]);

  const persist = useCallback(() => {
    void saveDraft(sessionId, 'listening', {
      ...progressRef.current,
      sectionStartedAt: startTime.current,
      activeSec: activeSecRef.current,
      audio: audioStateRef.current,
    });
  }, [sessionId]);

  // Section-level timer. Saved every tick: leaving between saves must not lose
  // clock time. Learning mode is untimed.
  useEffect(() => {
    if (learningMode) return;
    const interval = setInterval(() => {
      setTimeLeft((left) => Math.max(0, left - 1));
      activeSecRef.current = Math.min(TIME_LIMIT_SEC, activeSecRef.current + 1);
      persist();
    }, 1000);
    return () => clearInterval(interval);
  }, [learningMode, persist]);

  // Per-question timer — resets on each question/part change; expiry auto-advances (forward-only)
  useEffect(() => {
    if (!audioComplete || learningMode) return;
    const part = content.parts[partIndex];
    setQuestionTimeLeft(questionTimeForPart(part ? part.part_index : partIndex));
  }, [currentQuestion, partIndex, audioComplete, content.parts, learningMode]);

  useEffect(() => {
    if (!audioComplete || learningMode) return;
    const interval = setInterval(() => {
      setQuestionTimeLeft((q) => Math.max(0, q - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [audioComplete, currentQuestion, partIndex, learningMode]);

  // Autosave on every answer/nav change.
  useEffect(() => {
    persist();
  }, [partIndex, currentQuestion, answers, persist]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentPart = content.parts[partIndex];

  const partKey = (q: number) => `part_${partIndex}_q_${q}`;
  const answeredInPart = new Set(
    currentPart
      ? currentPart.questions.map((_, i) => i).filter((i) => answers[partKey(i)] !== undefined)
      : [],
  );

  const isLastQuestionInPart = !currentPart || currentQuestion >= currentPart.questions.length - 1;
  const isLastPart = partIndex >= content.parts.length - 1;

  const goToNextQuestion = useCallback(() => {
    if (!isLastQuestionInPart) {
      setCurrentQuestion((q) => q + 1);
    } else if (!isLastPart) {
      setPartIndex((p) => p + 1);
      setAudioComplete(false);
      setDevAudioSkip(false);
      setCurrentQuestion(0);
    } else {
      setShowConfirm(true);
    }
  }, [isLastQuestionInPart, isLastPart]);

  const handleAnswer = (qIndex: number, optionIndex: number) => {
    if (qIndex !== currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [partKey(qIndex)]: optionIndex }));
  };

  const handleSubmit = () => {
    const timeSpent = elapsedSince(startTime.current);
    // The draft stays until the server holds the answers (the store clears it).
    onSubmit(answers, timeSpent);
    setShowConfirm(false);
  };

  // Auto-advance when the per-question timer reaches 0 (CELPIP behaviour).
  useEffect(() => {
    if (learningMode) return;
    if (questionTimeLeft === 0 && audioComplete) {
      goToNextQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionTimeLeft, audioComplete]);

  // Auto-submit when the section timer reaches 0.
  useEffect(() => {
    if (learningMode) return;
    if (timeLeft === 0 && !autoSubmitRef.current && !isSubmitting) {
      autoSubmitRef.current = true;
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // DEV ONLY — fast-forward the current sub-stage: skip the audio playback, then
  // step question-by-question (auto-answering option 0 when unanswered).
  const handleDevSkip = () => {
    if (!audioComplete) {
      setDevAudioSkip(true);
      return;
    }
    if (answers[partKey(currentQuestion)] === undefined) {
      handleAnswer(currentQuestion, 0);
    }
    goToNextQuestion();
  };

  if (!currentPart) return null;

  // Part-specific instruction (real-exam style) — keyed by the official part
  // index, falling back to the set's own title if a part has no localized copy.
  const partTypeIndex = currentPart.part_index;
  const partName = i18n.exists(`celpip:listeningParts.${partTypeIndex}.name`)
    ? t(`listeningParts.${partTypeIndex}.name`)
    : currentPart.title;
  const partInstruction = i18n.exists(`celpip:listeningParts.${partTypeIndex}.instruction`)
    ? t(`listeningParts.${partTypeIndex}.instruction`)
    : t('listeningAudioOnce');

  return (
    <div className="flex flex-col h-full">
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <span className="text-sm font-medium text-foreground">
          {t('part')} {partIndex + 1} / {content.parts.length}
        </span>
        {learningMode ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-[6px] bg-success/10 text-success">
            {t('learningModeBadge')}
          </span>
        ) : (
          <span
            className={`text-sm font-mono font-bold ${timeLeft < 300 ? 'text-error' : 'text-foreground'}`}
          >
            {formatTime(timeLeft)}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          {audioComplete ? `${currentQuestion + 1} / ${currentPart.questions.length}` : ''}
        </span>
      </div>

      {/* Part indicator — display only, no backward navigation */}
      <div className="flex gap-1 px-4 pt-3">
        {content.parts.map((_, i) => (
          <div
            key={i}
            className={`px-3 py-1 rounded text-sm font-medium ${
              i === partIndex
                ? 'bg-primary text-primary-foreground'
                : i < partIndex
                  ? 'bg-primary/20 text-primary cursor-not-allowed'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Part instruction — real-exam style: name the part, remind the audio plays once */}
      {!audioComplete && (
        <div className="px-4 pt-3">
          {partName && <p className="text-sm font-semibold text-foreground">{partName}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">{partInstruction}</p>
        </div>
      )}

      {/* Audio */}
      <div className="px-4 pt-3">
        <AudioPlayer
          key={`part_${partIndex}`}
          src={currentPart.audio_url || audioUrls[`part_${currentPart.part_index + 1}`] || ''}
          onComplete={() => {
            audioStateRef.current = { partIndex, pos: 0, done: true };
            setAudioComplete(true);
            persist();
          }}
          onProgress={(sec) => {
            // A replay in learning mode must not hide questions already unlocked.
            if (audioStateRef.current?.partIndex === partIndex && audioStateRef.current.done)
              return;
            audioStateRef.current = { partIndex, pos: sec, done: false };
            persist();
          }}
          startAt={partIndex === resume.partIndex ? resume.startAt : 0}
          startCompleted={partIndex === resume.partIndex && resume.done}
          autoPlay
          forceComplete={devAudioSkip}
          fullControls={learningMode}
        />
      </div>

      {/* Questions — only shown after audio completes */}
      {audioComplete && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Learning mode: show the script with tap-to-translate words */}
          {learningMode && currentPart.script && (
            <div className="mt-1 mb-3 p-3.5 rounded-[10px] bg-muted border border-border">
              <p className="text-[10px] font-bold text-success uppercase tracking-[.12em] mb-1.5">
                {t('transcriptLabel')}
              </p>
              <ExamText base={13} className="text-foreground whitespace-pre-line">
                <LookupText text={currentPart.script} />
              </ExamText>
            </div>
          )}
          <div className="flex items-center justify-between">
            <QuestionDots
              total={currentPart.questions.length}
              current={currentQuestion}
              answered={answeredInPart}
              onJump={learningMode ? setCurrentQuestion : undefined}
              forwardOnly={!learningMode}
            />
            {/* Per-question countdown — auto-advances on expiry (not in learning mode) */}
            {!learningMode && (
              <span
                className={`text-xs font-mono font-semibold px-2 py-1 rounded ${
                  questionTimeLeft <= 10
                    ? 'text-error bg-error/10'
                    : 'text-muted-foreground bg-muted'
                }`}
              >
                {questionTimeLeft}s
              </span>
            )}
          </div>
          {currentPart.questions[currentQuestion] && (
            <McqQuestion
              questionText={currentPart.questions[currentQuestion].question}
              options={currentPart.questions[currentQuestion].options}
              selectedIndex={answers[partKey(currentQuestion)] ?? null}
              onChange={(i) => handleAnswer(currentQuestion, i)}
              questionNumber={currentQuestion + 1}
            />
          )}
          <div className="flex justify-end mt-4">
            <Button onClick={goToNextQuestion} disabled={isSubmitting}>
              {isLastQuestionInPart && isLastPart ? (
                isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('submit')
                )
              ) : (
                <>
                  {t('next')}
                  <span className="rtl:hidden"> →</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm submit */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        variant="info"
        title={t('confirmSubmit')}
        description={t('confirmSubmitMessage')}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
      />

      <DevSkipButton
        label={audioComplete ? 'Skip question' : 'Skip audio'}
        onClick={handleDevSkip}
        disabled={isSubmitting}
      />
    </div>
  );
}
