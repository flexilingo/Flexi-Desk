/**
 * Pre-teach vocabulary. Twenty seconds on the five hardest words in the clip
 * that is about to play.
 *
 * This is the single most reliably-supported intervention in listening
 * research, and for us it is nearly free: the levels already exist in the word
 * cache and the batch endpoint takes the whole window in one call.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CefrBadge } from '@/components/common/CefrBadge';
import { useWordLevels } from '../../engine/useWordLevels';
import type { TranscriptSegment } from '../../lib/clip-math';
import { STOPWORDS, extractCandidates, rankPreteach } from '../../lib/word-select';
import type { ResolvedStep } from '../../types';

interface PreteachStepProps {
  step: ResolvedStep;
  /** The whole run window's segments — pre-teach previews what is coming. */
  windowSegments: TranscriptSegment[];
  /** The episode's language: the word table and the stopword list follow it. */
  lang: string;
  onContinue: () => void;
}

export function PreteachStep({ step, windowSegments, lang, onContinue }: PreteachStepProps) {
  const { t } = useTranslation('listening');
  const seconds = Number(step.options.seconds ?? 20);
  const count = Number(step.options.count ?? 5);

  const texts = useMemo(() => windowSegments.map((s) => s.text), [windowSegments]);
  // One batch levels call for the whole window; every later step reads the
  // resolved map synchronously.
  const unicode = lang !== 'en';
  const extractOpts = useMemo(
    () => ({
      unicode,
      stopwords: unicode ? new Set<string>() : STOPWORDS,
      minLength: unicode ? 4 : 3,
    }),
    [unicode],
  );
  const candidates = useMemo(() => extractCandidates(texts, extractOpts), [texts, extractOpts]);
  const candidateWords = useMemo(() => candidates.map((c) => c.word), [candidates]);
  const { levelOf, ready } = useWordLevels(candidateWords, lang);

  const words = useMemo(() => {
    if (!ready) return [];
    return rankPreteach(candidates, { levelOf, count });
  }, [ready, candidates, levelOf, count]);

  // The draining bar is the timer. Not a countdown ring — a ring reads as
  // urgency, and this is a warm-up.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (elapsed >= seconds) onContinue();
  }, [elapsed, seconds, onContinue]);

  const remainingPct = Math.max(0, 100 - (elapsed / seconds) * 100);

  // Chips, not rows with example sentences: nobody reads five sentences in
  // twenty seconds, and the word is about to appear in the audio anyway. The
  // header is gone too — the rail already says "Words coming up".
  return (
    <div className="px-3.5 py-2.5">
      <div className="h-[3px] overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-success-500 transition-[width] duration-100 ease-linear"
          style={{ width: `${remainingPct}%` }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5" dir="ltr">
        {!ready ? (
          <span className="text-[12px] text-muted-foreground">{t('steps.preteach.loading')}</span>
        ) : words.length === 0 ? (
          <span className="text-[12px] text-muted-foreground">{t('steps.preteach.empty')}</span>
        ) : (
          words.map((w) => (
            <span
              key={w.word}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pe-1.5 ps-3 text-[13px] font-semibold text-foreground"
            >
              {w.word}
              {w.level !== 'NR' && <CefrBadge level={w.level} />}
            </span>
          ))
        )}

        <Button size="xs" className="ms-auto" onClick={onContinue}>
          <Play strokeWidth={2.5} />
          {t('steps.preteach.startListening')}
        </Button>
      </div>
    </div>
  );
}
