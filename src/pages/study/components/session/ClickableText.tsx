import { Fragment } from 'react';

interface Props {
  text: string;
  /** Opens the dictionary for the tapped word, with the full sentence as context. */
  onWordClick: (word: string, sentence: string) => void;
  className?: string;
}

/**
 * Splits text into tappable word tokens (desk's answer to the front's `LookupText`),
 * so any word the learner reads during an activity can be looked up in the shared
 * the word dialog. Punctuation and whitespace stay inert.
 */
export function ClickableText({ text, onWordClick, className }: Props) {
  if (!text) return null;
  // Keep separators in the output so spacing/punctuation render unchanged.
  const parts = text.split(/([^\p{L}\p{N}'’-]+)/u);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        const isWord = /[\p{L}\p{N}]/u.test(part);
        if (!isWord) return <Fragment key={i}>{part}</Fragment>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onWordClick(part, text)}
            className="rounded-sm hover:bg-primary/15 hover:text-primary transition-colors"
          >
            {part}
          </button>
        );
      })}
    </span>
  );
}
