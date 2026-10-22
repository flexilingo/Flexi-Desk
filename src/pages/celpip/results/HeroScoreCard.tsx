import { Clock, Sparkles, ArrowUp, ArrowDown, Minus, Info, Loader2 } from 'lucide-react';
import { clbTextColor, formatTime, CLB_SCALE, type ScoreScale } from './shared';

// ── HeroScoreCard ─────────────────────────────────────────────────────────────

interface HeroScoreCardProps {
  score: number | null;
  avg: number | null;
  totalTimeSec: number | null;
  mScoreLabel: string;
  /** The "AI analyzed" micro badge; omitted for exams that do not show it. */
  aiAnalyzedLabel?: string;
  levelLabel: string | null;
  vsAvgPositive: (delta: string) => string;
  vsAvgNegative: (delta: string) => string;
  vsAvgEqual: string;
  /** Exam profile scale; defaults to CLB out of 12. */
  scale?: ScoreScale;
  /** A practice slice with no level (TCF CO/CE items only): right answers out of the items sat. */
  count?: { correct: number; total: number; label: string };
  /** A section is still in the scoring queue: show that instead of an empty dash. */
  pendingLabel?: string;
  /** Opens "how is this scored?"; the (i) on the ring shows only when set. */
  onInfo?: () => void;
  infoLabel?: string;
}

export function HeroScoreCard({
  score,
  avg,
  totalTimeSec,
  mScoreLabel,
  aiAnalyzedLabel,
  levelLabel,
  vsAvgPositive,
  vsAvgNegative,
  vsAvgEqual,
  scale = CLB_SCALE,
  count,
  pendingLabel,
  onInfo,
  infoLabel,
}: HeroScoreCardProps) {
  const isLevel = scale.bandKind === 'level';
  const showCount = score == null && count != null && count.total > 0;
  const pct = showCount
    ? count.correct / count.total
    : score != null
      ? Math.max(0, Math.min(1, (score + (isLevel ? 1 : 0)) / (scale.bandMax + (isLevel ? 1 : 0))))
      : 0;
  // Tone reads the scale's own ramp; a count maps its share onto the same ramp.
  const tone = showCount ? Math.round(pct * 12) : scale.toneScore(score);
  // SVG circle geometry: r=70, circumference = 2·π·70 ≈ 439.82. The stroke
  // dashoffset is the un-filled remainder, so a full ring means offset 0.
  const C = 2 * Math.PI * 70;
  const offset = C * (1 - pct);
  // Ring stroke colour mirrors the CLB band; null score is a neutral track.
  const ringTone =
    tone == null
      ? 'text-muted-foreground'
      : tone >= 9
        ? 'text-success'
        : tone >= 7
          ? 'text-primary'
          : tone >= 5
            ? 'text-warning'
            : 'text-error';
  const valueTone = clbTextColor(tone);

  return (
    <div className="bg-card border border-border rounded-[16px] shadow-sm p-5 flex flex-col items-center text-center gap-3 relative overflow-hidden">
      {/* AI-analyzed micro badge — the exam was scored by AI (distinct from the
          insight-origin badge, which says WHERE the extra analysis came from). */}
      {aiAnalyzedLabel && (
        <span className="absolute top-3 end-3 inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/30">
          <Sparkles className="w-2.5 h-2.5" />
          {aiAnalyzedLabel}
        </span>
      )}

      {/* Circular ring */}
      <div className="relative w-[180px] h-[180px] mt-2">
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 160 160"
          aria-hidden="true"
        >
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            className="text-muted"
          />
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={`${ringTone} transition-all duration-500`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[.14em]">
            {mScoreLabel}
          </span>
          {showCount ? (
            <span
              className={`text-[40px] font-extrabold leading-none tabular-nums mt-1 ${valueTone}`}
            >
              <bdi dir="ltr">
                {count.correct}/{count.total}
              </bdi>
            </span>
          ) : score == null && pendingLabel ? (
            <Loader2 className="w-9 h-9 mt-1 animate-spin text-accent" />
          ) : (
            <span
              className={`text-[64px] font-extrabold leading-none tabular-nums mt-1 ${valueTone}`}
            >
              {score != null ? scale.format(score) : '–'}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground tabular-nums uppercase tracking-wider mt-1">
            {showCount ? (
              count.label
            ) : isLevel ? (
              scale.bandLabel
            ) : (
              <bdi dir="ltr">
                / {scale.bandMax} {scale.bandLabel}
              </bdi>
            )}
          </span>
        </div>
        {onInfo && (
          <button
            type="button"
            onClick={onInfo}
            aria-label={infoLabel}
            title={infoLabel}
            className="absolute -top-1 -end-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Info className="w-4 h-4" />
          </button>
        )}
      </div>

      {score == null && pendingLabel ? (
        <p className="text-[13px] font-bold text-foreground px-2">{pendingLabel}</p>
      ) : (
        levelLabel && (
          <p className="text-[12.5px] font-semibold text-foreground px-2">{levelLabel}</p>
        )
      )}

      <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground tabular-nums">
        {totalTimeSec != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(totalTimeSec)}
          </span>
        )}
        <VsAvgBadge
          score={isLevel ? null : score}
          avg={avg}
          t={(key, val) =>
            key === 'vsAvgPositive'
              ? vsAvgPositive(val ?? '')
              : key === 'vsAvgNegative'
                ? vsAvgNegative(val ?? '')
                : vsAvgEqual
          }
          large
        />
      </div>
    </div>
  );
}

// ── VsAvgBadge ────────────────────────────────────────────────────────────────

interface VsAvgBadgeProps {
  score: number | null;
  avg: number | null;
  t: (key: 'vsAvgPositive' | 'vsAvgNegative' | 'vsAvgEqual', val?: string) => string;
  large?: boolean;
}

export function VsAvgBadge({ score, avg, t, large }: VsAvgBadgeProps) {
  // No comparison possible without both numbers — render nothing.
  if (score == null || avg == null) return null;
  const delta = Math.round((score - avg) * 10) / 10;
  if (delta === 0) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full font-bold bg-muted text-muted-foreground ${
          large ? 'text-[11px]' : 'text-[9.5px]'
        }`}
      >
        <Minus className={large ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
        {t('vsAvgEqual')}
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full font-bold bg-success/15 text-success tabular-nums ${
          large ? 'text-[11px]' : 'text-[9.5px]'
        }`}
      >
        <ArrowUp className={large ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
        {t('vsAvgPositive', String(delta))}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full font-bold bg-error/15 text-error tabular-nums ${
        large ? 'text-[11px]' : 'text-[9.5px]'
      }`}
    >
      <ArrowDown className={large ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
      {t('vsAvgNegative', String(delta))}
    </span>
  );
}
