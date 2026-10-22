import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { TEXT_WORD_MARKERS, snapSelectionToWords } from '@/pages/reader/text/snap-selection';
import { SpeakButton } from './SpeakButton';
import { useLookup } from './lookup-context';
import { cleanWord, splitParagraphs, splitSentences, tokenize } from './tokenize';

/**
 * How long the cursor must REST on a word before it is offered a voice.
 *
 * The same 700ms the PDF page uses, and the same reason: a button that appears
 * under every word the cursor crosses is noise, while one that appears where
 * the cursor stopped is an answer to a question the reader just asked.
 */
const HOVER_DWELL_MS = 700;

/**
 * How long the offer stays after the cursor leaves the word.
 *
 * Because the button is BELOW the word, reaching it means leaving the word —
 * and without this grace the offer was withdrawn in the few pixels between the
 * two, so it could be seen but never clicked. Long enough to cross the gap,
 * short enough that a button nobody is heading for still goes away.
 */
const HOVER_GRACE_MS = 320;

/** How long the chip a tap raised (tap to speak) waits to be used. */
const TAP_CHIP_MS = 5000;

/** The looked-up mark: olive, because it reports state rather than asking for a click. */
const LOOKED_UP = [
  'underline',
  'decoration-dotted',
  'decoration-primary',
  'decoration-2',
  'underline-offset-[5px]',
];

/**
 * A block of reading text where every word opens the word dialog.
 *
 * Written rather than reusing `TargetLangText`, whose job is finding Latin runs
 * inside mixed-script prose. That job is a no-op when the whole page is one
 * language, and it actively fails here: it finds nothing at all in an Arabic or
 * Chinese document, and its IPA rule swallows any `and/or` in the text.
 *
 * Renders plain when no provider is mounted, matching the contract of the
 * other lookup text components so call sites never have to branch.
 */
