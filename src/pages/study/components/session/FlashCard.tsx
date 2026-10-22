import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, MousePointerClick, RotateCcw, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CardNotes } from '../../types';
import { hasRtl } from '../../lib/cardLang';
import { ClickableText } from './ClickableText';
import { ExampleList, type ExampleItem } from './ExampleList';

/** A fixed row of dots, NOT one per character — the mask must not leak the word's length. */
const MASK = '•'.repeat(40);

export interface FlashCardProps {
  /** The side asked first (the word, or — reversed — the meaning). */
  promptText: string;
  /** The side revealed (the meaning, or — reversed — the word). */
  answerText: string;
  /** The card is reversed: the IPA belongs to the word, so it moves to the answer. */
  reversed: boolean;
  notes: CardNotes | null;
  isAnswer: boolean;
  onToggleAnswer: () => void;
  /** Mask the prompt word: the card becomes an audio card — listen, then reveal word and meaning together. */
  promptMasked: boolean;
  /** Fullscreen study: the word is set much larger and the face is given the height to sit optically centred. */
  focusMode: boolean;
  /** Examples first, translation masked behind the eye. */
  examplesFirst: boolean;
  meaningRevealed: boolean;
  onToggleMeaning?: () => void;
  requeueCount: number;
  isSpeaking: boolean;
  isLoading: boolean;
  /** Says a side aloud (the language is resolved by the caller from the text). */
  onSpeak: (text: string) => void;
  onLookup: (word: string, sentence: string) => void;
  exampleLanguage: string;
  /** The key that also replays the word, shown on the button — only where it is actually bound. */
  speakShortcutKey?: string;
  activeExampleIndex: number | null;
  revealedExampleIndexes: number[];
  onToggleExampleReveal: (index: number) => void;
  /** A tapped word of the answer is looked up only when it is in the learning language (the front side). */
  answerIsLearningLanguage: boolean;
}

/** IPA + part of speech + level (+ register) under the word. Hidden with the word, never without it. */
function MetaBand({ notes, hideIpa }: { notes: CardNotes | null; hideIpa: boolean }) {
  if (!notes) return null;
  const chips: { value: string; cls: string }[] = [];
  if (notes.ipa && !hideIpa) chips.push({ value: notes.ipa, cls: 'font-mono text-caption' });
  if (notes.part_of_speech)
    chips.push({
      value: notes.part_of_speech,
      cls: 'rounded bg-muted px-1.5 py-0.5 font-bold uppercase tracking-wider text-accent',
    });
  if (typeof notes.cefr_level === 'string')
    chips.push({
      value: notes.cefr_level,
      cls: 'rounded bg-muted px-1.5 py-0.5 font-bold tracking-wider text-primary',
    });
  if (typeof notes.register === 'string' && notes.register !== 'neutral')
    chips.push({
      value: notes.register,
      cls: 'rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary',
    });
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs" dir="ltr">
      {chips.map((c, i) => (
        <span key={i} className={c.cls}>
          {c.value}
        </span>
      ))}
    </div>
  );
}

/**
 * The classic flashcard: a front face (the word, its meta band, a labelled pronounce
 * button, the tap hint) and a back face (the word again with its audio, the translation
 * and the examples — in either order). Presentational: every state lives in `RecallMethod`.
 */
