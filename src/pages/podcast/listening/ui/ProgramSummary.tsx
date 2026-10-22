/**
 * End-of-session summary.
 *
 * The pass1 -> pass3 delta is the hero, not a stat. Listening improves slowly;
 * the only short-term reward the product can honestly offer is "you understood
 * more of this same clip than you did four minutes ago". If that is buried
 * under a stat grid the user has nothing to come back for.
 *
 * No XP in phase 1: awardContentComplete awards EPISODE completion, a program
 * completion has no backend action, and a client-side number the user will
 * never find in their totals is a lie they will notice.
 */

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProgramRunState } from '../types';

interface ProgramSummaryProps {
  run: ProgramRunState;
  /** Wall-clock minutes the run took. Stamped by the caller, not read during render. */
  minutes: number;
  onClose: () => void;
  onAddWords: (words: string[]) => void;
  /**
   * Resume normal playback and drill again in another window's time. This is
   * the old "continuous mode" — asked here, after one session, instead of in
   * the picker where it was a choice nobody could make yet.
   */
  onKeepGoing: () => void;
}

export function ProgramSummary({
  run,
  minutes,
  onClose,
  onAddWords,
  onKeepGoing,
}: ProgramSummaryProps) {
  const { t } = useTranslation('listening');

  const { firstRating, lastRating, missedWords, dictationAvg, cracked } = useMemo(() => {
    const answers = Object.values(run.answers);
    const ratings = answers.filter((a) => a.rating).map((a) => a.rating as 1 | 2 | 3);
    const dict = answers.filter((a) => a.kind === 'dictation' && a.accuracy !== null);
    const words = new Set<string>();
    for (const a of answers) for (const w of a.missedWords) words.add(w);
    return {
      firstRating: ratings[0] ?? null,
      lastRating: ratings.length > 1 ? ratings[ratings.length - 1] : null,
      missedWords: [...words].slice(0, 24),
      dictationAvg: dict.length
        ? dict.reduce((s, a) => s + (a.accuracy ?? 0), 0) / dict.length
        : null,
      cracked: answers.filter((a) => a.kind === 'loop' && a.accuracy === 1).length,
    };
  }, [run]);

  const delta = firstRating !== null && lastRating !== null ? lastRating - firstRating : null;
  const ratingLabel = (r: 1 | 2 | 3) => t(`confidence.level_${r}`);
  const windowMinutes = (run.window.end - run.window.start) / 60;

  // Portalled to the body: ProgramLayer lives inside the control-bar strip, so
  // an in-tree `absolute inset-0` is clipped to ~90px of bar instead of
  // covering the player.
  //
  // z-[9999] matches the fullscreen player container rather than beating it —
  // the portal mounts at the end of <body>, so equal z + later DOM order paints
  // on top, and staying under the Radix layer (10000) means the add-to-deck
  // dialog this panel opens still appears above it.
  //
  // No mounted-guard needed: this only ever renders from client run state, so
  // there is nothing to hydrate.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card">
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
          <h2 className="text-base font-bold text-foreground">{t('summary.title')}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('picker.close')}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* The delta. Biggest thing on the panel. No arrow glyph — RTL-safe. */}
        {delta !== null && firstRating !== null && lastRating !== null && (
          <div className="mx-4 rounded-lg bg-muted px-4 py-4">
            <div className="relative h-[3px] rounded-full bg-muted">
              <span
                className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-border"
                style={{ insetInlineStart: '16%' }}
              />
              <span
                className="absolute top-1/2 h-full bg-success"
                style={{ insetInlineStart: '16%', width: '68%' }}
              />
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-success"
                style={{ insetInlineStart: '82%' }}
              />
            </div>
            <p className="mt-3 text-center text-[13px] font-bold text-foreground">
              {delta > 0
                ? t('summary.delta', {
                    from: ratingLabel(firstRating),
                    to: ratingLabel(lastRating),
                    n: delta,
                  })
                : t('summary.deltaFlat')}
            </p>
            {delta <= 0 && (
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                {t('summary.deltaFlatHint')}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 divide-x divide-border rtl:divide-x-reverse border-y border-border">
          <Stat label={t('summary.statMinutes')} value={String(Math.max(1, minutes))} />
          <Stat
            label={t('summary.statAccuracy')}
            value={dictationAvg === null ? '—' : `${Math.round(dictationAvg * 100)}%`}
          />
          <Stat label={t('summary.statCracked')} value={String(cracked)} />
        </div>

        {missedWords.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {t('summary.missedWords')}
            </p>
            <div dir="ltr" className="mt-2 flex flex-wrap gap-1.5">
              {missedWords.map((w) => (
                <span
                  key={w}
                  className="rounded-full border border-border bg-muted px-2.5 py-1 text-[12px] text-foreground"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onKeepGoing}>
            {t('summary.keepGoing', { n: Math.max(1, Math.round(windowMinutes)) })}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('summary.done')}
            </Button>
            {missedWords.length > 0 && (
              <Button size="sm" onClick={() => onAddWords(missedWords)}>
                {t('summary.addToDeck', { n: missedWords.length })}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
