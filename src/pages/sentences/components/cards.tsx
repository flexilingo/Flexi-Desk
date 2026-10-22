import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Eye,
  Infinity as InfinityIcon,
  Lightbulb,
  Loader2,
  Play,
  Repeat,
  RotateCcw,
  Square,
  Turtle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { speak } from '@/lib/speech';
import type { Dealt } from '../lib/practiceStore';
import { playClip, stopClip, useClipState, useOpenOnce } from '../lib/clip';
import type { PracticeSentence, PromptSide, Unit } from '../lib/types';
import { IpaLine } from './IpaLine';
import { useLabel } from './labels';
import { SentenceText } from './SentenceText';

/** One card of the loop: a surface with a border, never a shadow. */
export const CARD = 'overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6';

export function Chip({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
      {children}
    </p>
  );
}

/** Which unit the card belongs to — context in course order, and wherever a unit is picked. */
export function UnitBox({ unit }: { unit: Unit }) {
  const { t } = useTranslation('sentences');
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3" data-testid="unit-box">
      <span className="text-sm text-caption">{t('unitLabel', { unit: unit.unit })}</span>
      <p className="mt-0.5 text-base font-extrabold text-foreground">{unit.title}</p>
      <p className="mt-1 text-base leading-7 text-muted-foreground">{unit.can_do}</p>
    </div>
  );
}

/** Speaks the sentence once, as the card appears, when the learner turned autoplay on. */
export function AutoSpeak({ text, lang, on }: { text: string; lang: string; on: boolean }) {
  useEffect(() => {
    if (!on || !text) return;
    void speak(text, lang);
  }, [on, text, lang]);
  return null;
}

/**
 * The listening card: the sentence is played, never printed.
 *
 * Replay costs nothing and is the point — a learner should listen four times rather
 * than give up, and «Slower» plays the same clip at 0.7 for the pass where they are
 * picking out the words. How many plays it took travels with the answer, so the
 * history can tell a card caught first time from one that needed five.
 */
