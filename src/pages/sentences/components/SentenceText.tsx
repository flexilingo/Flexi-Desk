import { Fragment, useMemo, useState } from 'react';
import {
  ChevronDown,
  Infinity as InfinityIcon,
  Loader2,
  Repeat,
  Square,
  Volume2,
} from 'lucide-react';
import { useLookup } from '@/components/lookup/lookup-context';
import { cleanWord, tokenize } from '@/components/lookup/tokenize';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getSpeechState, speak, stop, useSpeechState } from '@/lib/speech';
import { useLabel } from './labels';

/**
 * A whole sentence: every word opens the word dialog (in the practised language,
 * with the sentence as context), and ONE play control reads all of it.
 *
 * The voice is the app's own (`lib/speech.ts`). From the menu it plays the sentence
 * several times in a row, or until stopped — drilling by ear should not mean pressing
 * play again and again. (The website also offers a slower pass; the app's voices
 * have no speed control, so the menu has no such row. The listening card's own
 * clip does have it.)
 */
export function SentenceText({
  text,
  lang,
  className,
}: {
  text: string;
  lang: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <WordsOf text={text} lang={lang} />
      <SentenceSpeaker text={text} lang={lang} />
    </span>
  );
}

/** The words of a phrase, each one tappable; no voice of its own. */
export function WordsOf({ text, lang }: { text: string; lang: string }) {
  const lookup = useLookup();
  const tokens = useMemo(() => tokenize(text), [text]);
  return (
    <bdi dir="ltr" lang={lang} className="[unicode-bidi:isolate]">
      {tokens.map((tok, i) =>
        tok.word && lookup ? (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => lookup(cleanWord(tok.text), text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                lookup(cleanWord(tok.text), text);
              }
            }}
            className="cursor-pointer rounded-[4px] transition-colors hover:bg-accent/15 hover:text-accent"
          >
            {tok.text}
          </span>
        ) : (
          <Fragment key={i}>{tok.text}</Fragment>
        ),
      )}
    </bdi>
  );
}

let loopRun = 0;

/** `times` plays in a row (null = until stopped); another voice starting ends the loop. */
async function loopSpeak(
  text: string,
  lang: string,
  times: number | null,
  onRound: (n: number | null) => void,
) {
  const mine = ++loopRun;
  for (let round = 1; times === null || round <= times; round++) {
    if (mine !== loopRun) return;
    onRound(times === 1 ? null : round);
    await speak(text, lang);
    if (mine !== loopRun) return;
    // Someone else started speaking: the loop is over.
    if (getSpeechState().text) return;
    if (times === null || round < times) await new Promise((r) => setTimeout(r, 600));
  }
  if (mine === loopRun) onRound(null);
}

function stopAll() {
  loopRun++;
  stop();
}

/** Play once, or from the menu several times in a row / until stopped. The control says when it is playing. */
function SentenceSpeaker({ text, lang }: { text: string; lang: string }) {
  const label = useLabel();
  const clean = text.trim();
  const state = useSpeechState();
  const [round, setRound] = useState<{ n: number; of: number | null } | null>(null);
  const [open, setOpen] = useState(false);
  if (!clean) return null;

  const mine = state.text === clean;
  const loading = mine && state.loading;
  const busy = mine && (state.speaking || state.loading);
  const ui = (key: string) => label('ui', key);

  const run = (times: number | null) => {
    setOpen(false);
    void loopSpeak(clean, lang, times, (n) => setRound(n == null ? null : { n, of: times }));
  };

  const half =
    'inline-flex h-[1.15em] items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
  const tone = busy
    ? 'bg-primary text-primary-foreground'
    : 'bg-muted text-muted-foreground hover:bg-border hover:text-foreground';

  return (
    <span
      dir="ltr"
      className="ms-2 inline-flex translate-y-[0.1em] items-stretch overflow-hidden rounded-md align-baseline text-[0.55em]"
    >
      <button
        type="button"
        onClick={() => (busy ? stopAll() : run(1))}
        title={busy ? ui('stop') : ui('playOnce')}
        aria-label={busy ? ui('stop') : ui('playOnce')}
        className={cn(half, tone, 'gap-1.5 px-2')}
      >
        {loading ? (
          <Loader2 className="h-[0.8em] w-[0.8em] animate-spin" />
        ) : busy ? (
          <Square className="h-[0.6em] w-[0.6em] fill-current" />
        ) : (
          <Volume2 className="h-[0.85em] w-[0.85em]" />
        )}
        {busy && round && (
          <span className="text-[0.75em] font-bold tabular-nums">
            {round.n} / {round.of ?? '∞'}
          </span>
        )}
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={ui('playOptions')}
          title={ui('playOptions')}
          className={cn(half, tone, 'border-s border-border/60 px-1')}
        >
          <ChevronDown className="h-[0.7em] w-[0.7em]" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1.5 text-sm">
          <MenuRow onClick={() => run(1)} icon={<Volume2 className="h-4 w-4" />}>
            {ui('playOnce')}
          </MenuRow>
          <MenuRow onClick={() => run(3)} icon={<Repeat className="h-4 w-4" />}>
            {ui('repeat3')}
          </MenuRow>
          <MenuRow onClick={() => run(5)} icon={<Repeat className="h-4 w-4" />}>
            {ui('repeat5')}
          </MenuRow>
          <MenuRow onClick={() => run(null)} icon={<InfinityIcon className="h-4 w-4" />}>
            {ui('repeatLoop')}
          </MenuRow>
          {busy && (
            <MenuRow
              onClick={() => {
                stopAll();
                setOpen(false);
              }}
              icon={<Square className="h-4 w-4 fill-current" />}
              danger
            >
              {ui('stop')}
            </MenuRow>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}

function MenuRow({
  onClick,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-sm transition-colors hover:bg-muted',
        danger ? 'text-error' : 'text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
