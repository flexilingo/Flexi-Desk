import { useTranslation } from 'react-i18next';
import { AudioLines } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VoiceSettings } from '@/components/WordDialog/VoiceSettings';
import { speak } from '@/lib/speech';
import { cn } from '@/lib/utils';

/**
 * The study session's pronunciation dialog, opened from the display menu in BOTH
 * modes: which voice reads aloud (automatic, the natural cloud voice, or this
 * computer's), the region for the language being studied, and — for English — the
 * accent. The same picker as the word dialog's, so a change here is heard on the
 * next card and everywhere else. Every pick reads the word on screen in the voice
 * just chosen.
 */
export function PronunciationSettingsDialog({
  open,
  onOpenChange,
  language,
  sampleText,
  accent,
  onAccentChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The language of the cards being studied. */
  language: string;
  /** The word on screen, read when a voice is picked. */
  sampleText: string;
  accent: 'us' | 'uk';
  onAccentChange: (accent: 'us' | 'uk') => void;
}) {
  const { t } = useTranslation('study');
  const pickAccent = (choice: 'us' | 'uk') => {
    onAccentChange(choice);
    const clean = sampleText.trim();
    if (clean) void speak(clean, language, { accent: choice });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5 text-start">
          <DialogTitle className="inline-flex items-center gap-2 text-[17px] font-bold text-foreground">
            <AudioLines className="h-4 w-4 text-accent" />
            {t('runner.pronunciationTitle')}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-snug text-caption">
            {t('runner.pronunciationSub')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          <VoiceSettings language={language} sampleText={sampleText} showAutoPronounce={false} />
          {language === 'en' && (
            <section className="space-y-1.5">
              <p className="m-0 text-[13px] font-semibold text-foreground">
                {t('runner.voiceAccent')}
              </p>
              <div className="flex gap-1.5" role="group" aria-label={t('runner.voiceAccent')}>
                {(['us', 'uk'] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={accent === choice}
                    onClick={() => pickAccent(choice)}
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
              <p className="m-0 text-[11px] leading-snug text-caption">
                {t('runner.voiceAccentHint')}
              </p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
