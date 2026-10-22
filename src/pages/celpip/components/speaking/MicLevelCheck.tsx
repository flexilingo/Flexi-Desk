import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Mic, MicOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MicLevelBars from '@/components/mic/MicLevelBars';
import { LEVEL_POLL_MS, MicTest, levelFraction, type MicTestResult } from '../../utils/micLevel';
import { readMicLevel, startMicProbe, stopMicProbe } from '../../services/micProbe';

type State = 'idle' | MicTestResult;

/**
 * Before the Speaking section: say a few words and see that we hear them.
 * Permission alone says nothing about level - on 2026-10-02 a learner with a
 * granted microphone recorded two answers 20-25 dB too quiet to transcribe.
 * The test is a hint and never blocks the start.
 */
export default function MicLevelCheck() {
  const { t } = useTranslation('exam');
  const [state, setState] = useState<State>('idle');
  const [level, setLevel] = useState(0);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => () => stopRef.current(), []);

  const start = async () => {
    stopRef.current();
    try {
      await startMicProbe();
    } catch {
      setState('unmeasured');
      return;
    }
    const test = new MicTest(Date.now());
    setState('listening');
    let busy = false;
    const stop = () => {
      clearInterval(timer);
      void stopMicProbe();
      setLevel(0);
      stopRef.current = () => {};
    };
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      readMicLevel()
        .then((dbfs) => {
          setLevel(levelFraction(dbfs));
          const result = test.push(Date.now(), dbfs);
          if (result === 'listening') return;
          stop();
          setState(result);
        })
        .catch(() => {
          stop();
          setState('unmeasured');
        })
        .finally(() => {
          busy = false;
        });
    }, LEVEL_POLL_MS);
    stopRef.current = stop;
  };

  // No readings at all: no verdict rather than a wrong one.
  if (state === 'unmeasured') return null;

  const again = (
    <Button type="button" variant="ghost" size="sm" onClick={() => void start()}>
      <RefreshCw className="h-3 w-3" />
      {t('micLevelRetry')}
    </Button>
  );

  return (
    <div className="mt-3 rounded-[12px] border border-border bg-card p-3.5">
      {state === 'idle' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[12px] leading-relaxed text-muted-foreground">{t('micLevelIntro')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void start()}>
            <Mic className="h-3.5 w-3.5" />
            {t('micLevelTest')}
          </Button>
        </div>
      )}

      {state === 'listening' && (
        <div className="flex flex-col items-center gap-1">
          <MicLevelBars level={level} label={t('micLevelLabel')} />
          <p className="text-[12px] text-muted-foreground">{t('micLevelPrompt')}</p>
        </div>
      )}

      {state === 'heard' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-success">
            <CheckCircle className="h-4 w-4" />
            {t('micLevelHeard')}
          </span>
          {again}
        </div>
      )}

      {state === 'quiet' && (
        <div className="flex flex-col items-start gap-2">
          <span className="inline-flex items-start gap-2 text-[12.5px] leading-relaxed text-foreground">
            <MicOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            {t('micLevelQuiet')}
          </span>
          {again}
        </div>
      )}
    </div>
  );
}
