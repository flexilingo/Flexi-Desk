import { TappableText } from '@/components/lookup/TappableText';
import { getLanguageDirection } from '@/config/languages';

/**
 * One page of the document.
 *
 * Direction is set ONCE here rather than inside the text renderer: the page is monolingual,
 * so there is no bidi mixing to isolate. The text size is a continuous value (rem), the one
 * inline style of the view.
 */
export function ReaderPageBody({
  text,
  language,
  scale,
  onSpeakWord,
  speakLabel,
  listen,
}: {
  text: string;
  language: string;
  scale: number;
  /** Tap to speak: a click says the word instead of opening it. */
  onSpeakWord?: (word: string) => void;
  /** A speaker after every paragraph reads it aloud (library books); off when absent. */
  speakLabel?: string;
  /**
   * The player bar on this page (library books): the sentence it reads is marked, and each
   * paragraph's speaker plays the bar from there. Absent where there is no player.
   */
  listen?: {
    activeSentence: { paragraph: number; sentence: number } | null;
    activeParagraph: number | null;
    /**
     * «Play from here» into the player bar. Absent where the player is locked for this reader:
     * each paragraph's speaker then reads just its paragraph — free for everyone, always.
     */
    playFrom?: (paragraph: number) => void;
    playLabel: string;
  };
}) {
  return (
    <div
      dir={getLanguageDirection(language)}
      lang={language}
      style={{ fontSize: `${scale}rem`, lineHeight: 1.8 }}
      className="text-foreground"
    >
      <TappableText
        text={text}
        className="mb-5 last:mb-0"
        language={language}
        speakOnHover={!onSpeakWord}
        markLookedUp
        onSpeakWord={onSpeakWord}
        paragraphSpeaker={
          listen?.playFrom
            ? { label: listen.playLabel, onPlay: listen.playFrom, playing: listen.activeParagraph }
            : speakLabel
              ? { label: speakLabel }
              : undefined
        }
        activeSentence={listen ? listen.activeSentence : undefined}
      />
    </div>
  );
}