export function FlashCard(p: FlashCardProps) {
  const { t } = useTranslation('study');
  const busy = p.isSpeaking || p.isLoading;
  const examples: ExampleItem[] = Array.isArray(p.notes?.examples)
    ? (p.notes!.examples as ExampleItem[])
    : [];
  const learningSideIsPrompt = !p.reversed;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {p.requeueCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold text-accent">
          <RotateCcw className="h-3 w-3" />
          {t('runner.requeueBadge', { count: p.requeueCount })}
        </span>
      )}

      {!p.isAnswer ? (
        /* ── FRONT FACE ── */
        <div
          role="button"
          tabIndex={0}
          data-testid="card-front"
          onClick={p.onToggleAnswer}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
          }}
          className={cn(
            'relative flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-border bg-card px-5 py-10 text-center transition-shadow hover:shadow-md sm:px-6 sm:py-14',
            p.focusMode ? 'min-h-[320px] sm:min-h-[420px]' : 'min-h-[200px] sm:min-h-[260px]',
          )}
        >
          {p.promptMasked ? (
            <div
              className={cn(
                'max-w-[60%] select-none overflow-hidden whitespace-nowrap tracking-wide text-caption',
                p.focusMode ? 'text-[3em]' : 'text-[2em]',
              )}
              aria-label={t('runner.hiddenWord')}
            >
              {MASK}
            </div>
          ) : (
            <div
              // `break-words` is load-bearing at the focus sizes: a long unbroken prompt would run past the card.
              className={cn(
                'max-w-full break-words text-foreground',
                p.promptText.length > 30
                  ? p.focusMode
                    ? 'text-[1.5em] font-semibold leading-relaxed'
                    : 'text-[1.2em] font-semibold leading-relaxed'
                  : p.focusMode
                    ? 'text-[3.4em] font-black leading-tight tracking-tight'
                    : 'text-[2.1em] font-black leading-tight tracking-tight',
              )}
              dir="auto"
              data-testid="card-prompt"
            >
              {/* The prompt is NEVER tappable: the learner should recall the meaning first. */}
              {p.promptText}
            </div>
          )}

          {!p.promptMasked && <MetaBand notes={p.notes} hideIpa={p.reversed} />}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              p.onSpeak(p.promptText);
            }}
            disabled={busy}
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40"
            aria-label={t('runner.listen')}
            title={t('runner.listen')}
          >
            {p.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className={cn('h-4 w-4', p.isSpeaking && 'animate-pulse text-accent')} />
            )}
            <span>{t('runner.listen')}</span>
            {p.speakShortcutKey && (
              <kbd className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-caption">
                {p.speakShortcutKey}
              </kbd>
            )}
          </button>

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-caption">
            <MousePointerClick className="h-3.5 w-3.5" />
            {p.promptMasked ? t('runner.listenThenReveal') : t('runner.clickToReveal')}
          </div>
        </div>
      ) : (
        /* ── BACK FACE ── */
        <div
          className="w-full rounded-2xl border border-success/50 bg-card p-4 sm:p-6"
          data-testid="card-back"
        >
          <div className="flex items-start gap-3" dir="ltr">
            <button
              type="button"
              onClick={() => p.onSpeak(p.promptText)}
              disabled={busy}
              className="mt-0.5 shrink-0 rounded-md border border-border bg-card p-1.5 text-caption transition-colors hover:border-accent/30 hover:text-accent disabled:opacity-40"
              aria-label={t('runner.listen')}
              title={t('runner.listen')}
            >
              {p.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className={cn('h-4 w-4', p.isSpeaking && 'animate-pulse text-accent')} />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div
                className="text-[1.7em] font-black leading-none tracking-tight text-foreground"
                dir="auto"
              >
                {learningSideIsPrompt ? (
                  <ClickableText text={p.promptText} onWordClick={p.onLookup} />
                ) : (
                  p.promptText
                )}
              </div>
              {/* Reversed, this headline is the meaning — the IPA goes with the word, under the answer below. */}
              {!p.reversed && p.notes?.ipa && (
                <div className="mt-1 font-mono text-sm tracking-wide text-caption">
                  {p.notes.ipa}
                </div>
              )}
            </div>
          </div>

          {/* Examples first, then the (masked) meaning — or the other way round. Order is the ONLY difference;
              both blocks are identical in either mode. */}
          <div className="flex flex-col">
            <div className={cn('mt-4', p.examplesFirst ? 'order-3' : 'order-1')}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-caption">
                  {t('runner.translationLabel')}
                </span>
                {p.onToggleMeaning && (
                  <button
                    type="button"
                    onClick={p.onToggleMeaning}
                    aria-pressed={p.meaningRevealed}
                    title={p.meaningRevealed ? t('runner.hideMeaning') : t('runner.revealMeaning')}
                    aria-label={
                      p.meaningRevealed ? t('runner.hideMeaning') : t('runner.revealMeaning')
                    }
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-caption transition-colors hover:text-accent"
                  >
                    {p.meaningRevealed ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
              {p.meaningRevealed ? (
                <div
                  className="text-[1.2em] font-semibold leading-snug text-muted-foreground"
                  dir={hasRtl(p.answerText) ? 'rtl' : 'auto'}
                  data-testid="card-answer"
                >
                  {p.answerIsLearningLanguage ? (
                    <ClickableText text={p.answerText} onWordClick={p.onLookup} />
                  ) : (
                    p.answerText
                  )}
                  {/* Reversed, the answer IS the word, so its IPA sits here. */}
                  {p.reversed && p.notes?.ipa && (
                    <div
                      className="mt-1 font-mono text-sm font-normal tracking-wide text-caption"
                      dir="ltr"
                    >
                      {p.notes.ipa}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={p.onToggleMeaning}
                  aria-label={t('runner.revealMeaning')}
                  className="block w-1/2 cursor-pointer select-none overflow-hidden whitespace-nowrap text-start text-[1.2em] tracking-wide text-caption transition-colors hover:text-accent"
                >
                  {MASK}
                </button>
              )}
            </div>

            <div className="order-2 my-4 h-px w-full bg-border" />

            {examples.length > 0 && (
              <div className={p.examplesFirst ? 'order-1' : 'order-3'}>
                <ExampleList
                  examples={examples}
                  language={p.exampleLanguage}
                  highlightWord={p.reversed ? p.answerText : p.promptText}
                  onWordClick={p.onLookup}
                  activeIndex={p.activeExampleIndex}
                  revealedIndexes={p.revealedExampleIndexes}
                  onToggleReveal={p.onToggleExampleReveal}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
