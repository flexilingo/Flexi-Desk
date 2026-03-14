import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { usePronunciationStore } from '../stores/pronunciationStore';

function useElapsedTimer(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive) {
      startRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 200);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  return elapsed;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function PracticeView() {
  const { activeSession, isRecording, isAnalyzing, goBack, startRecording, stopAndAnalyze } =
    usePronunciationStore();

  const elapsed = useElapsedTimer(isRecording);

  const handleStart = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handleStop = useCallback(() => {
    stopAndAnalyze();
  }, [stopAndAnalyze]);

  if (!activeSession) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            disabled={isRecording || isAnalyzing}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>
            Practice:{' '}
            {activeSession.mode === 'word'
              ? 'Word'
              : activeSession.mode === 'sentence'
                ? 'Sentence'
                : 'Shadowing'}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col items-center gap-6 py-8">
          {/* Target text */}
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Say this:</p>
            <p className="text-2xl font-semibold text-foreground">{activeSession.targetText}</p>
          </div>

          {/* Mic button */}
          <div className="relative">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full transition-colors ${
                isRecording ? 'bg-error/10' : isAnalyzing ? 'bg-primary/10' : 'bg-muted'
              }`}
            >
              {isRecording && (
                <>
                  <div className="absolute inset-0 animate-ping rounded-full bg-error/20" />
                  <div className="absolute inset-2 animate-pulse rounded-full bg-error/10" />
                </>
              )}
              {isAnalyzing ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : (
                <Mic
                  className={`h-10 w-10 ${isRecording ? 'text-error' : 'text-muted-foreground'}`}
                />
              )}
            </div>
          </div>

          {/* Timer */}
          <p className="text-2xl font-mono tabular-nums text-foreground">
            {formatSeconds(elapsed)}
          </p>

          {/* Status */}
          <p className="text-sm text-muted-foreground">
            {isRecording
              ? 'Recording… speak clearly'
              : isAnalyzing
                ? 'Analyzing pronunciation with Whisper…'
                : 'Tap the microphone to start recording'}
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-center gap-3">
        {!isRecording && !isAnalyzing && (
          <Button size="lg" onClick={handleStart}>
            <Mic className="h-4 w-4" />
            Start Recording
          </Button>
        )}
        {isRecording && (
          <Button variant="destructive" size="lg" onClick={handleStop}>
            <Square className="h-4 w-4" />
            Stop & Analyze
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