export function TappableText({
  text,
  className,
  wordClassName,
  language,
  speakOnHover = false,
  markLookedUp = false,
  onSpeakWord,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  /** The language the words are IN — what their voice should sound like. */
  language?: string;
  /**
   * Resting on a word puts a speaker under it. Off by default: it belongs to
   * reading a page, not to every place a word happens to be tappable.
   */
  speakOnHover?: boolean;
  /**
   * A word that was looked up keeps a dotted underline for as long as its page
   * is open. The word dialog covers the page, and closing it used to drop the
   * reader back into a wall of text with no sign of where they had been.
   */
  markLookedUp?: boolean;
  /**
   * TAP TO SPEAK: a click says the word instead of opening it. The click also raises the
   * chip under the word, which still offers the translation (and the voice again).
   */
  onSpeakWord?: (word: string) => void;
}) {
  const { t } = useTranslation('reader');
  const lookup = useLookup();
  const host = useRef<HTMLDivElement | null>(null);

  /**
   * The word the cursor has settled on, and where to hang its play button.
   *
   * Carries the page text it was measured against. A page turn replaces the
   * words under the cursor without moving it, and a button still pointing at
   * where the old word was would be pointing at a different word now — so the
   * offer is simply not shown once the text it belongs to is gone.
   */
  const [spoken, setSpoken] = useState<{
    word: string;
    x: number;
    y: number;
    forText: string;
    /** Set when a click raised the chip: the sentence the translation is asked in. */
    sentence?: string;
  } | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const grace = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hot = useRef<HTMLElement | null>(null);

  const clearHot = useCallback(() => {
    clearTimeout(dwell.current);
    hot.current?.classList.remove('bg-accent/15');
    hot.current = null;
  }, []);

  /** Take the offer back, but only if the cursor does not come back for it. */
  const scheduleHide = useCallback(() => {
    clearTimeout(grace.current);
    grace.current = setTimeout(() => {
      clearHot();
      setSpoken(null);
    }, HOVER_GRACE_MS);
  }, [clearHot]);

  // Paragraph → sentence → token, memoised together: this runs over a whole
  // page and must not be redone on every unrelated re-render of the reader.
  const paragraphs = useMemo(
    () =>
      splitParagraphs(text).map((p) =>
        splitSentences(p).map((s) => ({ sentence: s, tokens: tokenize(s) })),
      ),
    [text],
  );

  // A new page reuses the same spans with new words in them, so the highlight
  // and the looked-up marks have to be taken off the DOM by hand — the node
  // survives, its word does not.
  useEffect(() => {
    clearHot();
    host.current?.querySelectorAll<HTMLElement>('[data-looked-up]').forEach((el) => {
      el.classList.remove(...LOOKED_UP);
      delete el.dataset.lookedUp;
    });
  }, [text, clearHot]);

  /** Open a word, marking it on the page first when the host asked for that. */
  const open = (el: HTMLElement, word: string, sentence: string) => {
    if (onSpeakWord) {
      onSpeakWord(word);
      const block = host.current;
      if (block) {
        const box = el.getBoundingClientRect();
        const frame = block.getBoundingClientRect();
        clearTimeout(grace.current);
        setSpoken({
          word,
          sentence,
          x: box.left + box.width / 2 - frame.left,
          y: box.bottom - frame.top,
          forText: text,
        });
        // A chip nobody reaches for goes away on its own.
        grace.current = setTimeout(() => setSpoken(null), TAP_CHIP_MS);
      }
      return;
    }
    if (markLookedUp) {
      el.classList.add(...LOOKED_UP);
      el.dataset.lookedUp = '';
    }
    lookup?.(word, sentence);
  };

  useEffect(
    () => () => {
      clearTimeout(dwell.current);
      clearTimeout(grace.current);
    },
    [],
  );

  /**
   * Rounding a drag out to whole words, exactly as the PDF page does.
   *
   * A selection is an INPUT to a translation, and `a a vingt-neuf ans. El` is
   * not something anyone can translate.
   *
   * A NATIVE listener in the CAPTURE phase on the document, and not React's
   * `onMouseUp`: the website wraps this block in `keepExtensionOut` (not needed on desk: no
   * browser extension), so a native listener it stays. On the document rather than the block, because a drag
   * ends wherever the pointer is — often in the margin beside the text — and a
   * listener on the block never heard those. The PDF page does the same.
   */
  useEffect(() => {
    const block = host.current;
    if (!block || !lookup) return;
    const snap = () => {
      const selection = window.getSelection();
      if (selection?.anchorNode && block.contains(selection.anchorNode))
        snapSelectionToWords(TEXT_WORD_MARKERS);
    };
    document.addEventListener('mouseup', snap, true);
    document.addEventListener('keyup', snap, true);
    return () => {
      document.removeEventListener('mouseup', snap, true);
      document.removeEventListener('keyup', snap, true);
    };
  }, [lookup]);

  const handleHover = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // A tap on a phone also fires mousemove, so without this every tapped
      // word was tinted and grew a speaker — on top of the dialog the tap opens.
      if (!speakOnHover || !window.matchMedia('(hover: hover)').matches) return;
      const from = event.target as HTMLElement | null;
      // The cursor is ON the button it was offered. Anything else here would
      // pull the button out from under the click that is already on its way.
      if (from?.closest('[data-flexi-say]')) {
        clearTimeout(grace.current);
        return;
      }

      const target = from?.closest<HTMLElement>('[data-flexi-word]');
      const word = target?.dataset.flexiWord;
      if (!target || !word) {
        clearTimeout(dwell.current);
        scheduleHide();
        return;
      }
      if (hot.current === target) {
        clearTimeout(grace.current);
        return;
      }

      clearTimeout(grace.current);
      clearHot();
      hot.current = target;
      // Immediate, unlike the button: the highlight says where the cursor is,
      // and a delay there just reads as lag.
      target.classList.add('bg-accent/15');

      // Restarted on every new word, so only stopping on one earns the button
      // — running the cursor across a line offers nothing.
      dwell.current = setTimeout(() => {
        const block = host.current;
        if (!block) return;
        // A drag in progress is a phrase, and the phrase chip is already
        // offering to say it. Two speakers over one selection is one too many.
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        const box = target.getBoundingClientRect();
        const frame = block.getBoundingClientRect();
        setSpoken({
          word,
          x: box.left + box.width / 2 - frame.left,
          y: box.bottom - frame.top,
          forText: text,
        });
      }, HOVER_DWELL_MS);
    },
    [speakOnHover, clearHot, scheduleHide, text],
  );

  // Leaving the block is decisive — there is no button out here to reach for.
  const handleLeave = useCallback(() => {
    clearTimeout(grace.current);
    clearHot();
    setSpoken(null);
  }, [clearHot]);

  if (!lookup) {
    return (
      <>
        {splitParagraphs(text).map((paragraph, i) => (
          <p key={i} className={className}>
            {paragraph}
          </p>
        ))}
      </>
    );
  }

  return (
    <div
      ref={host}
      data-lookup-text=""
      // A drag here is a phrase to translate, not a copy: the selection takes
      // the same accent as a hovered word (and as the PDF page's selection), so
      // it reads as ours and belongs with the chip that appears beside it. The
      // browser's own blue said nothing about what would happen next.
      className="relative selection:bg-accent/25 selection:text-foreground"
      onMouseMove={handleHover}
      onMouseLeave={handleLeave}
    >
      {paragraphs.map((sentences, pi) => (
        <p
          key={pi}
          // A bullet paragraph is hung off its marker rather than wrapped under
          // it, so a list reads as a list instead of as justified prose.
          className={`${className ?? ''} ${
            sentences[0]?.sentence.startsWith('• ') ? 'ps-6 -indent-4' : ''
          }`.trim()}
        >
          {sentences.map(({ sentence, tokens }, si) => (
            <Fragment key={si}>
              {si > 0 && ' '}
              {tokens.map((token, ti) =>
                token.word ? (
                  <span
                    key={ti}
                    role="button"
                    tabIndex={0}
                    // Read by the selection snapper and the hover handler, which
                    // work off the DOM rather than off React state — a page is
                    // hundreds of words and none of them may re-render on a
                    // cursor moving across the line.
                    data-flexi-word={cleanWord(token.text)}
                    // The SENTENCE is the context, never the page: a 2,000-char
                    // prompt translates worse and costs more than the one
                    // sentence the word actually sits in.
                    onClick={(e) => open(e.currentTarget, cleanWord(token.text), sentence)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        open(e.currentTarget, cleanWord(token.text), sentence);
                      }
                    }}
                    // The hover tint is what says a word can be tapped — without
                    // it the page reads as plain text. Same tint the dwell
                    // highlight uses, so the two never disagree. Only where there
                    // is a real hover, and focus only from the keyboard: on a
                    // phone a tap left both stuck on the word until the next tap.
                    className={
                      wordClassName ??
                      'cursor-pointer rounded-[3px] transition-colors [@media(hover:hover)]:hover:bg-accent/15 focus-visible:bg-accent/20 focus:outline-none'
                    }
                  >
                    {token.text}
                  </span>
                ) : (
                  <Fragment key={ti}>{token.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}

      {/* Offered, never fired — the same object as the phrase chip, because one
          word and several words are the same gesture at different sizes. */}
      {spoken?.forText === text && (
        <span
          data-flexi-say=""
          // Live pointer-derived coordinates: no Tailwind class can express them.
          style={{ left: spoken.x, top: spoken.y }}
          className="pointer-events-auto absolute z-[3] flex -translate-x-1/2 translate-y-1 items-center rounded-full border border-border bg-card p-1 shadow-lg"
        >
          <SpeakButton
            text={spoken.word}
            lang={language}
            title={spoken.word}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
          />
          {spoken.sentence !== undefined && lookup && (
            <button
              type="button"
              title={t('read.translateSelection')}
              aria-label={t('read.translateSelection')}
              onClick={() => {
                const word = spoken.word;
                const sentence = spoken.sentence ?? '';
                clearTimeout(grace.current);
                setSpoken(null);
                lookup(word, sentence);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
            >
              <Languages className="h-4 w-4" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
