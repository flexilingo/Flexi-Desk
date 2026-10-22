/**
 * The running program UI. Rendered INSIDE the existing [data-control-bar]
 * container, above the ControlBar wrapper.
 *
 * That placement is the whole layout story: the container is already
 * flex-col with a ResizeObserver feeding SubtitleBar.bottomOffset and
 * Sidebar.controlBarHeight, so this panel pushes the subtitles up at every
 * breakpoint including the iOS safe-area inset, for free.
 *
 * Deliberately an in-flow panel, not a Radix Dialog: a Dialog would scroll-lock,
 * focus-trap and hide the subtitle bar — and clicking a word mid-drill to look
 * it up is a feature, not a leak.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useProgramActions, useProgramState } from '../engine/ProgramProvider';
import { enqueueClip } from '../lib/listening-srs';
import type { ResolvedStep } from '../types';
import { MicroTask } from './MicroTask';
import { ProgramSummary } from './ProgramSummary';
import { DictationStep } from './steps/DictationStep';
import { LoopStep } from './steps/LoopStep';
import { PassStepActions } from './steps/PassStep';
import { PreteachStep } from './steps/PreteachStep';
import { useClipProgress } from '../engine/useClipPlayer';

interface ProgramLayerProps {
  /** Episode metadata, so a failed clip can be enqueued with enough to render later. */
  meta: { videoId: string; feedId: string; title: string; image?: string };
  /** The episode's language, for the pre-teach card. */
  lang: string;
  onAddWords: (words: string[]) => void;
}

