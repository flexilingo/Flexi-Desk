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
import {
  saveDraft,
  loadDraft,
  clearDraft,
  elapsedSince,
  remainingFrom,
} from '../../../services/examDraft';

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
}

export function ListeningSection({
  sessionId,
  content,
  audioUrls,
  onSubmit,
  isSubmitting,
  learningMode = false,
}: ListeningSectionProps) {
  const { t, i18n } = useTranslation('celpip');
  // Drafts load asynchronously from SQLite — hold all timers and autosave until
  // the load settles, otherwise the initial defaults would clobber the draft.
  const [loaded, setLoaded] = useState(false);
  const [partIndex, setPartIndex] = useState(0);
  const [audioComplete, setAudioComplete] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [questionTimeLeft, setQuestionTimeLeft] = useState(DEFAULT_QUESTION_TIME_SEC);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SEC);
  const [showConfirm, setShowConfirm] = useState(false);
  const [devAudioSkip, setDevAudioSkip] = useState(false);
  const startTime = useRef<number>(0);
  const autoSubmitRef = useRef(false);

  // Restore draft on mount (or start a fresh section clock).
  useEffect(() => {
    let cancelled = false;
    loadDraft(sessionId, 'listening').then((draft) => {
      if (cancelled) return;
      if (draft) {
        setPartIndex(draft.partIndex);
        setCurrentQuestion(draft.currentQuestion);
        setAnswers(draft.answers as Record<string, number>);
        startTime.current = draft.sectionStartedAt;
        setTimeLeft(remainingFrom(draft.sectionStartedAt, TIME_LIMIT_SEC));
      } else {
        startTime.current = Date.now();
        setTimeLeft(TIME_LIMIT_SEC);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Section-level timer — recomputed from the epoch start so a suspended app
  // never gains free time. Learning mode is untimed.
  useEffect(() => {
    if (learningMode || !loaded) return;
    const interval = setInterval(() => {
      setTimeLeft(remainingFrom(startTime.current, TIME_LIMIT_SEC));
    }, 1000);
    return () => clearInterval(interval);
  }, [learningMode, loaded]);

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
    if (!loaded || startTime.current === 0) return;
    saveDraft(sessionId, 'listening', {
      partIndex,
      currentQuestion,
      answers,
      sectionStartedAt: startTime.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partIndex, currentQuestion, answers, loaded]);

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
    clearDraft(sessionId, 'listening');
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
    if (loaded && timeLeft === 0 && !autoSubmitRef.current && !isSubmitting) {
      autoSubmitRef.current = true;
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, loaded]);

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

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

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
          onComplete={() => setAudioComplete(true)}
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
