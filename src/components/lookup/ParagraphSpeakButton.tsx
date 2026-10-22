import { Loader2, Square, Volume2 } from 'lucide-react';
import { getSpeechState, speak, stop, useSpeechState } from '@/lib/speech';

/** The cloud voice refuses more than 500 characters; leave headroom. */
const MAX_CHUNK = 440;

/** A paragraph as pieces the voice accepts: whole sentences packed up to MAX_CHUNK. */
export function paragraphChunks(sentences: string[]): string[] {
  const out: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    // One run-on sentence longer than the cap is cut at its last space before it.
    const pieces: string[] = [];
    let rest = s;
    while (rest.length > MAX_CHUNK) {
      const cut = rest.lastIndexOf(' ', MAX_CHUNK);
      const at = cut > 0 ? cut : MAX_CHUNK;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
    for (const p of pieces) {
      if (current && current.length + 1 + p.length > MAX_CHUNK) {
        out.push(current);
        current = p;
      } else {
        current = current ? `${current} ${p}` : p;
      }
    }
  }
  if (current) out.push(current);
  return out;
}

// One paragraph reads at a time; a new tap (here or anywhere) ends the running chain.
let chain = 0;

/**
 * The speaker at the end of a paragraph: reads the whole paragraph aloud with the app's
 * voice stack, piece by piece, and stops when tapped again or when anything else speaks.
 */
export function ParagraphSpeakButton({
  sentences,
  lang,
  label,
}: {
  sentences: string[];
  lang?: string;
  label: string;
}) {
  const chunks = paragraphChunks(sentences);
  const state = useSpeechState();
  const mine = state.text !== null && chunks.includes(state.text);
  const busy = mine && (state.loading || state.speaking);

  const play = async () => {
    const id = ++chain;
    for (const piece of chunks) {
      if (chain !== id) return;
      await speak(piece, lang);
      // Something else started speaking (or stop was pressed): this chain is over.
      if (chain !== id || (getSpeechState().text !== null && getSpeechState().text !== piece)) return;
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (busy) {
          chain++;
          stop();
        } else {
          void play();
        }
      }}
      aria-label={label}
      title={label}
      className="ms-1.5 inline-flex h-6 w-6 translate-y-[-1px] items-center justify-center rounded-full align-middle text-success transition-colors hover:bg-success/15"
    >
      {mine && state.loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : busy ? (
        <Square className="h-3 w-3 fill-current text-accent" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
