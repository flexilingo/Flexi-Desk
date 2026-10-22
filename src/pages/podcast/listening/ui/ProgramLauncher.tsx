/**
 * The picker. One screen, no scroll on a phone.
 *
 * Colour budget: terra appears exactly twice — the selected range chip and the
 * Start button. Program-card selection is a large area, so it is olive; the
 * mode toggle reports state, so it is olive too. A column of terra options
 * would be a column of fake CTAs.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, PenLine, Play, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { compileProgram, estimateDuration } from '../lib/compile-program';
import { formatClock } from '../lib/clip-math';
import {
  DEFAULT_PROGRAM_ID,
  DEFAULT_RANGE_SEC,
  PROGRAM_REGISTRY,
  RANGE_OPTIONS,
} from '../lib/programs';
import { useProgramActions, useProgramState } from '../engine/ProgramProvider';

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Layers,
  RefreshCw,
  PenLine,
};

interface ProgramLauncherProps {
  onClose: () => void;
  /** Live playback position, so "from here" means from here. */
  currentTime: number;
}

export function ProgramLauncher({ onClose, currentTime }: ProgramLauncherProps) {
  const { t } = useTranslation('listening');
  const { start, previewWindow, getSegments } = useProgramActions();
  const state = useProgramState();

  const [rangeSec, setRangeSec] = useState<number>(DEFAULT_RANGE_SEC);
  const [programId, setProgramId] = useState<string>(DEFAULT_PROGRAM_ID);

  const segments = getSegments();

  /**
   * Compute each program's real duration against the chosen range rather than
   * printing a fixed number — nobody should be ambushed by a 15-minute session.
   */
  const cards = useMemo(() => {
    const win = previewWindow(currentTime, rangeSec);
    return PROGRAM_REGISTRY.map((def) => {
      if (!win || win.indices.length < def.minSegments) {
        return { def, minutes: null as number | null, disabled: true };
      }
      const steps = compileProgram({
        definition: def,
        window: win.range,
        windowIndices: win.indices,
        segments,
        syncPoints: [],
      });
      return {
        def,
        minutes: Math.max(1, Math.round(estimateDuration(steps) / 60)),
        disabled: steps.length === 0,
      };
    });
  }, [previewWindow, currentTime, rangeSec, segments]);

  const win = previewWindow(currentTime, rangeSec);
  const selected = cards.find((c) => c.def.id === programId);
  const canStart = !!win && !!selected && !selected.disabled;

  /**
   * Always starts now, always looks forward from the live position.
   *
   * There is no mode picker: someone who just tapped "Practice" wants to
   * practise, and a picker that can make the button do nothing for three
   * minutes is a broken button. "Keep drilling every N minutes" is a decision
   * about what happens AFTER a session, so it lives on the summary card where
   * the user already knows what they are agreeing to.
   */
  const handleStart = () => {
    if (!canStart) return;
    start({
      definitionId: programId,
      runMode: 'focused',
      windowSec: rangeSec,
      fromSec: currentTime,
    });
    onClose();
  };

  const handleResume = () => {
    if (!state?.resumable) return;
    // Resuming replays the saved definition over the saved window; the engine
    // recompiles because steps are never persisted.
    start({
      definitionId: state.resumable.definitionId,
      runMode: 'focused',
      windowSec: rangeSec,
      fromSec: currentTime,
    });
    onClose();
  };

  return (
    <>
      <div className="absolute inset-0 z-[104] bg-black/60" onClick={onClose} aria-hidden />
      <div
        className="absolute inset-x-0 bottom-0 z-[105] max-h-[85%] overflow-y-auto rounded-t-[9px] border-t border-border bg-card p-4 md:p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('picker.title')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold leading-tight text-foreground">
              {t('picker.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{t('picker.subtitle')}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('picker.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {state?.resumable && (
          <button
            type="button"
            onClick={handleResume}
            className="mt-3.5 flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted px-3 py-2.5 text-start transition-colors hover:bg-muted"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <span className="flex-1 text-[13px] font-semibold text-foreground">
              {t('picker.resume', {
                n: state.resumable.stepIndex + 1,
                total: state.resumable.total,
              })}
            </span>
          </button>
        )}

        {/* Range — the selection is terra: the user chose this. */}
        <div className="mt-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t('picker.range')}
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RANGE_OPTIONS.map((sec) => {
              const on = sec === rangeSec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setRangeSec(sec)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    on
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {t('picker.minutes', { n: Math.round(sec / 60) })}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
            {t('picker.rangeFrom', {
              at: formatClock(currentTime),
              to: formatClock(win?.range.end ?? currentTime + rangeSec),
            })}
          </p>
        </div>

        {/* One card, divided rows — card nesting stays at one level. */}
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {cards.map(({ def, minutes, disabled }) => {
            const on = def.id === programId;
            const Icon = ICONS[def.icon] ?? Layers;
            return (
              <button
                key={def.id}
                type="button"
                disabled={disabled}
                onClick={() => setProgramId(def.id)}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  on ? 'bg-muted ring-2 ring-inset ring-primary' : 'hover:bg-muted'
                }`}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-foreground">
                    {t(def.labelKey)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t(def.descriptionKey)}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-primary">
                  {minutes === null ? '—' : t('picker.minutes', { n: minutes })}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('picker.cancel')}
          </Button>
          <Button onClick={handleStart} disabled={!canStart}>
            <Play className="h-4 w-4" strokeWidth={2.5} />
            {t('picker.start')}
          </Button>
        </div>
      </div>
    </>
  );
}
