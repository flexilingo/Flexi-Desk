import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  Globe,
  Languages,
  Quote,
  Type,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import {
  STUDY_VISIBILITY_KEYS,
  type StudyCardVisibility,
  type StudyVisibilityKey,
} from '../lib/viewPrefs';
import { SettingsChoice, SettingsChoiceChip, SettingsGroup, SettingsToggle } from './SettingsRows';

const ACCENTS = ['us', 'uk'] as const;

const VISIBILITY_ICON: Record<StudyVisibilityKey, LucideIcon> = {
  showWord: Type,
  showMeaning: Languages,
  showExampleMeanings: Quote,
};

/**
 * Normal study's settings, for the Normal tab of the shadowing start card. They are
 * the same switches as the session's display menu, laid out with the same row
 * primitives so the two tabs read as one form. Picking the tab only SHOWS them;
 * the mode changes when Start is pressed.
 */
export function NormalStudySettingsPanel({
  visibility,
  onVisibilityChange,
  reverseCard,
  onReverseCardChange,
  reverseCardError = null,
  pronounceWordOnReveal,
  onPronounceWordOnRevealChange,
  autoPronounce,
  onAutoPronounceChange,
  accent,
  onAccentChange,
  showAccent,
}: {
  visibility: StudyCardVisibility;
  onVisibilityChange: (key: StudyVisibilityKey, value: boolean) => void;
  reverseCard: boolean;
  onReverseCardChange: (value: boolean) => void;
  reverseCardError?: string | null;
  /** Under reverse: read the word when a reversed card is flipped to it. */
  pronounceWordOnReveal: boolean;
  onPronounceWordOnRevealChange: (value: boolean) => void;
  autoPronounce: boolean;
  onAutoPronounceChange: (value: boolean) => void;
  accent: 'us' | 'uk';
  onAccentChange: (accent: 'us' | 'uk') => void;
  showAccent: boolean;
}) {
  const { t } = useTranslation('study');
  return (
    <>
      <SettingsGroup title={t('runner.cardView')}>
        <SettingsToggle
          icon={ArrowLeftRight}
          title={t('runner.reverseCard')}
          hint={t('runner.reverseCardHint')}
          checked={reverseCard}
          onChange={onReverseCardChange}
        />
        {reverseCardError && (
          <p role="alert" className="text-[11px] leading-snug text-error">
            {reverseCardError}
          </p>
        )}
        {/* Reverse's own option — indented under it, and only while it is on. */}
        {reverseCard && (
          <div className="ps-6">
            <SettingsToggle
              icon={Volume2}
              title={t('runner.pronounceWordOnReveal')}
              hint={t('runner.pronounceWordOnRevealHint')}
              checked={pronounceWordOnReveal}
              onChange={onPronounceWordOnRevealChange}
            />
          </div>
        )}
        {STUDY_VISIBILITY_KEYS.map((key) => (
          <SettingsToggle
            key={key}
            icon={VISIBILITY_ICON[key]}
            title={t(`runner.cardViewOption.${key}`)}
            hint={t(`runner.cardViewHint.${key}`)}
            checked={visibility[key]}
            onChange={(value) => onVisibilityChange(key, value)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title={t('runner.audio')}>
        <SettingsToggle
          icon={Volume2}
          title={t('runner.autoPronounce')}
          hint={t('runner.autoPronounceHint')}
          checked={autoPronounce}
          onChange={onAutoPronounceChange}
        />
        {showAccent && (
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
    </>
  );
}
