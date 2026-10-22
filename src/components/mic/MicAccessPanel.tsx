import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, MicOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectOs, openMicSettings } from '@/pages/celpip/services/micProbe';
import type { MicStatus } from '@/pages/celpip/components/session/useMicrophonePermission';

interface Props {
  status: MicStatus;
  onRetry: () => void;
  /** Optional extra action beside Try again (e.g. a Skip link). */
  fallbackSlot?: ReactNode;
}

/**
 * Microphone guidance for the exam: what is wrong, the steps that fix it on THIS
 * computer (macOS and Windows keep the permission in the system settings, not in
 * the app), a button that opens that settings page, and Try again. Renders nothing
 * for 'idle' / 'granted' - mount it under the record control and it appears only
 * when something needs fixing. Typing an answer is never offered: a blocked
 * microphone is fixed, or the task is skipped.
 */
export function MicAccessPanel({ status, onRetry, fallbackSlot }: Props) {
  const { t } = useTranslation('exam');
  const [settingsError, setSettingsError] = useState(false);

  if (status === 'idle' || status === 'granted') return null;

  if (status === 'pending') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[12px] border border-border bg-muted p-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-caption" />
        <span className="text-[12.5px] text-muted-foreground">{t('micAccess.checking')}</span>
      </div>
    );
  }

  const os = detectOs();
  const tryAgain = (
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      <RefreshCw className="h-3.5 w-3.5" />
      {t('micAccess.tryAgain')}
    </Button>
  );
  const actions = (
    <div className="flex flex-wrap items-center gap-3">
      {tryAgain}
      {fallbackSlot}
    </div>
  );

  if (status === 'denied') {
    const steps =
      os === 'mac'
        ? [t('micAccess.macStep1'), t('micAccess.macStep2')]
        : os === 'windows'
          ? [t('micAccess.winStep1'), t('micAccess.winStep2')]
          : [t('micAccess.otherStep1'), t('micAccess.otherStep2')];
    return (
      <div className="flex flex-col gap-3 rounded-[12px] border border-error/40 bg-error/10 p-4">
        <div className="flex items-start gap-2.5">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <p className="text-[12.5px] font-bold text-error">{t('micAccess.deniedTitle')}</p>
        </div>
        <ol className="flex list-none flex-col gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-error/15 text-[10.5px] font-bold text-error">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        {settingsError && (
          <p className="text-[12px] text-error">{t('micAccess.openSettingsFailed')}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {os !== 'other' && (
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => {
                setSettingsError(false);
                openMicSettings().catch(() => setSettingsError(true));
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('micAccess.openSettings')}
            </Button>
          )}
          {tryAgain}
          {fallbackSlot}
        </div>
      </div>
    );
  }

  if (status === 'no-device') {
    return (
      <div className="flex flex-col gap-2.5 rounded-[12px] border border-error/40 bg-error/10 p-4">
        <div className="flex items-start gap-2.5">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <p className="text-[12.5px] text-error">{t('micAccess.noDevice')}</p>
        </div>
        {actions}
      </div>
    );
  }

  if (status === 'in-use') {
    return (
      <div className="flex flex-col gap-2.5 rounded-[12px] border border-warning/40 bg-warning/10 p-4">
        <div className="flex items-start gap-2.5">
          <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-[12.5px] text-muted-foreground">{t('micAccess.inUse')}</p>
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-2.5">
        <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-[12.5px] text-muted-foreground">{t('micAccess.unsupported')}</p>
      </div>
      {fallbackSlot}
    </div>
  );
}
