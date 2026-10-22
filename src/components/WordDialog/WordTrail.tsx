import { createContext, useContext } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Looking a word up from inside the word dialog: every word the dialog shows
 * (translation, example, synonym, collocation) opens the next level in the same
 * dialog, and the trail above the word walks back up. A word in the
 * translation's language is read the other way round.
 */
export interface WordTrail {
  /** `lang` is the language of the text the word was clicked in. */
  lookUp: (word: string, sentence: string | undefined, lang: string) => void;
  /** Whether a word in `lang` can be looked up (the pair it needs exists). */
  canLookUp: (lang: string) => boolean;
  /** The word on screen and its known forms, marked in its own language's text instead of offered. */
  current: { lang: string; forms: readonly string[] };
}

const WordTrailContext = createContext<WordTrail | null>(null);
export const WordTrailProvider = WordTrailContext.Provider;

/** Null outside the dialog: text then renders plain. */
export function useWordTrail(): WordTrail | null {
  return useContext(WordTrailContext);
}

/** The trail above the word: a back button and every word on the way here. Nothing until one level deep. */
export function WordTrailNav({
  words,
  dir,
  onGoTo,
}: {
  words: string[];
  dir: 'ltr' | 'rtl';
  onGoTo: (index: number) => void;
}) {
  const { t } = useTranslation('wordDialog');
  if (words.length < 2) return null;
  const last = words.length - 1;
  const back = t('trail.back', { word: words[last - 1] });

  return (
    <nav aria-label={t('trail.label')} dir={dir} className="mb-2 flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => onGoTo(last - 1)}
        aria-label={back}
        title={back}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-primary transition-colors hover:bg-muted/70"
      >
        <ArrowLeft className="h-3.5 w-3.5 [&:dir(rtl)]:rotate-180" />
      </button>
      <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-0.5 gap-y-1 p-0">
        {words.map((w, i) => (
          <li key={i} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && (
              <ChevronRight
                className="h-3 w-3 shrink-0 text-muted-foreground [&:dir(rtl)]:rotate-180"
                aria-hidden="true"
              />
            )}
            {i === last ? (
              <span
                aria-current="page"
                className="max-w-[10rem] truncate px-1 text-[12.5px] font-semibold text-foreground"
              >
                {w}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onGoTo(i)}
                className="max-w-[10rem] truncate rounded-[7px] px-1 text-[12.5px] font-medium text-primary transition-colors hover:bg-muted"
              >
                {w}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
