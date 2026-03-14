import { useEffect, useRef, useCallback, useState } from 'react';
import { Square, Mic, ArrowLeft, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCaptionStore } from '../stores/captionStore';
import { formatDuration, formatTimestampMs } from '../types';

export function LiveCapturePanel() {
  const {
    liveSegments,
    isLiveCapturing,
    captureElapsed,
    captureLanguage,
    captionStatus,
    activeModelId,
    availableModels,
    setCaptureElapsed,
    stopLiveCapture,
    goBack,
  } = useCaptionStore();

  const [isStopping, setIsStopping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Elapsed timer
  useEffect(() => {
    if (isLiveCapturing) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setCaptureElapsed(elapsed);
      }, 200);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLiveCapturing, setCaptureElapsed]);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveSegments.length]);

  // Detect user scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // If user scrolled up more than 50px from bottom, disable auto-scroll
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  const handleStop = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsStopping(true);
    await stopLiveCapture();
    setIsStopping(false);
  }, [stopLiveCapture]);

  const activeModel = availableModels.find((m) => m.id === activeModelId);
  const modelLabel = activeModel?.name ?? activeModelId ?? 'Unknown';

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          disabled={isLiveCapturing}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Pulsing indicator */}
        {isLiveCapturing && (
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-error" />
          </div>
        )}

        {/* Timer */}
        <span className="font-mono text-lg font-bold tabular-nums text-foreground">
          {formatDuration(captureElapsed)}
        </span>

        {/* Model badge */}
        <Badge variant="outline" className="gap-1 text-xs">
          <HardDrive className="h-3 w-3" />
          {modelLabel}
        </Badge>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stop button */}
        {isLiveCapturing && (
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={isStopping}>
            <Square className="h-3.5 w-3.5" />
            {isStopping ? 'Stopping…' : 'Stop'}
          </Button>
        )}

        {!isLiveCapturing && !isStopping && (
          <Button variant="outline" size="sm" onClick={goBack}>
            Back
          </Button>
        )}
      </div>

      {/* Device & language info */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Mic className="h-3 w-3" />
          {captionStatus?.deviceName ?? 'Microphone'}
        </span>
        <span>
          Language: {captureLanguage === 'auto' ? 'Auto-detect' : captureLanguage.toUpperCase()}
        </span>
      </div>

      {/* Live transcript */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-4 py-4 space-y-3"
        >
          {liveSegments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="relative mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Mic className="h-8 w-8 text-primary" />
                </div>
                {isLiveCapturing && (
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {isLiveCapturing
                  ? 'Listening… Start speaking to see captions'
                  : 'Waiting for audio…'}
              </p>
            </div>
          ) : (
            liveSegments.map((segment) => (
              <div
                key={segment.segmentIndex}
                className={`group flex gap-3 ${segment.isPartial ? 'opacity-60' : ''}`}
              >
                {/* Timestamp */}
                <span className="shrink-0 pt-0.5 text-xs font-mono text-muted-foreground tabular-nums">
                  {formatTimestampMs(segment.startMs)}
                </span>

                {/* Text */}
                <p
                  className={`text-sm leading-relaxed ${
                    segment.isPartial ? 'text-muted-foreground italic' : 'text-foreground'
                  }`}
                >
                  {segment.text}
                  {segment.isPartial && (
                    <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-primary" />
                  )}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
