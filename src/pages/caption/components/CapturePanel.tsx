import { useEffect, useRef, useCallback } from 'react';
import { Square, Mic, Loader2, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { useCaptionStore } from '../stores/captionStore';
import { formatDuration } from '../types';

export function CapturePanel() {
  const { t } = useTranslation('caption');
  const {
    captionStatus,
    captureElapsed,
    captureLanguage,
    isTranscribing,
    setCaptureElapsed,
    stopCapture,
    transcribeSession,
    goBack,
    refreshStatus,
  } = useCaptionStore();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Elapsed timer
  useEffect(() => {
    if (captionStatus?.isCapturing) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setCaptureElapsed(elapsed);
      }, 200);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [captionStatus?.isCapturing, setCaptureElapsed]);

  // Periodic status refresh during capture
  useEffect(() => {
    if (!captionStatus?.isCapturing) return;
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [captionStatus?.isCapturing, refreshStatus]);

  const handleStop = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const session = await stopCapture();
    if (session) {
      // Auto-transcribe after stopping
      await transcribeSession(session.id);
    }
  }, [stopCapture, transcribeSession]);

  const isCapturing = captionStatus?.isCapturing ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            disabled={isCapturing}
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>
            {isCapturing
              ? t('capture.recordingInProgress')
              : isTranscribing
                ? t('capture.transcribing')
                : t('capture.recording')}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col items-center gap-6 py-8">
          {/* Pulsing microphone indicator */}
          <div className="relative">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full transition-colors ${
                isCapturing ? 'bg-error/10' : isTranscribing ? 'bg-primary/10' : 'bg-muted'
              }`}
            >
              {isCapturing && (
                <>
                  <div className="absolute inset-0 animate-ping rounded-full bg-error/20" />
                  <div className="absolute inset-2 animate-pulse rounded-full bg-error/10" />
                </>
              )}
              {isTranscribing ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <Mic
                  className={`h-10 w-10 ${isCapturing ? 'text-error' : 'text-muted-foreground'}`}
                />
              )}
            </div>
          </div>

          {/* Timer */}
          <div className="text-center">
            <p className="text-4xl font-mono font-bold text-foreground tabular-nums">
              {formatDuration(captureElapsed)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isCapturing
                ? t('capture.recordingWith', {
                    device: captionStatus?.deviceName ?? t('common.microphone'),
                  })
                : isTranscribing
                  ? t('capture.processing')
                  : t('capture.stopped')}
            </p>
          </div>

          {/* Language indicator */}
          <div className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {t('common.languageLine', {
              value:
                captureLanguage === 'auto' ? t('common.autoDetect') : captureLanguage.toUpperCase(),
            })}
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-center gap-3">
        {isCapturing && (
          <Button variant="destructive" size="lg" onClick={handleStop}>
            <Square className="h-4 w-4" />
            {t('capture.stop')}
          </Button>
        )}

        {!isCapturing && !isTranscribing && (
          <Button variant="outline" onClick={goBack}>
            {t('capture.backToSessions')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
