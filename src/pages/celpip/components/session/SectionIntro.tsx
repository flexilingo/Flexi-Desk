import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  ChevronRight,
  Mic,
  CheckCircle,
  Loader2,
  Headphones,
  BookOpen,
  PenLine,
  SkipForward,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMicrophonePermission } from './useMicrophonePermission';
import { MicAccessPanel } from '@/components/mic/MicAccessPanel';
import MicLevelCheck from '../speaking/MicLevelCheck';
import { ConfirmDialog } from './ConfirmDialog';
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

interface SectionIntroProps {
  sectionType: SectionType;
  onStart: () => void;
  requiresMic?: boolean;
  /** Practice slice: how many items/tasks this run holds (replaces the full-paper count). */
  itemCount?: number;
  /**
   * Questions (listening/reading) or tasks this sitting really holds, put into the
   * full exam's "55 minutes • {{n}} questions" copy instead of a fixed figure.
   */
  questionCount?: number;
  /** Where the intro copy lives: `sectionIntro` in `celpip`, `tcf.sectionIntro` in `exam`. */
  copyPrefix?: string;
  copyNs?: 'celpip' | 'exam';
  /**
   * Speaking without a working microphone: submit the section unanswered so the
   * exam can still be finished. Resolves true once the server holds it.
   */
  onSkipSection?: () => Promise<boolean>;
}

// Mic states that cannot record: unblock steps + Try again + Skip.
const MIC_BLOCKED = new Set(['denied', 'no-device', 'in-use', 'silent', 'unsupported']);

export function SectionIntro({
  sectionType,
  onStart,
  requiresMic,
  itemCount,
  questionCount,
  copyPrefix = 'sectionIntro',
  copyNs = 'celpip',
  onSkipSection,
}: SectionIntroProps) {
  const { t } = useTranslation('celpip');
  const { t: tx, i18n } = useTranslation(copyNs);
  const { t: tExam } = useTranslation('exam');
  const i18nHas = (key: string) => i18n.exists(key, { ns: copyNs });
  const { status, requestPermission } = useMicrophonePermission();
  const [showMicHint, setShowMicHint] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  const tone = SECTION_TONES[sectionType];
  const Icon = tone.icon;

  const micReady = !requiresMic || status === 'granted';

  const micBlocked = !!requiresMic && MIC_BLOCKED.has(status);

  const confirmSkip = async () => {
    if (!onSkipSection) return;
    setSkipping(true);
    setSkipFailed(false);
    try {
      // On failure the dialog stays open with the error, ready for another try.
      if (await onSkipSection()) setSkipOpen(false);
      else setSkipFailed(true);
    } catch {
      setSkipFailed(true);
    } finally {
      setSkipping(false);
    }
  };

  const skipButton = onSkipSection ? (
    <button
      type="button"
      data-testid="skip-speaking-section"
      onClick={() => setSkipOpen(true)}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
    >
      <SkipForward className="h-3.5 w-3.5" />
      {t('micSkipSection')}
    </button>
  ) : undefined;

  const handleBegin = () => {
    if (micReady) {
      onStart();
    } else {
      setShowMicHint(true);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 md:p-8 bg-background">
      <div className="max-w-md w-full bg-card rounded-[16px] border border-border shadow-sm p-6 md:p-8 flex flex-col items-center text-center">
        <div
          className={`w-12 h-12 rounded-[14px] flex items-center justify-center mb-4 ${tone.tile}`}
        >
          <Icon className={`w-5 h-5 ${tone.iconColor}`} />
        </div>
        <h2 className="text-[20px] sm:text-[22px] font-extrabold text-foreground tracking-tight leading-tight mb-2">
          {tx(`${copyPrefix}.${sectionType}.title`)}
        </h2>
        <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
          {/* Writing and speaking name a count in their copy, which a practice
              subset contradicts — those carry a countless variant. */}
          {itemCount !== undefined && i18nHas(`${copyPrefix}.${sectionType}.practiceDescription`)
            ? tx(`${copyPrefix}.${sectionType}.practiceDescription`)
            : tx(`${copyPrefix}.${sectionType}.description`)}
        </p>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold mb-6 ${tone.chip}`}
        >
          <Clock className="w-3 h-3" />
          {itemCount === undefined
            ? tx(`${copyPrefix}.${sectionType}.duration`, {
                n: questionCount === undefined ? '' : questionCount.toLocaleString(i18n.language),
              })
            : tExam(
                sectionType === 'writing' || sectionType === 'speaking'
                  ? 'practiceTaskCount'
                  : 'practiceQuestionCount',
                { count: itemCount },
              )}
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

            {/* Say a few words: permission alone does not say the microphone is loud enough. */}
            {status === 'granted' && <MicLevelCheck />}

            {/* Blocked, no device, in use: what is wrong, the steps for this computer,
                Try again. Typing is never offered in place of speaking. */}
            <MicAccessPanel
              status={status}
              onRetry={() => void requestPermission()}
              fallbackSlot={skipButton}
            />
          </div>
        )}

        {showMicHint && !micReady && (
          <p className="mb-3 text-[12px] text-error font-medium">
            {t(micBlocked && onSkipSection ? 'micRequiredOrSkipHint' : 'micRequiredHint')}
          </p>
        )}

        <Button onClick={handleBegin}>
          {t('startSection')}
          <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </Button>
      </div>
      <ConfirmDialog
        open={skipOpen}
        onOpenChange={(o) => {
          if (!skipping) setSkipOpen(o);
        }}
        variant="warning"
        title={t('micSkipSectionTitle')}
        description={
          <>
            {t('micSkipSectionBody')}
            {skipFailed && (
              <span role="alert" className="mt-2 block text-error">
                {t('sectionSubmitError')}
              </span>
            )}
          </>
        }
        confirmText={t('micSkipSectionConfirm')}
        cancelText={t('cancel')}
        onConfirm={() => void confirmSkip()}
        isLoading={skipping}
      />
    </div>
  );
}