export function ListenPlayer({
  lang,
  id,
  plays,
  onPlay,
}: {
  lang: string;
  id: string;
  plays: number;
  onPlay: () => void;
}) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  const snap = useClipState();
  // This card IS audio: it opens by playing itself, once per card.
  useOpenOnce(id, () => void playClip(lang, id));

  // Every play of a loop is a play: the clip reports each one.
  const play = (rate: number, times: number | null = 1) =>
    void playClip(lang, id, { rate, times, onPlay });

  const busy = snap.loadingId === id;
  const playing = snap.playingId === id;
  const repeat = snap.repeat?.id === id ? snap.repeat : null;
  const chip =
    'inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors';
  const idle = 'border-input bg-muted text-muted-foreground hover:bg-border hover:text-foreground';
  const active = 'border-primary bg-primary text-primary-foreground';

  return (
    <div className="flex flex-col items-center gap-4 py-2" data-testid="listen-player">
      <button
        type="button"
        onClick={() => (busy || playing ? stopClip() : play(1))}
        aria-label={busy || playing ? label('ui', 'stop') : t('listen.play')}
        className={cn(
          'relative flex h-24 w-24 items-center justify-center rounded-full text-white transition-colors focus:outline-none focus-visible:ring-4',
          playing
            ? 'bg-primary hover:bg-primary/90 focus-visible:ring-primary/30'
            : 'bg-accent hover:bg-accent/90 focus-visible:ring-accent/30',
        )}
      >
        {busy ? (
          <Loader2 className="h-9 w-9 animate-spin" />
        ) : playing ? (
          <span className="flex flex-col items-center gap-1">
            <span aria-hidden className="inline-flex h-6 items-end gap-1">
              <span className="h-[45%] w-1.5 animate-pulse rounded-full bg-white" />
              <span className="h-full w-1.5 animate-pulse rounded-full bg-white [animation-delay:200ms]" />
              <span className="h-[70%] w-1.5 animate-pulse rounded-full bg-white [animation-delay:400ms]" />
            </span>
            <Square className="h-3.5 w-3.5 fill-current" />
          </span>
        ) : (
          <Play className="h-9 w-9 translate-x-0.5" />
        )}
      </button>

      {snap.failed === id && <p className="text-sm text-error">{t('errors.AUDIO_UNAVAILABLE')}</p>}

      {repeat && (
        <p className="text-sm font-bold tabular-nums text-primary" dir="ltr">
          {repeat.round} / {repeat.of ?? '∞'}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => play(1)} className={cn(chip, idle)}>
          <RotateCcw className="h-4 w-4" />
          {t('listen.again')}
        </button>
        <button type="button" onClick={() => play(0.7)} className={cn(chip, idle)}>
          <Turtle className="h-4 w-4" />
          {t('listen.slow')}
        </button>
        {([3, 5, null] as (number | null)[]).map((times) => {
          const on = repeat !== null && repeat.of === times;
          return (
            <button
              key={times ?? 'loop'}
              type="button"
              onClick={() => (on ? stopClip() : play(1, times))}
              className={cn(chip, on ? active : idle)}
            >
              {times === null ? (
                <InfinityIcon className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
              {times === null ? label('ui', 'repeatLoop') : label('ui', `repeat${times}`)}
            </button>
          );
        })}
      </div>

      {plays > 1 && <p className="text-sm text-caption">{t('listen.count', { count: plays })}</p>}
    </div>
  );
}

/**
 * The question. `card` carries only the side the direction asks from: the sentence
 * in recognition, the meaning in production, nothing in listening (a sealed clip).
 */
export function PromptCard({
  dealt,
  lang,
  busy,
  plays,
  autoPlay,
  onPlay,
  onReveal,
  onSubmit,
}: {
  dealt: Dealt;
  lang: string;
  busy: string | null;
  plays: number;
  autoPlay: boolean;
  onPlay: () => void;
  onReveal: () => void;
  onSubmit: (typed: string) => void;
}) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  const { dir, card } = dealt;
  const [typed, setTyped] = useState('');
  // A fresh card, or a retry of the same one (a new token), starts with an empty box.
  useEffect(() => setTyped(''), [dealt.token]);

  // Listening: the sentence is played and never printed. A question to answer is heard the same way.
  if (dir === 'listen' || dir === 'answer') {
    return (
      <div className={CARD} data-testid="prompt" data-dir={dir}>
        <Chip>{t(dir === 'answer' ? 'qa.prompt' : 'prompt.listen')}</Chip>
        {dealt.audio && <ListenPlayer lang={lang} id={dealt.audio} plays={plays} onPlay={onPlay} />}
        <div className="mt-2 flex justify-center">
          <Button
            variant="outline"
            loading={busy === 'reveal'}
            disabled={!!busy}
            onClick={onReveal}
            data-testid="reveal"
          >
            <Eye className="h-4 w-4" />
            {t('listen.seeText')}
          </Button>
        </div>
      </div>
    );
  }

  if (dir === 'recognize') {
    return (
      <div className={CARD} data-testid="prompt" data-dir={dir}>
        <Chip>{t('prompt.recognize')}</Chip>
        <p
          dir="ltr"
          className="text-3xl font-extrabold leading-relaxed text-foreground sm:text-4xl"
        >
          <SentenceText text={card.text} lang={lang} />
        </p>
        {card.ipa && (
          <IpaLine
            text={card.text}
            ipa={card.ipa}
            className="mt-2 font-mono text-base text-caption"
          />
        )}
        <AutoSpeak text={card.text} lang={lang} on={autoPlay} />
        {/* Reveal first; the question comes with the answer open — asking «did you know it?» here would be asking for a guess. */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            loading={busy === 'reveal'}
            disabled={!!busy}
            onClick={onReveal}
            data-testid="reveal"
          >
            <Eye className="h-4 w-4" />
            {t('revealMeaning')}
          </Button>
        </div>
      </div>
    );
  }

  const facts = card.analysis?.prompt_facts ?? [];
  return (
    <div className={CARD} data-testid="prompt" data-dir={dir}>
      <Chip>{t('prompt.produce')}</Chip>
      <p className="text-2xl font-extrabold leading-relaxed text-foreground sm:text-3xl">
        {card.meaning}
      </p>

      {/* The choices French forces that the meaning does not state. Without these the card asks an ambiguous question. */}
      {facts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <span
              key={f}
              className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm text-muted-foreground"
            >
              {label('facts', f)}
            </span>
          ))}
        </div>
      )}

      {card.hint && <Hint text={card.hint} />}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit(typed);
        }}
      >
        {/* Enter submits — a practice answer is one line. Never required: an empty answer means "I do not know", and it is graded. */}
        <Input
          type="text"
          dir="ltr"
          lang={lang}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={typed}
          disabled={!!busy}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t('typeHere')}
          aria-label={t('typeHere')}
          data-testid="answer-input"
          className="h-14 px-4 text-xl placeholder:text-end placeholder:text-base"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" loading={busy === 'check'} disabled={!!busy}>
            {t('check')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  const { t } = useTranslation('sentences');
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-primary hover:bg-muted"
      >
        <Lightbulb className="h-4 w-4" />
        {t('hint')}
      </button>
      {open && (
        <p className="mt-2 rounded-md border-s-2 border-warning bg-warning/10 p-3 text-base leading-7 text-muted-foreground">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * Listening, second step: the sentence written out, and nothing else.
 *
 * The meaning is not on this page at all. It arrives on the next one, which is the
 * whole point of the step: a learner who missed the sentence by ear gets to try
 * again by eye before being told. The ear is judged HERE, against the sentence that
 * just appeared — the only moment the learner can actually tell.
 */
export function ListenTextCard({
  sentence,
  lang,
  plays,
  onPlay,
  audio,
  onHeard,
}: {
  sentence: Pick<PracticeSentence, 'text' | 'ipa'>;
  lang: string;
  plays: number;
  onPlay: () => void;
  audio: string | null;
  onHeard: (heard: boolean) => void;
}) {
  const { t } = useTranslation('sentences');
  return (
    <div className={CARD} data-testid="listen-text">
      <Chip>{t('listen.textStep')}</Chip>
      <p dir="ltr" className="text-3xl font-extrabold leading-relaxed text-foreground sm:text-4xl">
        <SentenceText text={sentence.text} lang={lang} />
      </p>
      {sentence.ipa && (
        <IpaLine
          text={sentence.text}
          ipa={sentence.ipa}
          className="mt-2 font-mono text-base text-caption"
        />
      )}
      {audio && <ReplayRow lang={lang} id={audio} plays={plays} onPlay={onPlay} />}
      <div className="mt-5 border-t border-border pt-4">
        <p className="text-base font-bold text-foreground">{t('listen.askHeard')}</p>
        <p className="mt-1 text-sm leading-6 text-caption">{t('listen.askHeardHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => onHeard(true)}>
            <Check className="h-4 w-4" />
            {t('listen.heardIt')}
          </Button>
          <Button variant="outline" onClick={() => onHeard(false)}>
            <X className="h-4 w-4" />
            {t('listen.missedIt')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A quiet replay button for the steps after the audio card. */
function ReplayRow({
  lang,
  id,
  plays,
  onPlay,
}: {
  lang: string;
  id: string;
  plays: number;
  onPlay: () => void;
}) {
  const { t } = useTranslation('sentences');
  const snap = useClipState();
  const busy = snap.loadingId === id || snap.playingId === id;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (busy) return stopClip();
          void playClip(lang, id, { onPlay });
        }}
      >
        {busy ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5" />}
        {t('listen.again')}
      </Button>
      {plays > 1 && (
        <span className="text-sm text-caption">{t('listen.count', { count: plays })}</span>
      )}
    </div>
  );
}

/**
 * Question and answer, second step: the question written out WITH its meaning, and
 * the place to answer it. Understanding comes before answering — so the learner first
 * says whether they caught the question by ear, then writes an answer.
 */
export function AnswerStepCard({
  sentence,
  lang,
  busy,
  plays,
  onPlay,
  audio,
  onSubmit,
}: {
  sentence: Pick<PracticeSentence, 'text' | 'ipa' | 'meaning'>;
  lang: string;
  busy: string | null;
  plays: number;
  onPlay: () => void;
  audio: string | null;
  onSubmit: (typed: string, heard: boolean) => void;
}) {
  const { t } = useTranslation('sentences');
  const [heard, setHeard] = useState(true);
  const [typed, setTyped] = useState('');
  return (
    <div className={CARD} data-testid="answer-step">
      <Chip>{t('qa.step')}</Chip>
      <p dir="ltr" className="text-2xl font-extrabold leading-relaxed text-foreground sm:text-3xl">
        <SentenceText text={sentence.text} lang={lang} />
      </p>
      {sentence.ipa && (
        <IpaLine
          text={sentence.text}
          ipa={sentence.ipa}
          className="mt-2 font-mono text-base text-caption"
        />
      )}
      <p className="mt-2 text-lg text-muted-foreground">{sentence.meaning}</p>
      {audio && <ReplayRow lang={lang} id={audio} plays={plays} onPlay={onPlay} />}

      <form
        className="mt-5 space-y-4 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit(typed, heard);
        }}
      >
        <fieldset>
          <legend className="text-base font-bold text-foreground">{t('qa.heard')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {([true, false] as const).map((v) => (
              <label key={String(v)} className="cursor-pointer">
                <input
                  type="radio"
                  name="heard"
                  checked={heard === v}
                  onChange={() => setHeard(v)}
                  className="peer sr-only"
                />
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-muted px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground">
                  {v ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {t(v ? 'listen.heardIt' : 'listen.missedIt')}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="qa-answer" className="text-base font-bold text-foreground">
            {t('qa.write')}
          </label>
          <Input
            id="qa-answer"
            type="text"
            dir="ltr"
            lang={lang}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={typed}
            disabled={!!busy}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('qa.placeholder')}
            data-testid="answer-input"
            className="mt-2 h-14 px-4 text-xl placeholder:text-end placeholder:text-base"
          />
          <p className="mt-1.5 text-sm text-caption">{t('qa.slotsHint')}</p>
        </div>
        <Button type="submit" loading={busy === 'check'} disabled={!!busy}>
          {t('check')}
        </Button>
      </form>
    </div>
  );
}

export type { PromptSide };
