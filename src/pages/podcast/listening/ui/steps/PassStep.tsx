/**
 * A listening pass — blind or guided. The difference is entirely in the
 * subtitle policy, which the engine enforces; this only offers the controls.
 *
 * There is no body: the rail already shows the step title, counter and hint,
 * and the clip progress bar is drawn by ProgramLayer. Repeating the title in a
 * panel underneath cost a whole extra row and said nothing new.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Play, RotateCcw, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProgramActions } from '../../engine/ProgramProvider';
import type { ProgramPhase } from '../../types';

interface PassStepActionsProps {
  phase: ProgramPhase;
}

export function PassStepActions({ phase }: PassStepActionsProps) {
  const { t } = useTranslation('listening');
  const { advance, replay, resume } = useProgramActions();

  if (phase === 'paused') {
    return (
      <Button size="xs" onClick={resume}>
        <Play strokeWidth={2.5} />
        {t('controls.resume')}
      </Button>
    );
  }

  return (
    <>
      <Button variant="ghost" size="xs" onClick={replay}>
        <RotateCcw strokeWidth={2} />
        {t('controls.again')}
      </Button>
      {phase === 'awaiting' ? (
        <Button size="xs" onClick={advance}>
          {t('controls.continue')}
          <ArrowRight className="rtl:rotate-180" strokeWidth={2.5} />
        </Button>
      ) : (
        <Button variant="ghost" size="xs" onClick={advance}>
          <SkipForward className="rtl:rotate-180" strokeWidth={2} />
          {t('controls.skip')}
        </Button>
      )}
    </>
  );
}
