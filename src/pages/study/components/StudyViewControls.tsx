import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  AudioLines,
  Check,
  Globe,
  Keyboard,
  Languages,
  Maximize2,
  Minimize2,
  Quote,
  Settings,
  SlidersHorizontal,
  Type,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  STUDY_TEXT_SIZES,
  STUDY_VISIBILITY_KEYS,
  type StudyCardVisibility,
  type StudyTextSizeId,
  type StudyVisibilityKey,
} from '../lib/viewPrefs';
import { shortcutRows } from '../lib/shortcutRows';

/** The size each option previews itself at, so the control shows the choice rather than describing it. */
const PREVIEW_CLS: Record<StudyTextSizeId, string> = {
  compact: 'text-[12px]',
  comfortable: 'text-[15px]',
  large: 'text-[18px]',
  huge: 'text-[22px]',
};

const VISIBILITY_ICON: Record<StudyVisibilityKey, LucideIcon> = {
  showWord: Type,
  showMeaning: Languages,
  showExampleMeanings: Quote,
};

function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-caption">
      {children}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-px font-mono text-[10px] text-caption">
      {children}
    </kbd>
  );
}

/** A checkbox row of the menu: olive when on, because it reports state — it is not the screen's one action. */
function MenuCheck({
  icon: Icon,
  title,
  hint,
  checked,
  onChange,
  error,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string | null;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-muted',
        checked ? 'bg-primary/[0.06]' : 'text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0 text-caption" />
          {title}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-caption">{hint}</span>}
        {error && (
          <span role="alert" className="mt-1 block text-[11px] leading-snug text-error">
            {error}
          </span>
        )}
      </span>
    </button>
  );
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
  kbd,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  kbd?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-muted-foreground transition-colors hover:bg-muted"
    >
      <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-caption">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-[13px] font-semibold text-foreground">{label}</span>
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

/** A header icon button that drops a panel below itself; outside click and Esc close it (Radix). */
function MenuPopover({
  icon,
  label,
  width,
  children,
}: {
  icon: ReactNode;
  label: string;
  width: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          title={label}
          aria-label={label}
          aria-haspopup="menu"
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        role="menu"
        // Capped and scrolled: with the shadowing settings under the mode the menu is taller than a laptop screen.
        className={cn('max-h-[min(80vh,760px)] overflow-y-auto p-1.5', width)}
      >
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

export interface StudyViewControlsProps {
  textSize: StudyTextSizeId;
  onTextSizeChange: (id: StudyTextSizeId) => void;
  /** What the card shows. Omit to drop that block (shadowing keeps its own). */
  visibility?: StudyCardVisibility;
  onVisibilityChange?: (key: StudyVisibilityKey, value: boolean) => void;
  /** Reverse direction — the card's two sides swap. Omit to drop the row. */
  reverseCard?: boolean;
  onReverseCardChange?: (value: boolean) => void;
  reverseCardError?: string | null;
  /** Under reverse: read the word aloud when a reversed card is flipped to it. */
  pronounceWordOnReveal?: boolean;
  onPronounceWordOnRevealChange?: (value: boolean) => void;
  /** Auto-pronounce, at the TOP of the menu: it is decided while looking at a card. */
  autoPronounce?: boolean;
  onAutoPronounceChange?: (value: boolean) => void;
  /** The English voice, under auto-pronounce. Omit when nothing on screen is English. */
  accent?: 'us' | 'uk';
  onAccentChange?: (accent: 'us' | 'uk') => void;
  /** The menu's heading — whose settings these are. Pinned while the rest scrolls. */
  title?: string;
  /** The session's mode picker and, under it, that mode's own settings. */
  modePicker?: ReactNode;
  modeSettings?: ReactNode;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  /** Opens the pronunciation dialog (voice, speaker, accent). */
  onOpenPronunciation?: () => void;
  /** Opens the session settings dialog — the last row. */
  onSettings?: () => void;
  /** The activity on screen binds the flashcard keys; only the recall card does. */
  cardShortcuts: boolean;
}

/**
 * The reading controls of the study header: one display menu plus the keyboard
 * shortcut sheet. Everything that changes how the session LOOKS lives in the single
 * menu — what the card shows, how big the type is, fullscreen — because all of it is
 * adjusted WHILE reading, and a modal that covers the card makes the result impossible to judge.
 */
export function StudyViewControls({
  textSize,
  onTextSizeChange,
  visibility,
  onVisibilityChange,
  reverseCard,
  onReverseCardChange,
  reverseCardError,
  pronounceWordOnReveal,
  onPronounceWordOnRevealChange,
  autoPronounce,
  onAutoPronounceChange,
  accent,
  onAccentChange,
  title,
  modePicker,
  modeSettings,
  focusMode,
  onToggleFocusMode,
  onOpenPronunciation,
  onSettings,
  cardShortcuts,
}: StudyViewControlsProps) {
  const { t } = useTranslation('study');

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <MenuPopover icon={<SlidersHorizontal />} label={t('runner.viewMenu')} width="w-[360px]">
        {(close) => (
          <>
            {title && (
              <div className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1.5 border-b border-border bg-popover px-3.5 pb-2.5 pt-3 text-[13px] font-bold text-foreground">
                {title}
              </div>
            )}
            {modePicker && (
              <>
                <MenuHeading>{t('mode')}</MenuHeading>
                <div className="px-2.5 pb-2">{modePicker}</div>
                {modeSettings && <div className="space-y-4 px-2.5 pb-2 pt-1">{modeSettings}</div>}
                <div className="my-1.5 h-px bg-border" />
              </>
            )}

            {/* Audio first: auto-pronounce is the one setting learners actually change mid-session. */}
            {autoPronounce !== undefined && (
              <>
                <MenuHeading>{t('runner.audio')}</MenuHeading>
                <MenuCheck
                  icon={Volume2}
                  title={t('runner.autoPronounce')}
                  hint={t('runner.autoPronounceHint')}
                  checked={autoPronounce}
                  onChange={(v) => onAutoPronounceChange?.(v)}
                />
                {accent && onAccentChange && (
                  <div className="px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-caption" />
                      {t('runner.voiceAccent')}
                    </span>
                    <div
                      className="mt-1.5 flex gap-1.5"
                      role="group"
                      aria-label={t('runner.voiceAccent')}
                    >
                      {(['us', 'uk'] as const).map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          role="menuitemradio"
                          aria-checked={accent === choice}
                          onClick={() => onAccentChange(choice)}
                          className={cn(
                            'inline-flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-bold transition-colors',
                            accent === choice
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                          )}
                        >
                          {t(`runner.voiceAccentOption.${choice}`)}
                        </button>
                      ))}
                    </div>
                    <span className="mt-1 block text-[11px] leading-snug text-caption">
                      {t('runner.voiceAccentHint')}
                    </span>
                  </div>
                )}
                <div className="my-1.5 h-px bg-border" />
              </>
            )}

            {visibility && (
              <>
                <MenuHeading>{t('runner.cardView')}</MenuHeading>
                {reverseCard !== undefined && onReverseCardChange && (
                  <MenuCheck
                    icon={ArrowLeftRight}
                    title={t('runner.reverseCard')}
                    hint={t('runner.reverseCardHint')}
                    checked={reverseCard}
                    onChange={onReverseCardChange}
                    error={reverseCardError}
                  />
                )}
                {/* Belongs to reverse, so it sits under it, indented, and only while reverse is on. */}
                {reverseCard &&
                  pronounceWordOnReveal !== undefined &&
                  onPronounceWordOnRevealChange && (
                    <div className="ps-7">
                      <MenuCheck
                        icon={Volume2}
                        title={t('runner.pronounceWordOnReveal')}
                        hint={t('runner.pronounceWordOnRevealHint')}
                        checked={pronounceWordOnReveal}
                        onChange={onPronounceWordOnRevealChange}
                      />
                    </div>
                  )}
                {STUDY_VISIBILITY_KEYS.map((key) => (
                  <MenuCheck
                    key={key}
                    icon={VISIBILITY_ICON[key]}
                    title={t(`runner.cardViewOption.${key}`)}
                    hint={t(`runner.cardViewHint.${key}`)}
                    checked={visibility[key]}
                    onChange={(v) => onVisibilityChange?.(key, v)}
                  />
                ))}
                <div className="my-1.5 h-px bg-border" />
              </>
            )}

            {/* Text size as a segmented row rather than four more stacked rows. Each cell renders "Aa" at its
                own size, so it previews the choice instead of naming it. */}
            <MenuHeading>{t('runner.textSize')}</MenuHeading>
            <div className="flex items-stretch gap-1 px-1 pb-1">
              {STUDY_TEXT_SIZES.map(({ id }) => {
                const active = id === textSize;
                const label = t(`runner.textSizeOption.${id}`);
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    aria-label={label}
                    title={label}
                    onClick={() => onTextSizeChange(id)}
                    className={cn(
                      'inline-flex h-11 flex-1 items-center justify-center rounded-md border transition-colors',
                      active
                        ? 'border-accent/60 bg-accent/10 text-accent'
                        : 'border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-accent',
                    )}
                  >
                    <span className={cn('font-semibold leading-none', PREVIEW_CLS[id])}>Aa</span>
                  </button>
                );
              })}
            </div>

            <div className="my-1.5 h-px bg-border" />

            {/* Closed on the way out: the menu is not a place to sit while the viewport changes shape underneath it. */}
            <MenuAction
              icon={focusMode ? Minimize2 : Maximize2}
              label={focusMode ? t('runner.exitFocusMode') : t('runner.focusMode')}
              kbd="F"
              onClick={() => {
                close();
                onToggleFocusMode();
              }}
            />
            {onOpenPronunciation && (
              <MenuAction
                icon={AudioLines}
                label={t('runner.pronunciationSettings')}
                onClick={() => {
                  close();
                  onOpenPronunciation();
                }}
              />
            )}
            {onSettings && (
              <MenuAction
                icon={Settings}
                label={t('runner.settings')}
                onClick={() => {
                  close();
                  onSettings();
                }}
              />
            )}
          </>
        )}
      </MenuPopover>

      {/* Keyboard shortcuts — the point is discoverability, so it is a button on the bar and not a line in the docs. */}
      <MenuPopover icon={<Keyboard />} label={t('runner.shortcutsTitle')} width="w-[320px]">
        {() => <ShortcutSheet focusMode={focusMode} cardShortcuts={cardShortcuts} />}
      </MenuPopover>
    </div>
  );
}

function ShortcutSheet({
  focusMode,
  cardShortcuts,
}: {
  focusMode: boolean;
  cardShortcuts: boolean;
}) {
  const { t } = useTranslation('study', { keyPrefix: 'runner' });
  const rows = shortcutRows(focusMode, cardShortcuts, t as (k: string) => string);
  return (
    <>
      <MenuHeading>{t('shortcutsTitle')}</MenuHeading>
      <div className="px-1 pb-1">
        {rows.map((row) => (
          <div
            key={row.keys.join('')}
            className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-[5px]"
          >
            <span className="min-w-0 text-xs text-muted-foreground">{row.label}</span>
            <span className="flex shrink-0 items-center gap-0.5">
              {row.keys.map((k) =>
                k === '…' ? (
                  <span key={k} className="text-[11px] text-caption">
                    …
                  </span>
                ) : (
                  <Kbd key={k}>{k}</Kbd>
                ),
              )}
            </span>
          </div>
        ))}
      </div>
      {!focusMode && cardShortcuts && (
        <p className="px-2.5 pb-1.5 text-[10px] leading-snug text-caption">
          {t('shortcutList.moreInFocus')}
        </p>
      )}
    </>
  );
}
