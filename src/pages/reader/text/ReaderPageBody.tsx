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
  activeParagraph,
}: {
  text: string;
  language: string;
  scale: number;
  /** Tap to speak: a click says the word instead of opening it. */
  onSpeakWord?: (word: string) => void;
  /** A speaker after every paragraph reads it aloud (library books); off when absent. */
  speakLabel?: string;
  /** The paragraph the «Listen» player is reading; absent where there is no player. */
  activeParagraph?: number | null;
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
        paragraphSpeaker={speakLabel ? { label: speakLabel } : undefined}
        activeParagraph={activeParagraph}
      />
    </div>
  );
}
