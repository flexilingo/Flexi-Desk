import { Clock, Sparkles, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { clbTextColor, formatTime } from './shared';

// ── HeroScoreCard ─────────────────────────────────────────────────────────────

interface HeroScoreCardProps {
  score: number | null;
  avg: number | null;
  totalTimeSec: number | null;
  mScoreLabel: string;
  aiAnalyzedLabel: string;
  levelLabel: string | null;
  vsAvgPositive: (delta: string) => string;
  vsAvgNegative: (delta: string) => string;
  vsAvgEqual: string;
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
}: HeroScoreCardProps) {
  const pct = score != null ? Math.max(0, Math.min(1, score / 12)) : 0;
  // SVG circle geometry: r=70, circumference = 2·π·70 ≈ 439.82. The stroke
  // dashoffset is the un-filled remainder, so a full ring means offset 0.
  const C = 2 * Math.PI * 70;
  const offset = C * (1 - pct);
  // Ring stroke colour mirrors the CLB band; null score is a neutral track.
  const ringTone =
    score == null
      ? 'text-muted-foreground'
      : score >= 9
        ? 'text-success'
        : score >= 7
          ? 'text-primary'
          : score >= 5
            ? 'text-warning'
            : 'text-error';
  const valueTone = clbTextColor(score);

  return (
    <div className="bg-card border border-border rounded-[16px] shadow-sm p-5 flex flex-col items-center text-center gap-3 relative overflow-hidden">
      {/* AI-analyzed micro badge — the exam was scored by AI (distinct from the
          insight-origin badge, which says WHERE the extra analysis came from). */}
      <span className="absolute top-3 end-3 inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/30">
        <Sparkles className="w-2.5 h-2.5" />
        {aiAnalyzedLabel}
      </span>

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
          <span
            className={`text-[64px] font-extrabold leading-none tabular-nums mt-1 ${valueTone}`}
          >
            {score ?? '–'}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums uppercase tracking-wider mt-1">
            / 12 CLB
          </span>
        </div>
      </div>

      {levelLabel && (
        <p className="text-[12.5px] font-semibold text-foreground px-2">{levelLabel}</p>
      )}

      <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground tabular-nums">
        {totalTimeSec != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTime(totalTimeSec)}
          </span>
        )}
        <VsAvgBadge
          score={score}
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
