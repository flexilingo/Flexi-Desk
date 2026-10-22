import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, Square, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { pronounce, stopPronouncing, useSpeechState } from './pronounce';

/** Gap between two forms in a run-through: long enough to hear separate items. */
const FORM_GAP_MS = 260;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ONE voice for a whole conjugation block, driving both playback modes: a single
 * form, and a whole tense top to bottom. Every play bumps `runIdRef`, so an older
 * loop notices at its next checkpoint that it is stale and exits.
 */
export function useConjugationPlayer(lang: string) {
  const speech = useSpeechState();
  /** The form sounding right now, as `<tenseIndex>:<formIndex>`. */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [run, setRun] = useState<{ tense: number; index: number } | null>(null);
  const runIdRef = useRef(0);

  useEffect(
    () => () => {
      runIdRef.current++;
    },
    [],
  );

  const cancel = useCallback(() => {
    runIdRef.current++;
    setRun(null);
    setActiveKey(null);
    stopPronouncing();
  }, []);

  const playOne = useCallback(
    async (key: string, text: string) => {
      const id = ++runIdRef.current;
      setRun(null);
      setActiveKey(key);
      await pronounce(text, lang);
      if (runIdRef.current === id) setActiveKey(null);
    },
    [lang],
  );

  const playTense = useCallback(
    async (tense: number, forms: string[]) => {
      const id = ++runIdRef.current;
      for (let i = 0; i < forms.length; i++) {
        if (runIdRef.current !== id) return;
        setRun({ tense, index: i });
        setActiveKey(`${tense}:${i}`);
        await pronounce(forms[i], lang);
        if (runIdRef.current !== id) return;
        if (i < forms.length - 1) await sleep(FORM_GAP_MS);
      }
      if (runIdRef.current !== id) return;
      setRun(null);
      setActiveKey(null);
    },
    [lang],
  );

  return { activeKey, run, isLoading: speech.loading, playOne, playTense, cancel };
}

export type ConjugationPlayer = ReturnType<typeof useConjugationPlayer>;

/** Icon-only, neutral speaker; presentational (the voice lives in the shared player). */
export function FormSpeaker({
  active,
  loading,
  onPlay,
  label,
  size = 'sm',
}: {
  active: boolean;
  loading: boolean;
  onPlay: () => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const box = size === 'md' ? 'h-7 w-7' : 'h-5 w-5';
  return (
    <button
      type="button"
      onClick={onPlay}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        box,
        active
          ? 'animate-pulse bg-accent/10 text-accent'
          : size === 'md'
            ? 'bg-primary/[0.12] text-primary hover:bg-accent/10 hover:text-accent'
            : 'text-muted-foreground hover:bg-accent/10 hover:text-accent',
      )}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Volume2 className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      )}
    </button>
  );
}

/** Run a whole tense: one click, every person in order; a second click stops it. */
export function PlayTenseButton({
  player,
  index,
  forms,
}: {
  player: ConjugationPlayer;
  index: number;
  forms: string[];
}) {
  const { t } = useTranslation('wordDialog');
  const running = player.run?.tense === index;
  if (!forms.length) return null;
  const label = running ? t('stopPlayback') : t('playAll');
  return (
    <button
      type="button"
      onClick={() => (running ? player.cancel() : void player.playTense(index, forms))}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors',
        running
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-border text-muted-foreground hover:border-accent/40 hover:text-accent',
      )}
    >
      {running ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      <span dir="auto">
        {running ? `${(player.run?.index ?? 0) + 1}/${forms.length}` : t('playAll')}
      </span>
    </button>
  );
}
