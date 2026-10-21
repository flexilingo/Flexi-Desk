import { Loader2, Square, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { speak, stop, useSpeechState } from '@/lib/speech';

/**
 * Says `text` in `lang`. Stands in for the website's `TTSButton`.
 *
 * The same button is the stop button while its own text is being said, and shows
 * a spinner while the voice is being prepared — so a click always has a visible
 * receipt. Only reacts to ITS text: another button's voice does not make this
 * one spin.
 */
export function SpeakButton({
  text,
  lang,
  title,
  label,
  className,
  iconClassName = 'h-3.5 w-3.5',
}: {
  text: string;
  lang?: string;
  title?: string;
  /** Visible text beside the icon (the phone card). Omitted: icon only. */
  label?: string;
  className?: string;
  iconClassName?: string;
}) {
  const state = useSpeechState();
  const mine = state.text === text.trim();
  const loading = mine && state.loading;
  const busy = loading || (mine && state.speaking);

  return (
    <button
      type="button"
      title={title}
      aria-label={title ?? label ?? text}
      onClick={() => (busy ? stop() : void speak(text, lang))}
      className={cn(className)}
    >
      {loading ? (
        <Loader2 className={cn(iconClassName, 'animate-spin')} />
      ) : busy ? (
        <Square className={cn(iconClassName, 'fill-current')} />
      ) : (
        <Volume2 className={iconClassName} />
      )}
      {label}
    </button>
  );
}
