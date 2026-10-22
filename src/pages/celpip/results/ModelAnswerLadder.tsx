import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { subscriptionUrl } from '@/components/layout/sidebarConfig';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Crown, Lock, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BandModelAnswer } from '../types';
import { LookupText } from '../components/session/WordLookup';
import { ClampText } from './ClampText';

interface ModelAnswerLadderProps {
  bands: BandModelAnswer[];
  /** The learner's CLB on this task, to point at the rung just above it. */
  taskClb?: number | null;
}

/**
 * The same speaking task answered at CLB 5, 7 and 9.
 *
 * A single "CLB 10+" example is a ceiling, not a lesson: someone scored 4 cannot
 * imitate it. Three rungs let them hear exactly what changes on the one above
 * their own, so that rung is marked — and is the only one open at first, so the
 * ladder is a list of rungs, not three answers stacked on a phone.
 *
 * Product rule: CLB 5 is open to everyone, 7 and 9 are Pro. A locked band
 * arrives from the server with no text at all, so its row shows the rung exists
 * — which is what makes it worth unlocking — and opens the upgrade dialog on
 * click instead of revealing anything.
 */
export function ModelAnswerLadder({ bands, taskClb }: ModelAnswerLadderProps) {
  const { t, i18n } = useTranslation('exam');
  const [lockedBand, setLockedBand] = useState<number | null>(null);

  const ordered = [...bands].sort((a, b) => a.clb - b.clb);
  // The rung to aim for: the lowest band above the learner's score on this task.
  const nextBand =
    typeof taskClb === 'number' ? (ordered.find((b) => b.clb > taskClb)?.clb ?? null) : null;
  // Open at first: the next rung if it can be read, else the first readable one.
  const [openBand, setOpenBand] = useState<number | null>(
    () =>
      ordered.find((b) => b.clb === nextBand && !b.locked)?.clb ??
      ordered.find((b) => !b.locked)?.clb ??
      null,
  );

  return (
    <div>
      <div className="-mx-4 sm:-mx-5 -my-4 sm:-my-5 divide-y divide-border">
        {ordered.map((band) => {
          const isNext = band.clb === nextBand;
          const chip = (
            <span className="inline-flex items-center px-2 py-0.5 rounded-[7px] bg-muted text-foreground text-[12px] font-bold tabular-nums shrink-0">
              {t('results.bandLabel', { band: band.clb })}
            </span>
          );

          if (band.locked) {
            // What the band teaches, in general terms — never its text, which was
            // not sent. One line, with the warning mark as the only colour on it.
            const benefit =
              band.clb === 9
                ? t('results.lockedBenefit9')
                : band.clb === 7
                  ? t('results.lockedBenefit7')
                  : t('results.lockedBandHint', { band: band.clb });
            return (
              <button
                key={band.clb}
                type="button"
                onClick={() => setLockedBand(band.clb)}
                className="group w-full text-start px-4 sm:px-5 py-3.5 flex items-center gap-2 transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted"
                aria-haspopup="dialog"
              >
                {chip}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[7px] bg-warning/[0.12] text-warning text-[10.5px] font-bold tracking-wide shrink-0">
                  <Crown className="w-3 h-3" />
                  Pro
                </span>
                {isNext && <ArrowUpRight className="w-3.5 h-3.5 text-accent shrink-0" />}
                <span className="text-[13px] text-muted-foreground group-hover:text-foreground truncate min-w-0 flex-1">
                  {benefit}
                </span>
                <Lock className="w-3.5 h-3.5 text-caption shrink-0" />
              </button>
            );
          }

          const open = openBand === band.clb;
          return (
            <div key={band.clb}>
              <button
                type="button"
                onClick={() => setOpenBand(open ? null : band.clb)}
                className="w-full text-start px-4 sm:px-5 py-3.5 flex items-center gap-2 transition-colors hover:bg-muted"
                aria-expanded={open}
              >
                {chip}
                {isNext && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent min-w-0">
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                    <span className="truncate">{t('results.yourNextStep')}</span>
                  </span>
                )}
                <span className="ms-auto inline-flex items-center gap-2 shrink-0">
                  {typeof band.words === 'number' && (
                    <span className="text-[11px] text-caption tabular-nums">
                      {t('results.bandWords', { count: band.words })}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-caption transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {open && (
                <div className="px-4 sm:px-5 pb-4 flex flex-col gap-3">
                  {/* The lesson first: what lifts an answer to this rung. */}
                  {band.what_sets_this_band && (
                    <div>
                      <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-1">
                        {t('results.whatSetsBand', { band: band.clb })}
                      </p>
                      <p dir="auto" className="text-[13.5px] text-muted-foreground leading-relaxed">
                        {band.what_sets_this_band}
                      </p>
                    </div>
                  )}
                  <ClampText
                    lines={6}
                    className="text-[14.5px] text-foreground leading-relaxed whitespace-pre-wrap"
                  >
                    <LookupText text={band.answer ?? ''} />
                  </ClampText>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={lockedBand !== null}
        onOpenChange={(open) => {
          if (!open) setLockedBand(null);
        }}
      >
        <DialogContent className="max-w-md rounded-[9px] border-border">
          <DialogHeader>
            <span className="w-9 h-9 rounded-[7px] bg-warning/[0.12] flex items-center justify-center mb-1">
              <Crown className="w-4 h-4 text-warning" />
            </span>
            <DialogTitle className="text-foreground">
              {t('results.lockedBandDialogTitle', { band: lockedBand ?? 9 })}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {t('results.lockedBandDialogBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose className="inline-flex items-center px-3.5 h-9 rounded-[9px] text-[13px] font-semibold text-muted-foreground hover:text-foreground">
              {t('results.notNow')}
            </DialogClose>
            <Button
              variant="accent"
              size="md"
              onClick={() => void openUrl(subscriptionUrl(i18n.language))}
            >
              <Crown className="w-3.5 h-3.5" />
              {t('insightUpgradeCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
