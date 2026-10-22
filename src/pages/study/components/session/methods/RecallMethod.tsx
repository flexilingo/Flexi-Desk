import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useSpeechState } from '@/lib/speech';
import { formatInterval, predictIntervals } from '../../../utils/srs-display';
import { useSpeak } from '../../../hooks/useSpeak';
import { frontLanguage, meaningLanguage } from '../../../lib/cardLang';
import { resolveCardKey, type CardKeyAction } from '../../../lib/cardKeys';
import { normalizeExamples, type ExampleItem } from '../../../lib/examples';
import type { MethodProps, StudySubmitArgs } from '../types';
import { FlashCard } from '../FlashCard';
import { InsightsPanel } from '../InsightsPanel';
import { insightsHaveContent } from '../../../lib/insights';
import { RatingButtons } from '../RatingButtons';
import { StudyShortcutBar } from '../../StudyShortcutBar';

/**
 * The flashcard recall method: flip, rate 1-5. The card itself is `FlashCard`; this owns
 * the state and the keyboard — Space/Enter flip, 1-5 grade, r replay the word, e/w step
 * through the examples, t uncovers one example meaning, and (focus mode only) m / l.
 */
export function RecallMethod({
  activity,
  cardMeta,
  srsAlgorithm,
  cardProgress,
  requeueCount,
  submitting,
  onSubmit,
  onNext,
  onLookup,
  view,
  autoPlay,
  deckLanguage,
  nativeLanguage,
}: MethodProps) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const speech = useSpeechState();
  const startedAt = useRef(Date.now());

  const payload = activity.prompt_payload;
  const reverse = payload.type === 'recall' ? payload.reverse : false;
  const frontText = payload.type === 'recall' ? payload.front_text : (cardMeta?.front_text ?? '');
  const backText = payload.type === 'recall' ? payload.back_text : (cardMeta?.back_text ?? '');
  // The prompt side depends on the direction; the answer is the other side.
  const promptText = reverse ? backText : frontText;
  const answerText = reverse ? frontText : backText;
  const notes = cardMeta?.notes ?? null;

  // The word is in the deck's language; the meaning is in the learner's.
  const wordLang = frontLanguage({ notesLang: notes?.learning_lang, deckLanguage }, frontText);
  const meaningLang = meaningLanguage(backText, cardMeta?.deck_native_language, nativeLanguage);
  const promptLang = reverse ? meaningLang : wordLang;
  const answerLang = reverse ? wordLang : meaningLang;

  const [isAnswer, setIsAnswer] = useState(false);
  const [submittingRating, setSubmittingRating] = useState<number | null>(null);

  // What the card shows. Masking the meaning is exactly the case where the examples should be
  // read first, so the two stay tied: the order follows the mask.
  const showMeaningPref = view.showMeaning;
  const wordHidden = !view.showWord;
  const examplesFirst = !showMeaningPref;
  const focusMode = view.focusMode;
  const [meaningRevealed, setMeaningRevealed] = useState(showMeaningPref);
  useEffect(() => setMeaningRevealed(showMeaningPref), [showMeaningPref]);
  const toggleMeaning = useCallback(() => setMeaningRevealed((v) => !v), []);

  useEffect(() => {
    setIsAnswer(false);
    setSubmittingRating(null);
    startedAt.current = Date.now();
  }, [activity.id]);

  const intervals = useMemo(() => {
    const days = predictIntervals(srsAlgorithm, cardProgress);
    return Object.fromEntries(
      Object.entries(days).map(([r, d]) => [r, formatInterval(d)]),
    ) as Record<number, string>;
  }, [srsAlgorithm, cardProgress]);

  // ── Auto-pronounce: once per card, as soon as it is up. A masked prompt is an audio card by
  // definition — with the word hidden and nothing spoken there is nothing to study — so it speaks
  // whatever the auto-pronounce setting says. A reversed card speaks its prompt side (the meaning),
  // never the answer.
  const speakPromptSide = wordHidden || reverse;
  const wordToRead = speakPromptSide ? promptText : frontText;
  const wordToReadLang = speakPromptSide ? promptLang : wordLang;
  useEffect(() => {
    if (!autoPlay.autoPronounce && !wordHidden) return;
    if (!wordToRead) return;
    const tk = setTimeout(() => void speak(wordToRead, wordToReadLang), 150);
    return () => clearTimeout(tk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, autoPlay.autoPronounce, wordHidden, wordToRead, wordToReadLang]);

  // ── Reversed card: the word is the ANSWER, so the auto-pronounce above never says it. Read it on
  // every flip once it is actually visible — with the meaning masked the answer sits behind the eye,
  // so it waits for that to be uncovered rather than reading out what the learner chose to work out.
  const wordVisible = isAnswer && meaningRevealed;
  useEffect(() => {
    if (!reverse || !autoPlay.pronounceWordOnReveal || !wordVisible || !frontText) return;
    const tk = setTimeout(() => void speak(frontText, wordLang), 150);
    return () => clearTimeout(tk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id, reverse, autoPlay.pronounceWordOnReveal, wordVisible, frontText, wordLang]);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4 | 5) => {
      if (submittingRating !== null) return;
      setSubmittingRating(rating);
      const args: StudySubmitArgs = {
        self_rating: rating,
        response_time_ms: Date.now() - startedAt.current,
      };
      const res = await onSubmit(args);
      // A failed grade frees the buttons again; a good one moves on (one card per press — see the runner).
      if (res) onNext();
      else setSubmittingRating(null);
    },
    [onSubmit, onNext, submittingRating],
  );

  // ── Examples: `e` walks forward, `w` backward, each press speaking the sentence it lands on.
  const exampleRows = useMemo(
    () => normalizeExamples(notes?.examples as ExampleItem[] | undefined),
    [notes],
  );
  const exampleTexts = useMemo(() => exampleRows.map((r) => r.text), [exampleRows]);
  const [activeExampleIndex, setActiveExampleIndex] = useState<number | null>(null);
  // Rows that actually have a translation to uncover; a row without one has nothing to step onto.
  const translatable = useMemo(
    () => exampleRows.flatMap((r, i) => (r.translation ? [i] : [])),
    [exampleRows],
  );
  const showExampleMeanings = view.showExampleMeanings;
  const [revealed, setRevealed] = useState<number[]>(() =>
    showExampleMeanings ? translatable : [],
  );
  // Flipping the preference mid-session re-applies it to the card on screen.
  useEffect(
    () => setRevealed(showExampleMeanings ? translatable : []),
    [showExampleMeanings, translatable],
  );
  const toggleExampleReveal = useCallback(
    (i: number) =>
      setRevealed((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])),
    [],
  );
  // `t` uncovers the translations one press at a time, top to bottom, building the whole set; once every
  // row shows, the next press covers them all, so the key cycles rather than going dead.
  const revealNextExampleMeaning = useCallback(() => {
    if (translatable.length === 0) return;
    setRevealed((prev) => {
      const next = translatable.find((i) => !prev.includes(i));
      return next === undefined ? [] : [...prev, next];
    });
  }, [translatable]);
  const allRevealed = translatable.length > 0 && translatable.every((i) => revealed.includes(i));

  // The index is kept in a ref as well as state: the voice must be started from the event, never from
  // inside a state updater (React runs those during render).
  const activeRef = useRef<number | null>(null);
  const stepExample = useCallback(
    (delta: 1 | -1) => {
      if (exampleTexts.length === 0) return;
      const prev = activeRef.current;
      const next =
        prev === null
          ? delta === 1
            ? 0
            : exampleTexts.length - 1
          : (prev + delta + exampleTexts.length) % exampleTexts.length;
      activeRef.current = next;
      setActiveExampleIndex(next);
      void speak(exampleTexts[next], wordLang);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exampleTexts, wordLang],
  );

  // Replays whichever side the card is showing — the same rule the card's own speaker button follows.
  const replayWord = useCallback(() => {
    const onPrompt = !isAnswer || speakPromptSide;
    void speak(onPrompt ? promptText : frontText, onPrompt ? promptLang : wordLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswer, speakPromptSide, promptText, frontText, promptLang, wordLang]);

  // With the meaning masked `m` uncovers it; with nothing masked there is nothing to uncover, so it flips.
  const shortcutToggleMeaning = useCallback(() => {
    if (examplesFirst && isAnswer) toggleMeaning();
    else setIsAnswer((v) => !v);
  }, [examplesFirst, isAnswer, toggleMeaning]);

  // ── Keyboard. One listener, one pure decision (`resolveCardKey`).
  const act = useRef<(a: CardKeyAction) => void>(() => {});
  act.current = (a) => {
    switch (a.type) {
      case 'flip':
        setIsAnswer((v) => !v);
        break;
      case 'replay':
        replayWord();
        break;
      case 'nextExample':
        stepExample(1);
        break;
      case 'prevExample':
        stepExample(-1);
        break;
      case 'exampleMeaning':
        revealNextExampleMeaning();
        break;
      case 'toggleMeaning':
        shortcutToggleMeaning();
        break;
      case 'toggleLayout':
        view.onToggleShowMeaning();
        break;
      case 'grade':
        void rate(a.rating);
        break;
    }
  };
  useEffect(() => {
    if (submitting) return;
    const onKey = (e: KeyboardEvent) => {
      const action = resolveCardKey(e, { focusMode, isAnswer, submittingRating });
      if (!action) return;
      e.preventDefault();
      act.current(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, focusMode, isAnswer, submittingRating]);

  const showInsights =
    isAnswer && !!notes && insightsHaveContent(notes, { front: frontText, language: deckLanguage });

  return (
    <div className="space-y-4">
      <div
        className={
          showInsights ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_20em]' : undefined
        }
      >
        <div className="min-w-0 space-y-3">
          <FlashCard
            promptText={promptText}
            answerText={answerText}
            reversed={reverse}
            notes={notes}
            isAnswer={isAnswer}
            onToggleAnswer={() => setIsAnswer((v) => !v)}
            promptMasked={wordHidden}
            focusMode={focusMode}
            examplesFirst={examplesFirst}
            meaningRevealed={meaningRevealed}
            onToggleMeaning={examplesFirst ? toggleMeaning : undefined}
            requeueCount={requeueCount}
            isSpeaking={speech.speaking}
            isLoading={speech.loading}
            onSpeak={(text) =>
              void speak(
                text,
                text === promptText ? promptLang : text === frontText ? wordLang : answerLang,
              )
            }
            onLookup={onLookup}
            exampleLanguage={wordLang}
            speakShortcutKey="R"
            activeExampleIndex={activeExampleIndex}
            revealedExampleIndexes={revealed}
            onToggleExampleReveal={toggleExampleReveal}
            answerIsLearningLanguage={reverse}
          />

          {isAnswer ? (
            <RatingButtons
              submittingRating={submittingRating}
              onRatingSubmit={(r) => void rate(r)}
              predictedIntervals={intervals}
            />
          ) : (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setIsAnswer(true)}>
                {t('runner.show')}
              </Button>
            </div>
          )}
        </div>

        {showInsights && notes && (
          <div className="space-y-2.5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <InsightsPanel
              notes={notes}
              onLookup={onLookup}
              showExamples={false}
              word={frontText}
              meaningRevealed={meaningRevealed}
              onToggleMeaning={examplesFirst ? toggleMeaning : undefined}
              conjugation={{ front: frontText, language: deckLanguage }}
            />
          </div>
        )}
      </div>

      {/* Focus mode gets the control strip in the empty band under the card: every shortcut is also a button. */}
      {focusMode && (
        <StudyShortcutBar
          onReplayWord={replayWord}
          onPrevExample={() => stepExample(-1)}
          onNextExample={() => stepExample(1)}
          onToggleMeaning={shortcutToggleMeaning}
          onToggleLayout={view.onToggleShowMeaning}
          onToggleExampleMeaning={revealNextExampleMeaning}
          exampleCount={exampleTexts.length}
          activeExampleIndex={activeExampleIndex}
          translatableExampleCount={translatable.length}
          allExampleMeaningsRevealed={allRevealed}
          meaningRevealed={meaningRevealed}
          examplesFirst={examplesFirst}
          isSpeaking={speech.speaking}
          isLoading={speech.loading}
          isAnswer={isAnswer}
        />
      )}
    </div>
  );
}
