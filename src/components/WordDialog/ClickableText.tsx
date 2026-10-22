import { Fragment, useMemo } from 'react';
import { foldWord, formMatcher } from '@/lib/wordForms';

interface ClickableTextProps {
  text: string;
  onWordClick: (word: string, sentence?: string) => void;
  className?: string;
  /** The text's language. Chinese and Japanese put no spaces between words, so a word segmenter finds them. */
  lang?: string;
  /** The word already open, marked rather than offered, in every regular form. Further entries are forms marked only as written. */
  highlight?: string | readonly string[];
}

const PUNCTUATION = /[.,!?;:"()[\]{}“”«»‹›…–—،؛؟۔、。，！？：；「」]/g;

export function cleanWord(part: string): string {
  // Keep an apostrophe inside the word ("l'eau", "don't"); drop quotes around it.
  return part
    .replace(PUNCTUATION, '')
    .replace(/^['‘’]+|['‘’]+$/g, '')
    .trim();
}

const UNSPACED = new Set(['zh', 'ja', 'th']);

function splitWords(text: string, lang?: string): string[] {
  if (
    lang &&
    UNSPACED.has(lang) &&
    typeof Intl !== 'undefined' &&
    typeof Intl.Segmenter === 'function'
  ) {
    return Array.from(
      new Intl.Segmenter(lang, { granularity: 'word' }).segment(text),
      (s) => s.segment,
    );
  }
  return text.split(/(\s+)/);
}

function highlightedParts(
  parts: string[],
  text: string,
  highlight: string | readonly string[] | undefined,
  lang: string | undefined,
): Set<number> {
  const found = new Set<number>();
  const forms = (typeof highlight === 'string' ? [highlight] : (highlight ?? []))
    .map((f) => f.trim())
    .filter(Boolean);
  if (!forms.length) return found;

  const isForm = formMatcher(forms, lang ?? '');
  parts.forEach((part, i) => {
    const word = cleanWord(part);
    if (word && isForm(word)) found.add(i);
  });

  // Phrases are matched where they occur, accents and case aside.
  const folded = foldWord(text);
  if (folded.length !== text.length) return found;
  for (const phrase of forms.filter((f) => /\s/.test(f)).map(foldWord)) {
    for (
      let at = folded.indexOf(phrase);
      at !== -1;
      at = folded.indexOf(phrase, at + phrase.length)
    ) {
      let start = 0;
      parts.forEach((part, i) => {
        const end = start + part.length;
        if (/\S/.test(part) && start < at + phrase.length && end > at) found.add(i);
        start = end;
      });
    }
  }
  return found;
}

/** Text with every word clickable; the full text travels as the word's sentence. */
export function ClickableText({
  text,
  onWordClick,
  className = '',
  lang,
  highlight,
}: ClickableTextProps) {
  const shown = useMemo(() => text.normalize('NFC'), [text]);
  const parts = useMemo(() => splitWords(shown, lang), [shown, lang]);
  const marked = useMemo(
    () => highlightedParts(parts, shown, highlight, lang),
    [parts, shown, highlight, lang],
  );

  return (
    <span className={className}>
      {parts.map((part, idx) =>
        !part || /^\s+$/.test(part) || !cleanWord(part) ? (
          <Fragment key={idx}>{part}</Fragment>
        ) : marked.has(idx) ? (
          <span key={idx} className="-mx-0.5 rounded-[3px] bg-success/30 px-0.5 text-foreground">
            {part}
          </span>
        ) : (
          <span
            key={idx}
            className="cursor-pointer transition-colors hover:text-accent hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const clean = cleanWord(part);
              if (clean) onWordClick(clean, text);
            }}
          >
            {part}
          </span>
        ),
      )}
    </span>
  );
}
