import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasRtl } from '../../lib/cardLang';
import { normalizeExamples, type ExampleItem } from '../../lib/examples';
import { useSpeak } from '../../hooks/useSpeak';

/** A fixed row of dots, never one per character: the mask must not leak how long the answer is. */
const MASK = '•'.repeat(40);

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Splits text into tappable word tokens (punctuation and spaces stay inert), highlighting the target word. */
function Sentence({
  text,
  highlight,
  onWordClick,
}: {
  text: string;
  highlight?: string;
  onWordClick?: (word: string) => void;
}) {
  const parts =
    highlight && highlight.trim()
      ? text.split(new RegExp(`(${escapeRegex(highlight.trim())})`, 'gi'))
      : [text];
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = !!highlight && part.toLowerCase() === highlight.trim().toLowerCase();
        if (isMatch) {
          return (
            <strong
              key={i}
              className="font-bold text-accent underline decoration-accent/40 decoration-dotted underline-offset-2"
            >
              {part}
            </strong>
          );
        }
        return (
          <Fragment key={i}>
            {part.split(/([^\p{L}\p{N}'’-]+)/u).map((tok, j) =>
              /[\p{L}\p{N}]/u.test(tok) && onWordClick ? (
                <button
                  key={j}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onWordClick(tok);
                  }}
                  className="rounded-sm transition-colors hover:bg-accent/10 hover:text-accent"
                >
                  {tok}
                </button>
              ) : (
                <Fragment key={j}>{tok}</Fragment>
              ),
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Every example sentence stacked vertically — all at once reads better than a
 * carousel and needs no interaction. Each row has its audio button, the highlighted
 * target word, tappable words for the dictionary, and its translation behind an eye
 * (driven from outside, so the keyboard can uncover the row that is playing).
 */
export function ExampleList({
  examples,
  highlightWord,
  onWordClick,
  language,
  activeIndex,
  revealedIndexes,
  onToggleReveal,
}: {
  examples: ExampleItem[];
  highlightWord?: string;
  onWordClick?: (word: string, sentence: string) => void;
  /** Language the examples are written in — the voice that reads them. */
  language?: string;
  /** Row being spoken via the keyboard, highlighted. */
  activeIndex: number | null;
  revealedIndexes: number[];
  onToggleReveal: (index: number) => void;
}) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  const rows = normalizeExamples(examples);
  if (rows.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-success">
        {t('insights.examples')}
      </div>
      <div className="space-y-2">
        {rows.map(({ text, translation }, i) => {
          const revealed = revealedIndexes.includes(i);
          return (
            <div
              key={i}
              data-testid="example-row"
              data-active={i === activeIndex ? 'true' : undefined}
              className={cn(
                'rounded-lg border-s-[3px] px-3 py-2.5 transition-colors',
                i === activeIndex ? 'border-accent bg-accent/10' : 'border-success/40 bg-muted/50',
              )}
            >
              <div className="flex items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => void speak(text, language)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-caption transition-colors hover:bg-muted hover:text-foreground"
                  title={t('runner.listen')}
                  aria-label={t('runner.listen')}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
                <p
                  className="flex-1 text-[0.95em] italic leading-relaxed text-foreground"
                  dir={hasRtl(text) ? 'rtl' : 'ltr'}
                >
                  <Sentence
                    text={text}
                    highlight={highlightWord}
                    onWordClick={onWordClick ? (w) => onWordClick(w, text) : undefined}
                  />
                </p>
              </div>
              {translation && (
                <div className="mt-1.5 flex items-center gap-1.5 ps-7 text-[0.88em] text-muted-foreground">
                  {revealed ? (
                    <span className="flex-1" dir="auto">
                      {translation}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleReveal(i)}
                      aria-label={t('runner.revealMeaning')}
                      className="block min-w-0 flex-1 select-none overflow-hidden whitespace-nowrap text-start tracking-wide text-caption transition-colors hover:text-accent"
                    >
                      {MASK}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleReveal(i)}
                    aria-pressed={revealed}
                    title={revealed ? t('runner.hideMeaning') : t('runner.revealMeaning')}
                    aria-label={revealed ? t('runner.hideMeaning') : t('runner.revealMeaning')}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-caption transition-colors hover:text-accent"
                  >
                    {revealed ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
