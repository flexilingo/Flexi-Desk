import { useMemo } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pronounce, stopPronouncing, useSpeakerState } from './pronounce';

/** One word, not a phrase. A Chinese or Japanese sentence has no spaces, so the text is segmented in its own language. */
export function isSingleWord(text: string, language: string): boolean {
  if (!text || /\s/.test(text)) return false;
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return true;
  let words = 0;
  for (const part of new Intl.Segmenter(language, { granularity: 'word' }).segment(text)) {
    if (part.isWordLike && ++words > 1) return false;
  }
  return true;
}

/**
 * The header speaker: reads the text in the WORD'S language, in the voice region
 * it names (fr-CA, en-GB), labelled so two speakers need no colour to be told apart.
 */
export function PronounceButton({
  text,
  language,
  voice,
  label,
  title,
}: {
  text: string;
  language: string;
  voice: string;
  label: string;
  title: string;
}) {
  const trimmed = text.trim();
  const single = useMemo(() => isSingleWord(trimmed, language), [trimmed, language]);
  const { loading, playing } = useSpeakerState(trimmed, voice);
  if (!trimmed) return null;

  // A word is under a second of audio: a second tap means "again", not "stop".
  // A sentence keeps the stop, since there a tap while playing usually means "enough".
  const replay = playing && single;
  const busy = loading || playing;
  const stopLabel = busy && !replay;

  return (
    <button
      type="button"
      onClick={() => (stopLabel ? stopPronouncing() : void pronounce(trimmed, language, voice))}
      title={title}
      aria-label={title}
      className={cn(
        'flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full border border-border bg-muted px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-muted/60',
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : playing && !replay ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      <span>{label}</span>
    </button>
  );
}
