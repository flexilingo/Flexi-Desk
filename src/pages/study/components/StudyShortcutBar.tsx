import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Quote,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Replay the word itself. */
  onReplayWord: () => void;
  onPrevExample: () => void;
  onNextExample: () => void;
  onToggleMeaning: () => void;
  onToggleLayout: () => void;
  /** Uncover one more example translation (top to bottom); wraps to hide-all. */
  onToggleExampleMeaning: () => void;
  /** Disables the example controls when the card has none. */
  exampleCount: number;
  /** 0-based index of the example currently playing, if any. */
  activeExampleIndex: number | null;
  /** How many examples actually carry a translation to uncover. */
  translatableExampleCount: number;
  /** Every one of those is already uncovered — the next press covers them. */
  allExampleMeaningsRevealed: boolean;
  meaningRevealed: boolean;
  /** Examples-first layout is on — the meaning key uncovers, it does not flip. */
  examplesFirst: boolean;
  isSpeaking: boolean;
  isLoading: boolean;
  /** Whether the answer side is showing — the example controls need it. */
  isAnswer: boolean;
}

/**
 * The focus-mode control strip — every keyboard shortcut, also as a button.
 *
 * It lives in the empty band under the card, where the eye already is, so a learner
 * reading with one hand on the keyboard and one on the mouse never has to aim at the
 * small icons inside the card. Rendered ONLY in focus mode: the bare-letter shortcuts
 * it advertises are bound only there.
 */
export function StudyShortcutBar({
  onReplayWord,
  onPrevExample,
  onNextExample,
  onToggleMeaning,
  onToggleLayout,
  onToggleExampleMeaning,
  exampleCount,
  activeExampleIndex,
  translatableExampleCount,
  allExampleMeaningsRevealed,
  meaningRevealed,
  examplesFirst,
  isSpeaking,
  isLoading,
  isAnswer,
}: Props) {
  const { t } = useTranslation('study', { keyPrefix: 'runner.shortcuts' });
  const hasExamples = exampleCount > 0 && isAnswer;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3"
      data-testid="shortcut-bar"
    >
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur">
        <ShortcutButton
          hint="R"
          label={t('replayWord')}
          onClick={onReplayWord}
          icon={
            isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Volume2 className={cn('h-3.5 w-3.5', isSpeaking && 'text-accent')} />
            )
          }
        />
        <span className="mx-0.5 h-5 w-px bg-border" />
        <ShortcutButton
          hint="W"
          label={t('prevExample')}
          onClick={onPrevExample}
          disabled={!hasExamples}
          icon={<SkipBack className="h-3.5 w-3.5 rtl:rotate-180" />}
        />
        <ShortcutButton
          hint="E"
          label={
            activeExampleIndex === null
              ? t('playExample')
              : t('exampleOf', { index: activeExampleIndex + 1, total: exampleCount })
          }
          onClick={onNextExample}
          disabled={!hasExamples}
          icon={<SkipForward className="h-3.5 w-3.5 rtl:rotate-180" />}
        />
        <ShortcutButton
          hint="T"
          label={allExampleMeaningsRevealed ? t('hideExampleMeanings') : t('showExampleMeaning')}
          onClick={onToggleExampleMeaning}
          disabled={!hasExamples || translatableExampleCount === 0}
          active={allExampleMeaningsRevealed}
          icon={<Languages className="h-3.5 w-3.5" />}
        />
        <span className="mx-0.5 h-5 w-px bg-border" />
        <ShortcutButton
          hint="M"
          label={meaningRevealed ? t('hideMeaning') : t('showMeaning')}
          onClick={onToggleMeaning}
          active={examplesFirst && !meaningRevealed}
          icon={
            meaningRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />
          }
        />
        <ShortcutButton
          hint="L"
          label={examplesFirst ? t('layoutExamples') : t('layoutMeaning')}
          onClick={onToggleLayout}
          active={examplesFirst}
          icon={<Quote className="h-3.5 w-3.5" />}
        />
        <span className="mx-0.5 h-5 w-px bg-border" />
        {/* Keys that already work everywhere — hints only, no button needed. */}
        <span className="hidden items-center gap-1.5 px-1 text-[11px] text-caption sm:inline-flex">
          <Key>Space</Key>
          {t('flip')}
          <Key>1–5</Key>
          {t('grade')}
          <Key>F</Key>
          {t('exitFocus')}
        </span>
      </div>
    </div>
  );
}

function ShortcutButton({
  hint,
  label,
  icon,
  onClick,
  disabled = false,
  active = false,
}: {
  hint: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} · ${hint}`}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        active
          ? 'border-accent/60 bg-accent/10 text-accent'
          : 'border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-accent',
      )}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
      <Key>{hint}</Key>
    </button>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-caption">
      {children}
    </kbd>
  );
}