export function ProgramLayer({ meta, lang, onAddWords }: ProgramLayerProps) {
  const { t } = useTranslation('listening');
  const state = useProgramState();
  const { advance, stop, submit, reveal, start } = useProgramActions();

  const run = state?.run ?? null;
  const step = state?.step ?? null;

  // Stamped when the run finishes rather than read during the summary's render
  // (Date.now() in render is impure and would drift on every re-render).
  const [elapsedMinutes, setElapsedMinutes] = React.useState(0);
  useEffect(() => {
    if (run?.phase !== 'finished') return;
    const id = window.setTimeout(
      () => setElapsedMinutes(Math.round((Date.now() - run.startedAt) / 60000)),
      0,
    );
    return () => window.clearTimeout(id);
  }, [run?.phase, run?.startedAt]);

  /**
   * Escape is bound to handleExit() in PodcastPlayerContent — a running program
   * that ignores it dumps the user out of the whole player. Capture phase runs
   * before that window listener, so stopPropagation() is enough and the host's
   * shortcut block needs no diff at all.
   */
  useEffect(() => {
    if (!run) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [run, stop]);

  const windowSegments = useMemo(() => {
    if (!run || !state) return [];
    return state.segments.filter((s) => s.end > run.window.start && s.start < run.window.end);
  }, [run, state]);

  const handleLoopSubmit = useCallback(
    (cracked: boolean, loops: number) => {
      if (!step) return;
      // A clip the user could not crack is exactly what spaced re-listen is for.
      if (!cracked && step.clip) {
        enqueueClip({
          ...meta,
          startSec: step.clip.start,
          endSec: step.clip.end,
          text: step.text,
          reason: 'loop_failed',
        });
      }
      submit({
        kind: 'loop',
        submitted: cracked ? 'cracked' : 'revealed',
        accuracy: cracked ? 1 : 0,
        missedWords: [],
      });
      void loops;
    },
    [step, submit, meta],
  );

  const handleDictationSubmit = useCallback(
    (result: { text: string; accuracy: number; missedWords: string[] }) => {
      if (!step) return;
      if (result.accuracy < 0.8 && step.clip) {
        enqueueClip({
          ...meta,
          startSec: step.clip.start,
          endSec: step.clip.end,
          text: step.text,
          reason: 'dictation_missed',
        });
      }
      submit({
        kind: 'dictation',
        submitted: result.text,
        accuracy: result.accuracy,
        missedWords: result.missedWords,
      });
    },
    [step, submit, meta],
  );

  const handleConfidence = useCallback(
    (value: 1 | 2 | 3) => {
      if (!step) return;
      if (value === 1 && run) {
        enqueueClip({
          ...meta,
          startSec: run.window.start,
          endSec: run.window.end,
          text: '',
          reason: 'low_confidence',
        });
      }
      submit({
        kind: 'recall',
        submitted: String(value),
        accuracy: null,
        rating: value,
        missedWords: [],
      });
    },
    [step, submit, run, meta],
  );

  if (!run) return null;

  if (run.phase === 'finished') {
    return (
      <ProgramSummary
        run={run}
        minutes={elapsedMinutes}
        onClose={stop}
        onAddWords={onAddWords}
        onKeepGoing={() =>
          start({
            definitionId: run.definitionId,
            runMode: 'continuous',
            windowSec: Math.round(run.window.end - run.window.start),
            fromSec: run.window.end,
          })
        }
      />
    );
  }

  // Continuous mode between drills: the player is genuinely untouched, so show
  // nothing but a one-line reminder that a drill is coming.
  if (run.phase === 'cycle-idle') {
    return (
      <Rail
        label={t('rail.cycleIdle')}
        stepIndex={0}
        steps={[]}
        onExit={stop}
        exitLabel={t('rail.exit')}
      />
    );
  }

  const body = renderBody();

  return (
    <div className={'border-b border-border bg-muted'}>
      <Rail
        label={t(step?.titleKey ?? 'rail.working')}
        hint={step?.bodyKey ? t(step.bodyKey) : undefined}
        stepIndex={run.stepIndex}
        steps={run.steps}
        onExit={stop}
        exitLabel={t('rail.exit')}
        counter={t('rail.stepOf', { n: run.stepIndex + 1, total: run.steps.length })}
        actions={renderActions()}
      />

      {/* Clip progress, hairline, full bleed under the rail. */}
      {step?.clip && (
        <ClipProgressBar
          audioRef={state?.audioRef ?? { current: null }}
          clip={step.clip}
          active={run.phase === 'playing'}
        />
      )}

      {/* Capped and scrollable: the pre-teach card with five words was taking
          444px of an 868px viewport, which buries the thing the user is
          supposed to be listening to.

          The top divider matters in the cream theme, where the rail is
          cream-100 and the body inherits it — without a line the two read as
          one undifferentiated block. cream-200 is the inner-divider token. */}
      {body && (
        <div className={`max-h-[28vh] overflow-y-auto border-t ${'border-border'}`}>{body}</div>
      )}
    </div>
  );

  /** Steps whose controls fit in the rail's empty right side put them here. */
  function renderActions() {
    if (!step || !run) return null;
    if (step.kind === 'listen') return <PassStepActions phase={run.phase} />;
    return null;
  }

  /** Only steps that genuinely need surface area get a panel of their own. */
  function renderBody() {
    if (!step || !run) return null;

    switch (step.kind) {
      // 'listen' has no body at all — rail + progress bar say everything.
      case 'listen':
        return null;

      case 'preteach':
        return (
          <PreteachStep
            step={step}
            windowSegments={windowSegments}
            lang={lang}
            onContinue={advance}
          />
        );

      case 'recall':
        return (
          <MicroTask
            question={t('confidence.question')}
            options={[
              { id: 'lost', label: t('confidence.level_1'), value: 1 },
              { id: 'half', label: t('confidence.level_2'), value: 2 },
              { id: 'got', label: t('confidence.level_3'), value: 3 },
            ]}
            onAnswer={handleConfidence}
          />
        );

      case 'prompt':
        return (
          <div className="flex flex-col items-center gap-3 px-4 py-4">
            <div className="text-center">
              <p className="text-[13px] font-bold text-foreground">{t(step.titleKey)}</p>
              {step.bodyKey && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t(step.bodyKey)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={advance}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t('controls.begin')}
            </button>
          </div>
        );

      // key={step.key} remounts per chunk, which resets each view's own state
      // without a reset effect.
      case 'loop':
        return (
          <LoopStep
            key={step.key}
            step={step}
            phase={run.phase}
            replays={run.replays}
            revealed={run.revealed}
            onReveal={reveal}
            onSubmit={handleLoopSubmit}
          />
        );

      case 'dictation':
        return (
          <DictationStep
            key={step.key}
            step={step}
            phase={run.phase}
            onSubmit={handleDictationSubmit}
          />
        );

      default:
        return null;
    }
  }
}

/** Own subscription so only this hairline re-renders while the clip plays. */
function ClipProgressBar({
  audioRef,
  clip,
  active,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  clip: { start: number; end: number };
  active: boolean;
}) {
  const progress = useClipProgress(audioRef, clip, active);
  return (
    <div className={`h-[3px] w-full ${'bg-muted'}`}>
      <div
        className="h-full bg-success transition-[width] duration-100 ease-linear"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

interface RailProps {
  label: string;
  /** Coaching line for this step, shown inline on wide screens. */
  hint?: string;
  counter?: string;
  stepIndex: number;
  steps: ResolvedStep[];
  /** The step's own controls, dropped into the rail's otherwise empty right side. */
  actions?: React.ReactNode;
  onExit: () => void;
  exitLabel: string;
}

/**
 * One strip, h-10. Dots, title, hint and controls all live on this line — the
 * right half was dead space while the buttons sat on a row of their own, and a
 * panel that repeats the title the rail already shows is two rows saying one
 * thing.
 *
 * Exactly one terra element (the current-step dot, ~6px²) plus at most one
 * terra button, which is the step's single primary action.
 */
function Rail({ label, hint, counter, stepIndex, steps, actions, onExit, exitLabel }: RailProps) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 md:px-4">
      {steps.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={`h-1.5 rounded-full transition-all duration-150 ${
                i < stepIndex
                  ? 'w-1.5 bg-success'
                  : i === stepIndex
                    ? 'w-4 bg-primary'
                    : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>
      )}

      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
        {label}
        {counter && <span className="ms-1.5 font-normal text-muted-foreground">{counter}</span>}
        {hint && (
          <span className={`ms-2.5 hidden font-normal lg:inline ${'text-muted-foreground'}`}>
            {hint}
          </span>
        )}
      </span>

      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}

      <button
        type="button"
        onClick={onExit}
        aria-label={exitLabel}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
