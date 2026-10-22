/**
 * Loop until cracked. The best payoff-per-line in the catalogue.
 *
 * Two details are load-bearing and easy to lose in a refactor:
 *  - the 700ms gap between passes. Back-to-back loops blur into noise.
 *  - the reveal is not the end. The clip keeps looping WITH the text visible,
 *    because mapping now-known text onto the sound is the learning moment.
 *
 * The loop counter is engine state (run.replays), not local state, so the view
 * stays a pure function of the machine and remounts cleanly per chunk.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Eye, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProgramActions } from '../../engine/ProgramProvider';
import type { ProgramPhase, ResolvedStep } from '../../types';

const GAP_MS = 700;

interface LoopStepProps {
  step: ResolvedStep;
  phase: ProgramPhase;
  /** Engine replay count for this step; the first pass is loop 1. */
  replays: number;
  revealed: boolean;
  onReveal: () => void;
  onSubmit: (cracked: boolean, loops: number) => void;
}

export function LoopStep({ step, phase, replays, revealed, onReveal, onSubmit }: LoopStepProps) {
  const { t } = useTranslation('listening');
  const { replay, resume } = useProgramActions();
  const maxLoops = Number(step.options.maxLoops ?? 8);
  const revealLoops = Number(step.options.revealLoops ?? 2);

  // Which loop the text appeared on — set from a handler/timeout, never in an
  // effect body, so the auto-loop can stop a couple of passes later.
  const [revealedAtLoop, setRevealedAtLoop] = useState<number | null>(null);
  const settled = useRef(false);

  // A finished pass parks the machine in 'awaiting'; that is the loop boundary.
  const loops = phase === 'awaiting' || phase === 'paused' ? replays + 1 : replays;

  useEffect(() => {
    if (phase !== 'awaiting' || settled.current) return;

    const id = window.setTimeout(() => {
      if (revealedAtLoop === null) {
        if (loops >= maxLoops) {
          // Out of patience on the user's behalf — show it rather than let
          // them grind a clip they are not going to crack.
          setRevealedAtLoop(loops);
          onReveal();
          replay();
          return;
        }
        replay();
        return;
      }
      if (loops - revealedAtLoop < revealLoops) {
        replay();
      } else {
        settled.current = true;
      }
    }, GAP_MS);

    return () => window.clearTimeout(id);
  }, [phase, loops, revealedAtLoop, maxLoops, revealLoops, replay, onReveal]);

  const handleShowMe = () => {
    setRevealedAtLoop(loops);
    onReveal();
  };

  const paused = phase === 'paused';

  return (
    <div className="flex flex-col items-center gap-3 px-3.5 py-4">
      <div className="flex items-center gap-3">
        {/* Loop pips report state, so they are olive — not a CTA. */}
        <div className="flex shrink-0 items-center gap-1" aria-label={String(loops)}>
          {Array.from({ length: maxLoops }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors duration-150 ${
                i < loops ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground">{t(step.titleKey)}</p>
          <p className="text-[11px] text-muted-foreground">
            {revealed ? t('steps.loop.revealedHint') : t('steps.loop.hint')}
          </p>
        </div>
        {phase === 'arming' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {revealed && (
        <p
          dir="ltr"
          className="max-h-24 overflow-y-auto rounded-md bg-muted px-3 py-2 text-center text-[13px] leading-relaxed text-foreground"
        >
          {step.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {paused ? (
          <Button size="sm" onClick={resume}>
            <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t('controls.resume')}
          </Button>
        ) : (
          <>
            {!revealed && (
              <Button variant="ghost" size="sm" onClick={handleShowMe}>
                <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                {t('steps.loop.showMe')}
              </Button>
            )}
            <Button size="sm" onClick={() => onSubmit(!revealed, loops)}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {revealed ? t('controls.next') : t('steps.loop.gotIt')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
