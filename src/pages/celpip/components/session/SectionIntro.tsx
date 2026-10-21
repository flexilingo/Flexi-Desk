import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  ChevronRight,
  Mic,
  MicOff,
  CheckCircle,
  Loader2,
  Headphones,
  BookOpen,
  PenLine,
  RefreshCw,
  Keyboard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMicrophonePermission } from './useMicrophonePermission';
import type { SectionType } from '../../types';

interface SectionTone {
  icon: LucideIcon;
  tile: string;
  iconColor: string;
  chip: string;
}

// Literal token classes — one identity colour per section.
const SECTION_TONES: Record<SectionType, SectionTone> = {
  listening: {
    icon: Headphones,
    tile: 'bg-success/10 border border-success/30',
    iconColor: 'text-success',
    chip: 'bg-success/10 text-success',
  },
  reading: {
    icon: BookOpen,
    tile: 'bg-accent/10 border border-accent/30',
    iconColor: 'text-accent',
    chip: 'bg-accent/10 text-accent',
  },
  writing: {
    icon: PenLine,
    tile: 'bg-primary/10 border border-primary/30',
    iconColor: 'text-primary',
    chip: 'bg-primary/10 text-primary',
  },
  speaking: {
    icon: Mic,
    tile: 'bg-warning/10 border border-warning/30',
    iconColor: 'text-warning',
    chip: 'bg-warning/10 text-warning',
  },
};

type BrowserKind = 'chrome' | 'safari' | 'firefox' | 'other';

// Order matters: Chrome/Edge UAs also contain "Safari".
function detectBrowser(): BrowserKind {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/edg\/|chrome|crios/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}

interface SectionIntroProps {
  sectionType: SectionType;
  onStart: () => void;
  requiresMic?: boolean;
  /** Speaking only — start the section in typed-answers mode (no microphone). */
  onStartTyped?: () => void;
}

export function SectionIntro({
  sectionType,
  onStart,
  requiresMic,
  onStartTyped,
}: SectionIntroProps) {
  const { t } = useTranslation('celpip');
  const { status, requestPermission } = useMicrophonePermission();
  const [showMicHint, setShowMicHint] = useState(false);
  const tone = SECTION_TONES[sectionType];
  const Icon = tone.icon;

  const micReady = !requiresMic || status === 'granted';
  const browser = detectBrowser();
  const unblockStep1 = t(
    browser === 'chrome'
      ? 'micUnblockStep1Chrome'
      : browser === 'safari'
        ? 'micUnblockStep1Safari'
        : browser === 'firefox'
          ? 'micUnblockStep1Firefox'
          : 'micUnblockStep1Generic',
  );

  const handleBegin = () => {
    if (micReady) {
      onStart();
    } else {
      setShowMicHint(true);
    }
  };

  const typedFallbackLink = onStartTyped && (
    <button
      onClick={onStartTyped}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
    >
      <Keyboard className="w-3.5 h-3.5" />
      {t('micTypedFallback')}
    </button>
  );

  const tryAgainButton = (
    <button
      onClick={requestPermission}
      className="inline-flex items-center gap-1.5 bg-card border border-error/40 text-error hover:bg-error/10 text-[12px] font-semibold py-1.5 px-3 rounded-[8px] transition-colors"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      {t('micTryAgain')}
    </button>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 md:p-8 bg-background">
      <div className="max-w-md w-full bg-card rounded-[16px] border border-border shadow-sm p-6 md:p-8 flex flex-col items-center text-center">
        <div
          className={`w-12 h-12 rounded-[14px] flex items-center justify-center mb-4 ${tone.tile}`}
        >
          <Icon className={`w-5 h-5 ${tone.iconColor}`} />
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-extrabold text-foreground tracking-tight leading-tight mb-2">
          {t(`sectionIntro.${sectionType}.title`)}
        </h2>
        <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
          {t(`sectionIntro.${sectionType}.description`)}
        </p>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold mb-6 ${tone.chip}`}
        >
          <Clock className="w-3 h-3" />
          {t(`sectionIntro.${sectionType}.duration`)}
        </div>

        {requiresMic && (
          <div className="mb-6 text-start w-full">
            {status === 'idle' && (
              <div className="flex flex-col items-start gap-2.5 p-4 rounded-[12px] bg-warning/10 border border-warning/40">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-warning" />
                  <p className="text-[13px] font-bold text-foreground">{t('micCheckTitle')}</p>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {t('micCheckDescription')}
                </p>
                <button
                  onClick={requestPermission}
                  className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[12.5px] font-semibold py-2 px-3.5 rounded-[9px] transition-all"
                >
                  <Mic className="w-3.5 h-3.5" />
                  {t('micCheckAllow')}
                </button>
                {typedFallbackLink}
              </div>
            )}

            {status === 'pending' && (
              <div className="flex items-center justify-center gap-2 p-4 rounded-[12px] bg-muted border border-border">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-[12.5px] text-muted-foreground">{t('micCheckPending')}</span>
              </div>
            )}

            {status === 'granted' && (
              <div className="flex items-center gap-2 p-3.5 rounded-[12px] bg-success/10 border border-success/40">
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-[12.5px] text-success font-semibold">
                  {t('micCheckGranted')}
                </span>
              </div>
            )}

            {status === 'denied' && (
              <div className="flex flex-col gap-3 p-4 rounded-[12px] bg-error/10 border border-error/40">
                <div className="flex items-start gap-2.5">
                  <MicOff className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-[12.5px] font-bold text-error">{t('micDeniedTitle')}</p>
                </div>
                <ol className="flex flex-col gap-1.5 text-[12px] text-muted-foreground leading-relaxed list-none">
                  {[unblockStep1, t('micUnblockStep2')].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-error/15 text-error text-[10.5px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="flex items-center gap-3 flex-wrap">
                  {tryAgainButton}
                  {typedFallbackLink}
                </div>
              </div>
            )}

            {status === 'no-device' && (
              <div className="flex flex-col gap-2.5 p-4 rounded-[12px] bg-error/10 border border-error/40">
                <div className="flex items-start gap-2.5">
                  <MicOff className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-error">{t('micNoDevice')}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {tryAgainButton}
                  {typedFallbackLink}
                </div>
              </div>
            )}

            {status === 'in-use' && (
              <div className="flex flex-col gap-2.5 p-4 rounded-[12px] bg-warning/10 border border-warning/40">
                <div className="flex items-start gap-2.5">
                  <MicOff className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-muted-foreground">{t('micInUse')}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {tryAgainButton}
                  {typedFallbackLink}
                </div>
              </div>
            )}

            {status === 'unsupported' && (
              <div className="flex flex-col gap-2.5 p-4 rounded-[12px] bg-warning/10 border border-warning/40">
                <div className="flex items-start gap-2.5">
                  <MicOff className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-muted-foreground">{t('micUnsupported')}</p>
                </div>
                {typedFallbackLink}
              </div>
            )}
          </div>
        )}

        {showMicHint && !micReady && (
          <p className="mb-3 text-[12px] text-error font-medium">{t('micRequiredHint')}</p>
        )}

        <Button onClick={handleBegin}>
          {t('startSection')}
          <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
