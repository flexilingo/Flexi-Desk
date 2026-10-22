import type { ReactNode } from 'react';
import { Loader2, Square, Volume2, type LucideIcon } from 'lucide-react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';
import { ClickableText } from './ClickableText';
import { directionOf } from './languages';
import { pronounce, stopPronouncing, useSpeakerState, voiceFor } from './pronounce';
import { useWordTrail } from './WordTrail';

/**
 * The word dialog's few building blocks, shared by its tabs: one radius, one
 * border weight per role, one rhythm between sections. Colour comes from the
 * semantic tokens only, so light and dark both follow the app's palette.
 */

type Tone = 'primary' | 'success' | 'warning' | 'neutral';

const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  neutral: 'text-muted-foreground',
};

/** A titled block. Sections stack with `space-y-6` in their tab. */
export function Section({
  label,
  icon: Icon,
  tone = 'neutral',
  children,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section>
      <p
        className={cn(
          'm-0 mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
          TONE_TEXT[tone],
        )}
      >
        {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
        {label}
      </p>
      {children}
    </section>
  );
}

/**
 * The answer, the one thing the reader opened the dialog for. Primary for the
 * translation, accent for the AI reading of the word in its sentence.
 */
export function AnswerCard({
  label,
  icon: Icon,
  text,
  note,
  dir,
  lang,
  tone = 'primary',
}: {
  label: string;
  icon?: LucideIcon;
  text: string;
  note?: string | null;
  dir: 'ltr' | 'rtl';
  /** The answer's language; its words open the next level of the dialog. */
  lang?: string | null;
  tone?: 'primary' | 'accent';
}) {
  const accent = tone === 'accent';
  return (
    <div
      className={cn(
        'rounded-[12px] border-2 px-4 py-3.5',
        accent ? 'border-accent bg-muted' : 'border-primary bg-primary/10',
      )}
    >
      <p
        className={cn(
          'm-0 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
          accent ? 'text-accent' : 'text-primary',
        )}
      >
        {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
        {label}
      </p>
      <p
        dir={dir}
        className={cn(
          'm-0 text-[20px] font-semibold leading-relaxed md:text-[22px]',
          accent ? 'text-accent' : 'text-primary',
        )}
      >
        <LookupSentence text={text} lang={lang} />
      </p>
      {note && (
        <p dir={dir} className="m-0 mt-1 text-[14px] leading-6 text-muted-foreground">
          <LookupSentence text={note} lang={lang} />
        </p>
      )}
    </div>
  );
}

/** A plain card: prose, a definition. `tone` tints it for a tip. */
export function Card({
  children,
  dir,
  tone,
}: {
  children: ReactNode;
  dir?: 'ltr' | 'rtl';
  tone?: 'warning';
}) {
  return (
    <div
      dir={dir}
      className={cn(
        'rounded-[12px] border px-4 py-3 text-[14px] leading-6 text-muted-foreground',
        tone === 'warning' ? 'border-warning/60 bg-warning/[0.06]' : 'border-border bg-card',
      )}
    >
      {children}
    </div>
  );
}

const CHIP =
  'inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-[13px] text-muted-foreground';

/** A small label: an alternative translation, a part of speech, a register. */
export function Chip({ children, dir }: { children: ReactNode; dir?: 'ltr' | 'rtl' }) {
  return (
    <span dir={dir} className={CHIP}>
      {children}
    </span>
  );
}

/**
 * A chip (a synonym, a collocation, an alternative translation) that opens
 * itself as the next level of the dialog. The phrase travels without a sentence.
 */
export function LookupChip({
  text,
  lang,
  dir,
}: {
  text: string;
  lang: string | null | undefined;
  dir?: 'ltr' | 'rtl';
}) {
  const trail = useWordTrail();
  if (!trail || !lang || !trail.canLookUp(lang)) return <Chip dir={dir}>{text}</Chip>;
  return (
    <button
      type="button"
      dir={dir}
      onClick={() => trail.lookUp(text, undefined, lang)}
      className={cn(
        CHIP,
        'cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {text}
    </button>
  );
}

/** Text with every word clickable: a click opens that word as the next level, read in this sentence. */
export function LookupSentence({ text, lang }: { text: string; lang: string | null | undefined }) {
  const trail = useWordTrail();
  if (!trail || !lang || !trail.canLookUp(lang)) return <>{text}</>;
  return (
    <ClickableText
      text={text}
      lang={lang}
      highlight={lang === trail.current.lang ? trail.current.forms : undefined}
      onWordClick={(word, sentence) => trail.lookUp(word, sentence, lang)}
    />
  );
}

/** Small speaker for an example sentence; turns into a real Stop while it plays. */
export function SpeakButton({
  text,
  lang,
  className,
}: {
  text: string;
  lang: string;
  className?: string;
}) {
  const tag = voiceFor(lang) || lang;
  const { loading, playing } = useSpeakerState(text, tag);
  return (
    <button
      type="button"
      onClick={() => (loading || playing ? stopPronouncing() : void pronounce(text, lang))}
      aria-label={text}
      title={text}
      className={cn(
        'me-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent text-primary transition-colors hover:bg-accent/10 hover:text-accent',
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : playing ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </button>
  );
}

/** Examples as ONE card with rows; the success rule down its side is the examples' colour. */
export function ExampleList({
  examples,
  sourceLanguage,
  targetLanguage,
  targetDir,
}: {
  examples: { source: string; target?: string }[];
  sourceLanguage: string;
  targetLanguage: string | null;
  targetDir: 'ltr' | 'rtl';
}) {
  return (
    <ul className="m-0 list-none divide-y divide-border rounded-[12px] border border-s-[3px] border-border border-s-success bg-card p-0">
      {examples.map((example, index) => (
        <li key={index} className="px-4 py-3">
          <p
            className="m-0 flex items-start gap-1.5 text-[15px] italic leading-relaxed text-foreground"
            dir={directionOf(sourceLanguage)}
          >
            <SpeakButton text={example.source} lang={sourceLanguage} />
            <span>
              <LookupSentence text={example.source} lang={sourceLanguage} />
            </span>
          </p>
          {example.target && (
            <p
              dir={targetDir}
              className="m-0 mt-1 text-[14px] leading-relaxed text-muted-foreground"
            >
              <LookupSentence text={example.target} lang={targetLanguage} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Centered loading state. */
export function LoadingBlock({
  label,
  tone = 'primary',
}: {
  label: string;
  tone?: 'primary' | 'accent';
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-8 py-12" role="status">
      <div
        className={cn(
          'h-8 w-8 animate-spin rounded-full border-[3px] border-muted',
          tone === 'accent' ? 'border-t-accent' : 'border-t-primary',
        )}
      />
      <span className="text-sm italic text-muted-foreground">{label}</span>
    </div>
  );
}

/** Inline error: keeps the dialog open, says what happened, lets the reader retry. */
export function ErrorBox({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div>
      <div role="alert" className="rounded-[12px] border border-error/30 bg-error/10 p-5">
        <p className="m-0 flex items-center gap-2 text-sm text-error">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {message}
        </p>
      </div>
      {children && <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Content-sized button in the dialog's own look. `accent` is the single action of a panel. */
export function ActionButton({
  children,
  onClick,
  variant = 'accent',
  loading,
  disabled,
  title,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'accent' | 'primary' | 'quiet';
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60',
        variant === 'accent' && 'bg-accent text-accent-foreground hover:bg-accent/90',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'quiet' && 'border border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Square icon-only button for the header. */
export function IconButton({
  children,
  onClick,
  label,
  pressed,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:h-4 [&_svg]:w-4',
        pressed && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** On/off switch (state is primary; accent is reserved for the one action). */
export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-muted transition-colors data-[state=checked]:bg-primary"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-card shadow transition-transform data-[state=checked]:translate-x-[18px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}
