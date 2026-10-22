import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  availableEngines,
  speak,
  useSpeechPreference,
  type SpeechEngine,
  type SpeechPreference,
} from '@/lib/speech';
import { REGIONAL_VOICES } from './logic';
import { usePronunciationSettings, voiceFor } from './pronounce';
import { Switch } from './ui';

const chip = (selected: boolean) =>
  cn(
    'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
    selected
      ? 'border-primary/40 bg-primary/15 text-primary'
      : 'border-border text-muted-foreground hover:bg-muted',
  );

const ENGINE_LABEL: Record<Exclude<SpeechPreference, 'system'>, string> = {
  auto: 'voiceAuto',
  cloud: 'voiceMicrosoft',
  device: 'voiceDevice',
};

/**
 * The dialog's pronunciation settings: read the word aloud when it opens, which
 * voice reads (automatic, the natural cloud voice, or this computer's), and the
 * region for languages that have one. Every pick reads the word in what was just
 * chosen, so the learner hears it.
 */
export function VoiceSettings({
  language,
  sampleText,
  showAutoPronounce = true,
}: {
  language: string;
  sampleText: string;
  /** The word dialog's "read it when it opens" switch; a study session has its own and hides this one. */
  showAutoPronounce?: boolean;
}) {
  const { t } = useTranslation('wordDialog');
  const { autoPronounce, setAutoPronounce, setVoice } = usePronunciationSettings();
  const [preference, setPreference] = useSpeechPreference();
  const engines = availableEngines(language);
  const options = (['auto', 'cloud', 'device'] as const).filter(
    (e) => e === 'auto' || engines.includes(e as SpeechEngine),
  );
  const regions = REGIONAL_VOICES[language];
  const ownRegion = voiceFor(language) ?? regions?.[0];

  const sample = (tag: string, engine?: SpeechEngine) => {
    const clean = sampleText.trim();
    if (clean) void speak(clean, tag, engine ? { engines: [engine] } : {});
  };

  return (
    <section className="space-y-3">
      <p className="m-0 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Volume2 className="h-3.5 w-3.5 text-accent" />
        {t('pronunciationGroup')}
      </p>

      {showAutoPronounce && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-foreground">{t('autoPronounce')}</p>
            <p className="m-0 text-[11px] leading-snug text-muted-foreground">
              {t('autoPronounceHint')}
            </p>
          </div>
          <Switch
            checked={autoPronounce}
            onCheckedChange={setAutoPronounce}
            label={t('autoPronounce')}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted-foreground">{t('voice')}</span>
        <div className="flex flex-wrap gap-1.5">
          {options.map((engine) => (
            <button
              key={engine}
              type="button"
              aria-pressed={preference === engine}
              onClick={() => {
                setPreference(engine);
                sample(
                  ownRegion ?? language,
                  engine === 'auto' ? undefined : (engine as SpeechEngine),
                );
              }}
              className={chip(preference === engine)}
            >
              {t(ENGINE_LABEL[engine])}
            </button>
          ))}
        </div>
      </div>

      {regions && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">{t('accent')}</span>
          <div className="flex flex-wrap gap-1.5">
            {regions.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={ownRegion === tag}
                onClick={() => {
                  setVoice(language, tag);
                  sample(tag);
                }}
                className={chip(ownRegion === tag)}
              >
                {t(`voiceRegions.${tag.replace('-', '_')}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
