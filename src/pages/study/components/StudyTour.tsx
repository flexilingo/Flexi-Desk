import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudyTourStep } from '../lib/studyTour';

interface Props {
  open: boolean;
  steps: StudyTourStep[];
  stepIndex: number;
  onStepChange: (index: number) => void;
  onClose: () => void;
}

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top: number;
  left: number;
  side: 'top' | 'bottom' | 'center';
}

const SPOT_PADDING = 8;
const FIND_TIMEOUT_MS = 1500;
const TOOLTIP_WIDTH = 340;
const VIEWPORT_MARGIN = 12;
const MIN_SIDE_SPACE = 180;
// A generous bound on the tooltip's own height — used only to keep its anchor far enough from the viewport
// edge that the card (title + body + buttons) can never render partly off-screen.
const ESTIMATED_TOOLTIP_HEIGHT = 220;

/**
 * A spotlight walkthrough over the REAL Study page — not a replica. The page opens the scope sheet / settings
 * dialog for the steps that need them (declared by `steps[].needsSheet` / `dialogTab`), and this spotlights
 * whatever DOM node carries the matching `data-tour="..."` attribute.
 *
 * Look-only: a full-screen layer blocks clicks on the real page, so Back / Next are the only way through and
 * the tour stays deterministic whatever the learner pokes at underneath. Escape skips it.
 */
export function StudyTour({ open, steps, stepIndex, onStepChange, onClose }: Props) {
  const { t } = useTranslation('study', { keyPrefix: 'tour' });
  const step = steps[stepIndex] ?? null;

  const [rect, setRect] = useState<SpotRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);
  const rafRef = useRef<number | null>(null);
  const searchStartedAtRef = useRef<number | null>(null);
  const scrolledRef = useRef(false);

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      setTooltipPos({ top: 0, left: 0, side: 'center' });
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      if (searchStartedAtRef.current == null) searchStartedAtRef.current = performance.now();
      if (performance.now() - searchStartedAtRef.current > FIND_TIMEOUT_MS) {
        // The element never showed up (an empty deck list): fall back to a centred slide instead of sticking.
        setRect(null);
        setTooltipPos({ top: 0, left: 0, side: 'center' });
      }
      return;
    }
    if (!scrolledRef.current) {
      scrolledRef.current = true;
      // 'nearest', not 'center': a target taller than the viewport would otherwise scroll to its midpoint.
      el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - SPOT_PADDING,
      left: r.left - SPOT_PADDING,
      width: r.width + SPOT_PADDING * 2,
      height: r.height + SPOT_PADDING * 2,
    });

    // Clamp to the part of the target actually inside the viewport before placing the tooltip.
    const visTop = Math.max(r.top, 0);
    const visBottom = Math.min(r.bottom, window.innerHeight);
    const spaceBelow = window.innerHeight - visBottom;
    const spaceAbove = visTop;
    let side: 'top' | 'bottom' = step.placement === 'top' ? 'top' : 'bottom';
    if (side === 'bottom' && spaceBelow < MIN_SIDE_SPACE && spaceAbove > spaceBelow) side = 'top';
    if (side === 'top' && spaceAbove < MIN_SIDE_SPACE && spaceBelow > spaceAbove) side = 'bottom';

    const centerX = r.left + r.width / 2;
    const left = Math.min(
      Math.max(centerX - TOOLTIP_WIDTH / 2, VIEWPORT_MARGIN),
      window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
    );
    const top =
      side === 'bottom'
        ? Math.min(visBottom + 16, window.innerHeight - ESTIMATED_TOOLTIP_HEIGHT - VIEWPORT_MARGIN)
        : Math.max(visTop - 16, ESTIMATED_TOOLTIP_HEIGHT + VIEWPORT_MARGIN);
    setTooltipPos({ top, left, side });
  }, [step]);

  // Re-measure every frame for the lifetime of the step — cheaply tracks dialog animation, tab switches,
  // scrolling and resizing without a separate listener for each.
  useEffect(() => {
    if (!open || !step) return;
    searchStartedAtRef.current = null;
    scrolledRef.current = false;
    const loop = () => {
      measure();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(() => {
      setRect(null);
      setTooltipPos(null);
      loop();
    });
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [open, step, measure]);

  const goNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) onClose();
    else onStepChange(stepIndex + 1);
  }, [stepIndex, steps.length, onClose, onStepChange]);
  const goBack = useCallback(() => {
    if (stepIndex > 0) onStepChange(stepIndex - 1);
  }, [stepIndex, onStepChange]);

  // Capture-phase, so this wins over the dialog's own Escape handler — the tour owns the keyboard while open.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.stopPropagation();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        goBack();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [open, onClose, goNext, goBack]);

  if (!open || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <div data-testid="study-tour">
      {/* Click-blocking layer — a look-only tour. */}
      <div className="fixed inset-0 z-[10060]" aria-hidden="true" />

      {/* Dark mask with a spotlight cutout (box-shadow trick — no SVG mask needed). */}
      <div
        className="pointer-events-none fixed z-[10061] rounded-xl ring-2 ring-accent/80 transition-all duration-200 ease-out"
        style={{
          top: rect?.top ?? 0,
          left: rect?.left ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          boxShadow: '0 0 0 9999px rgba(20,17,10,0.68)',
        }}
      />

      {tooltipPos && (
        <div
          className="fixed z-[10062] w-[340px] max-w-[calc(100vw-24px)]"
          role="dialog"
          aria-label={t(`steps.${step.id}.title`)}
          style={{
            top: tooltipPos.side === 'center' ? '50%' : tooltipPos.top,
            left: tooltipPos.side === 'center' ? '50%' : tooltipPos.left,
            transform:
              tooltipPos.side === 'center'
                ? 'translate(-50%, -50%)'
                : tooltipPos.side === 'top'
                  ? 'translateY(-100%)'
                  : undefined,
          }}
        >
          <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
            <button
              type="button"
              onClick={onClose}
              className="absolute end-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md text-caption transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('skip')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="px-4 pb-3 pt-4">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-accent">
                {t('stepOf', { current: stepIndex + 1, total: steps.length })}
              </span>
              <h3 className="mt-1 pe-4 text-[14.5px] font-bold text-foreground">
                {t(`steps.${step.id}.title`)}
              </h3>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                {t(`steps.${step.id}.body`)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {t('skip')}
              </Button>
              <div className="flex items-center gap-1.5">
                {!isFirst && (
                  <Button type="button" variant="outline" size="sm" onClick={goBack}>
                    <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                    {t('back')}
                  </Button>
                )}
                <Button type="button" variant="accent" size="sm" onClick={goNext}>
                  {isLast ? t('done') : t('next')}
                  {!isLast && <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
