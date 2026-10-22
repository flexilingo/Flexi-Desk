import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '../ConfirmDialog';
import { McqQuestion } from '../McqQuestion';
import { QuestionDots } from '../QuestionDots';
import { DevSkipButton } from '../DevSkipButton';
import { LookupText } from '../WordLookup';
import { ExamText } from '../ExamText';
import type { ReadingContent } from '../../../types';
import { saveDraft, loadDraft, elapsedSince, remainingFrom } from '../../../services/examDraft';

const TIME_LIMIT_SEC = 55 * 60;

interface ReadingSectionProps {
  sessionId: string;
  content: ReadingContent;
  onSubmit: (answers: Record<string, number>, timeSpent: number) => void;
  isSubmitting: boolean;
  /** Untimed relaxed mode: no countdown/auto-submit, passages word-clickable */
  learningMode?: boolean;
}

export function ReadingSection({
  sessionId,
  content,
  onSubmit,
  isSubmitting,
  learningMode = false,
}: ReadingSectionProps) {
  const { t } = useTranslation('celpip');
  const [loaded, setLoaded] = useState(false);
  const [partIndex, setPartIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_SEC);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const startTime = useRef<number>(0);
  const autoSubmitRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDraft(sessionId, 'reading').then((draft) => {
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

  useEffect(() => {
    if (learningMode || !loaded) return; // untimed
    const interval = setInterval(
      () => setTimeLeft(remainingFrom(startTime.current, TIME_LIMIT_SEC)),
      1000,
    );
    return () => clearInterval(interval);
  }, [learningMode, loaded]);

  useEffect(() => {
    if (!loaded || startTime.current === 0) return;
    saveDraft(sessionId, 'reading', {
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

  const handleSubmit = () => {
    const timeSpent = elapsedSince(startTime.current);
    // The draft stays until the server holds the answers (the store clears it).
    onSubmit(answers, timeSpent);
    setShowConfirm(false);
  };

  // Auto-submit when the timer reaches 0.
  useEffect(() => {
    if (learningMode) return;
    if (loaded && timeLeft === 0 && !autoSubmitRef.current && !isSubmitting) {
      autoSubmitRef.current = true;
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, loaded]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const currentPart = content.parts[partIndex];
  if (!currentPart) return null;

  const partKey = (q: number) => `part_${partIndex}_q_${q}`;
  const answeredInPart = new Set(
    currentPart.questions.map((_, i) => i).filter((i) => answers[partKey(i)] !== undefined),
  );

  const handleAnswer = (qIndex: number, optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [partKey(qIndex)]: optionIndex }));
  };

  const goToNextPart = () => {
    setPartIndex((p) => p + 1);
    setCurrentQuestion(0);
    setActiveTab(0);
  };

  // DEV ONLY — step question-by-question / part-by-part, auto-answering option 0.
  const handleDevSkip = () => {
    if (answers[partKey(currentQuestion)] === undefined) {
      handleAnswer(currentQuestion, 0);
    }
    if (currentQuestion < currentPart.questions.length - 1) {
      setCurrentQuestion((q) => q + 1);
    } else if (partIndex < content.parts.length - 1) {
      goToNextPart();
    } else {
      setShowConfirm(true);
    }
  };

  const totalQuestions = content.parts.reduce((sum, p) => sum + p.questions.length, 0);
  const answeredTotal = Object.keys(answers).length;

  const renderPassage = () => {
    // Part 1: Correspondence — two email messages
    if (currentPart.message_1) {
      const messages = [currentPart.message_1, currentPart.message_2].filter(Boolean);
      return (
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className="bg-muted rounded-lg p-4 border border-border">
              <div className="text-xs text-muted-foreground space-y-0.5 mb-3 pb-2 border-b border-border">
                <p>
                  <span className="font-medium">From:</span> {msg!.from}
                </p>
                <p>
                  <span className="font-medium">To:</span> {msg!.to}
                </p>
                <p>
                  <span className="font-medium">Subject:</span> {msg!.subject}
                </p>
              </div>
              <ExamText base={14} className="text-foreground whitespace-pre-line">
                <LookupText text={msg!.text} />
              </ExamText>
            </div>
          ))}
        </div>
      );
    }

    // Part 3: Information — multiple passages/sources with tabs
    if (currentPart.passages && currentPart.passages.length > 0) {
      return (
        <div>
          <div className="flex border-b border-border mb-4">
            {currentPart.passages.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === i
                    ? 'text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {s.source}
                {activeTab === i && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t" />
                )}
              </button>
            ))}
          </div>
          <div className="bg-muted rounded-lg p-4 border border-border">
            <ExamText base={14} className="text-foreground whitespace-pre-line">
              <LookupText text={currentPart.passages[activeTab]?.text ?? ''} />
            </ExamText>
          </div>
        </div>
      );
    }

    // Part 2/4 or legacy: multiple_sources with label/text
    if (currentPart.type === 'multiple_sources' && currentPart.sources) {
      return (
        <div>
          <div className="flex border-b border-border mb-4">
            {currentPart.sources.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === i
                    ? 'text-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {s.label}
                {activeTab === i && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t" />
                )}
              </button>
            ))}
          </div>
          <div className="bg-muted rounded-lg p-4 border border-border">
            <ExamText base={14} className="text-foreground whitespace-pre-line">
              <LookupText text={currentPart.sources[activeTab]?.text ?? ''} />
            </ExamText>
          </div>
        </div>
      );
    }

    // Part 2 (diagram) / Part 4 (viewpoints): single passage
    return (
      <ExamText base={14} className="text-foreground whitespace-pre-line">
        <LookupText text={currentPart.passage ?? ''} />
      </ExamText>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Timer bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
        <div className="flex gap-1">
          {content.parts.map((_, i) => (
            <div
              key={i}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                i === partIndex
                  ? 'bg-primary text-primary-foreground'
                  : i < partIndex
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
              aria-label={`Part ${i + 1}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
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
          {answeredTotal}/{totalQuestions}
        </span>
      </div>

      {/* Split panel — stacks on mobile, side-by-side on lg; each side scrolls independently */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Passage */}
        <div className="w-full lg:w-1/2 flex-1 lg:flex-none min-h-0 overflow-y-auto p-4 border-b lg:border-b-0 lg:border-r border-border">
          <h3 className="font-semibold text-foreground mb-3">{currentPart.title}</h3>
          {renderPassage()}
        </div>

        {/* Questions */}
        <div className="w-full lg:w-1/2 flex-1 lg:flex-none min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <QuestionDots
              total={currentPart.questions.length}
              current={currentQuestion}
              answered={answeredInPart}
              onJump={setCurrentQuestion}
            />
            {currentPart.questions[currentQuestion] && (
              <McqQuestion
                questionText={currentPart.questions[currentQuestion].question}
                options={currentPart.questions[currentQuestion].options}
                selectedIndex={answers[partKey(currentQuestion)] ?? null}
                onChange={(i) => handleAnswer(currentQuestion, i)}
                questionNumber={currentQuestion + 1}
              />
            )}
          </div>
          <div className="flex justify-between px-4 py-3 border-t border-border bg-card shrink-0">
            <Button
              variant="outline"
              size="md"
              onClick={() => setCurrentQuestion((q) => Math.max(0, q - 1))}
              disabled={currentQuestion === 0}
            >
              <span className="rtl:rotate-180">←</span>
            </Button>
            {currentQuestion < currentPart.questions.length - 1 ? (
              <Button size="md" onClick={() => setCurrentQuestion((q) => q + 1)}>
                {t('next')} <span className="rtl:hidden">→</span>
              </Button>
            ) : partIndex < content.parts.length - 1 ? (
              <Button size="md" onClick={goToNextPart}>
                {t('next')} <span className="rtl:hidden">→</span>
              </Button>
            ) : (
              <Button size="md" onClick={() => setShowConfirm(true)} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('submit')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm submit */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        variant="warning"
        title={t('confirmSubmit')}
        description={t('confirmSubmitMessage')}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
        onConfirm={handleSubmit}
        isLoading={isSubmitting}
      />

      <DevSkipButton label="Skip question" onClick={handleDevSkip} disabled={isSubmitting} />
    </div>
  );
}
