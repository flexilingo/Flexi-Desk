import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FastForward,
  Globe,
  Infinity as InfinityIcon,
  Languages,
  ListOrdered,
  MessageSquare,
  Minus,
  Plus,
  Repeat,
  RotateCw,
  Shuffle,
  Timer,
  Type,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  formatGapSeconds,
  GAP_MAX_MS,
  GAP_MIN_MS,
  GAP_STEP_MS,
  MEANING_CHOICES,
  REPEAT_EACH_CHOICES,
  REPEAT_EACH_MAX,
  ROUND_CHOICES,
  SIZE_CHOICES,
  type ShadowingPrefs,
} from '../lib/shadowingPrefs';
import {
  RowTitle,
  SettingsChoice,
  SettingsChoiceChip,
  SettingsGroup,
  SettingsHint,
  SettingsToggle,
} from './SettingsRows';

const ACCENTS = ['us', 'uk'] as const;

/**
 * The pause, in seconds, as a slider AND a number box. The slider steps by a tenth
 * of a second; the box takes any value (1.3, 2.75), because the pause is the
 * exercise and a whole-second dial cannot say how long a sentence takes to repeat.
 */
function GapControl({
  gapMs,
  onChange,
  active,
}: {
  gapMs: number;
  onChange: (ms: number) => void;
  active: boolean;
}) {
  const { t } = useTranslation('study');
  const [text, setText] = useState(String(gapMs / 1000));
  // Follow the slider (and another window) without fighting a half-typed "1.".
  useEffect(() => {
    if (Math.abs(Number(text) * 1000 - gapMs) > 0.5) setText(String(gapMs / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapMs]);

  const commit = (raw: string) => {
    setText(raw);
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    onChange(Math.min(GAP_MAX_MS, Math.max(GAP_MIN_MS, Math.round(v * 100) * 10)));
  };

  return (
    <div className={cn('space-y-2', !active && 'opacity-60')}>
      <RowTitle
        icon={Timer}
        title={t('shadowing.gap')}
        value={
          active ? (gapMs === 0 ? t('shadowing.gapNone') : formatGapSeconds(gapMs)) : undefined
        }
      />
      <div className="flex items-center gap-3">
        <Slider
          min={GAP_MIN_MS}
          max={GAP_MAX_MS}
          step={GAP_STEP_MS}
          value={[gapMs]}
          disabled={!active}
          onValueChange={([v]) => onChange(v)}
          aria-label={t('shadowing.gap')}
        />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="number"
            inputMode="decimal"
            min={GAP_MIN_MS / 1000}
            max={GAP_MAX_MS / 1000}
            step={0.1}
            value={text}
            disabled={!active}
            onChange={(e) => commit(e.target.value)}
            aria-label={t('shadowing.gapSeconds')}
            className="h-7 w-16 rounded-md border border-input bg-card px-2 text-end text-xs tabular-nums text-foreground focus-visible:border-accent/60 focus-visible:outline-none disabled:cursor-not-allowed"
          />
          {t('shadowing.secondsUnit')}
        </span>
      </div>
      <SettingsHint>{active ? t('shadowing.gapHint') : t('shadowing.gapOffHint')}</SettingsHint>
    </div>
  );
}

/**
 * Every shadowing setting, for the drill's start card and for the session's display
 * menu once a run is playing — and ONLY shadowing's. Groups run from what decides
 * the exercise to what is set once and left: the repetition itself, then what the
 * card shows, the audio, and the length of the run.
 */
export function ShadowingSettingsPanel({
  prefs,
  runSize,
  available,
  hasSpeakableMeaning = true,
  accent = 'us',
  onAccentChange,
  showAccent = false,
}: {
  prefs: ShadowingPrefs;
  /** Words in the run as configured — shown beside "Words per run". */
  runSize?: number;
  /** Cards the session has, so a size larger than that is disabled. */
  available?: number;
  /** False when no card in the run has a meaning the voice can read. */
  hasSpeakableMeaning?: boolean;
  accent?: 'us' | 'uk';
  onAccentChange?: (accent: 'us' | 'uk') => void;
  /** Something in the run is read by an English voice, the only voices the accent changes. */
  showAccent?: boolean;
}) {
  const { t } = useTranslation('study');
  const {
    size,
    setSize,
    gapMs,
    setGapMs,
    repeatEach,
    setRepeatEach,
    rounds,
    setRounds,
    shuffle,
    setShuffle,
    speakMeaning,
    setSpeakMeaning,
    autoAdvance,
    setAutoAdvance,
    meaning,
    setMeaning,
    showWord,
    setShowWord,
  } = prefs;
  const hasPause = autoAdvance || meaning === 'after';

  const repeatChip = (choice: number) => (
    <SettingsChoiceChip
      key={choice}
      active={repeatEach === choice}
      onClick={() => setRepeatEach(choice)}
    >
      {choice}×
    </SettingsChoiceChip>
  );
  const stepClass =
    'inline-flex h-7 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground';

  return (
    <>
      <SettingsGroup title={t('shadowing.groupRepeat')}>
        <SettingsChoice
          icon={Repeat}
          title={t('shadowing.repeatEach')}
          hint={t('shadowing.repeatEachHint')}
        >
          {REPEAT_EACH_CHOICES.map(repeatChip)}
          {/* Past the chips the count is a stepper, and its value gets a chip of its own. */}
          {!REPEAT_EACH_CHOICES.includes(repeatEach) && (
            <>
              <button
                type="button"
                onClick={() => setRepeatEach(Math.max(1, repeatEach - 1))}
                aria-label={t('shadowing.repeatLess')}
                title={t('shadowing.repeatLess')}
                className={stepClass}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              {repeatChip(repeatEach)}
            </>
          )}
          {repeatEach < REPEAT_EACH_MAX && (
            <button
              type="button"
              onClick={() => setRepeatEach(Math.min(REPEAT_EACH_MAX, repeatEach + 1))}
              aria-label={t('shadowing.repeatMore')}
              title={t('shadowing.repeatMore')}
              className={stepClass}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </SettingsChoice>

        {/* Above the pause on purpose: it decides whether there IS a pause. */}
        <SettingsToggle
          icon={FastForward}
          title={t('shadowing.autoAdvance')}
          hint={t('shadowing.autoAdvanceHint')}
          checked={autoAdvance}
          onChange={setAutoAdvance}
        />
        <GapControl gapMs={gapMs} onChange={setGapMs} active={hasPause} />
      </SettingsGroup>

      <SettingsGroup title={t('runner.cardView')}>
        <SettingsChoice
          icon={Languages}
          title={t('shadowing.meaningMode')}
          hint={t(`shadowing.meaningHint.${meaning}`)}
        >
          {MEANING_CHOICES.map((choice) => (
            <SettingsChoiceChip
              key={choice}
              active={meaning === choice}
              onClick={() => setMeaning(choice)}
            >
              {t(`shadowing.meaningOption.${choice}`)}
            </SettingsChoiceChip>
          ))}
        </SettingsChoice>
        <SettingsToggle
          icon={Type}
          title={t('runner.cardViewOption.showWord')}
          hint={showWord ? undefined : t('shadowing.showWordHint')}
          checked={showWord}
          onChange={setShowWord}
        />
      </SettingsGroup>

      <SettingsGroup title={t('runner.audio')}>
        {/* Off, not just greyed, when nothing here can be read: the stored
            preference is left alone for the next run that has a meaning it can read. */}
        <SettingsToggle
          icon={MessageSquare}
          title={t('shadowing.speakMeaning')}
          hint={t('shadowing.speakMeaningHint')}
          checked={speakMeaning && hasSpeakableMeaning}
          onChange={setSpeakMeaning}
          disabled={!hasSpeakableMeaning}
        />
        {showAccent && onAccentChange && (
          <SettingsChoice
            icon={Globe}
            title={t('runner.voiceAccent')}
            hint={t('runner.voiceAccentHint')}
          >
            {ACCENTS.map((choice) => (
              <SettingsChoiceChip
                key={choice}
                active={accent === choice}
                onClick={() => onAccentChange(choice)}
              >
                {t(`runner.voiceAccentOption.${choice}`)}
              </SettingsChoiceChip>
            ))}
          </SettingsChoice>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('shadowing.groupRun')}>
        <SettingsChoice
          icon={ListOrdered}
          title={t('shadowing.size')}
          value={runSize != null ? String(runSize) : undefined}
        >
          {SIZE_CHOICES.map((choice) => (
            <SettingsChoiceChip
              key={choice}
              active={size === choice}
              // A size the session cannot fill is not offered — except the one already picked.
              disabled={available != null && choice > 0 && choice > available && size !== choice}
              onClick={() => setSize(choice)}
            >
              {choice === 0 ? t('shadowing.sizeAll') : choice}
            </SettingsChoiceChip>
          ))}
        </SettingsChoice>
        <SettingsChoice icon={RotateCw} title={t('shadowing.rounds')}>
          {ROUND_CHOICES.map((choice) => (
            <SettingsChoiceChip
              key={choice}
              active={rounds === choice}
              title={choice === 0 ? t('shadowing.roundsInfinite') : undefined}
              onClick={() => setRounds(choice)}
            >
              {choice === 0 ? <InfinityIcon className="h-3.5 w-3.5" /> : `${choice}×`}
            </SettingsChoiceChip>
          ))}
        </SettingsChoice>
        <SettingsToggle
          icon={Shuffle}
          title={t('shadowing.shuffle')}
          checked={shuffle}
          onChange={setShuffle}
        />
      </SettingsGroup>
    </>
  );
}
