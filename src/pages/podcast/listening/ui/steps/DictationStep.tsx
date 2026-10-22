/**
 * Dictation. The only phase-1 method that produces a hard, honest number, and
 * the cheapest to grade — the transcript is the answer key and the diff is a
 * string comparison, so there is no AI cost and no worker round-trip.
 *
 * Replays are unlimited and free, but counted. With no word-level timestamps,
 * repetition is the learner's only tool; charging for it turns listening into
 * guessing. The count is the diagnostic that feeds the SRS starting box.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Loader2, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { diffWords, type DiffResult } from '../../lib/word-diff';
import { useProgramActions } from '../../engine/ProgramProvider';
import type { ProgramPhase, ResolvedStep } from '../../types';

/** >=0.95 pass, 0.80-0.95 close (worth a retry), <0.80 missed. */
const PASS_THRESHOLD = 0.95;
const CLOSE_THRESHOLD = 0.8;

interface DictationStepProps {
  step: ProgramStepLike;
  phase: ProgramPhase;
  onSubmit: (result: { text: string; accuracy: number; missedWords: string[] }) => void;
}

type ProgramStepLike = ResolvedStep;

export function DictationStep({ step, phase, onSubmit }: DictationStepProps) {
  const { t } = useTranslation('listening');
  const { replay, resume } = useProgramActions();
  const maxAttempts = Number(step.options.maxAttempts ?? 3);

  const [text, setText] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [replays, setReplays] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (phase === 'awaiting' && !result) inputRef.current?.focus();
  }, [phase, result]);

  const verdict = useMemo(() => {
    if (!result) return null;
    if (result.accuracy >= PASS_THRESHOLD) return 'pass' as const;
    if (result.accuracy >= CLOSE_THRESHOLD) return 'close' as const;
    return 'missed' as const;
  }, [result]);

  const handleCheck = () => {
    const next = diffWords(step.text, text);
    setResult(next);
    setAttempts((a) => a + 1);
  };

  const handleRetry = () => {
    setResult(null);
    inputRef.current?.focus();
  };

  const handleReplay = () => {
    setReplays((n) => n + 1);
    replay();
  };

  const exhausted = attempts >= maxAttempts;
  const paused = phase === 'paused';

  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-foreground">{t(step.titleKey)}</p>
          <p className="text-[11px] text-muted-foreground">
            {t('steps.dictation.hint', { replays })}
          </p>
        </div>
        {phase === 'arming' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!result ? (
        <textarea
          ref={inputRef}
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCheck();
            }
          }}
          rows={2}
          placeholder={t('steps.dictation.placeholder')}
          className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-left text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* Chip strip — same four-state vocabulary as the Lena dictation module. */}
          <p dir="ltr" className="flex flex-wrap gap-1 text-[13px] leading-relaxed">
            {result.chips.map((chip, i) => (
              <span
                key={`${chip.word}-${i}`}
                className={
                  chip.status === 'match'
                    ? 'text-success'
                    : chip.status === 'wrong'
                      ? 'text-warning underline decoration-dashed underline-offset-2'
                      : chip.status === 'missing'
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground line-through'
                }
              >
                {chip.word}
              </span>
            ))}
          </p>
          <p className="text-[11px] font-semibold tabular-nums text-primary">
            {t(`steps.dictation.verdict_${verdict}`, {
              pct: Math.round(result.accuracy * 100),
            })}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {paused ? (
          <Button size="sm" onClick={resume}>
            <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t('controls.resume')}
          </Button>
        ) : !result ? (
          <>
            <Button variant="ghost" size="sm" onClick={handleReplay}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
              {t('controls.again')}
            </Button>
            <Button size="sm" onClick={handleCheck} disabled={!text.trim()}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {t('steps.dictation.check')}
            </Button>
          </>
        ) : (
          <>
            {verdict !== 'pass' && !exhausted && (
              <Button variant="ghost" size="sm" onClick={handleRetry}>
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                {t('steps.dictation.retry')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() =>
                onSubmit({
                  text,
                  accuracy: result.accuracy,
                  missedWords: result.missedWords,
                })
              }
            >
              {t('controls.continue')}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" strokeWidth={2.5} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
