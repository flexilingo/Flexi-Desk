import { CheckCircle2, Zap } from 'lucide-react';

/**
 * The one card that answers "was it worth it?". Deliberately NOT an accuracy
 * percentage: accuracy over activities punishes the learner for the very thing the
 * scheduler is designed to do — show a missed card again inside the same session — so
 * a good long session can report 34%. The headline is the count of words that actually
 * moved; the rate lives below it as context rather than as a verdict.
 *
 * Sits on the cream ground like every other card; olive appears only on the small icon tile
 * (a dark-green ground is not part of the design - the website's hero breaks that rule).
 */
export function SessionHero({
  headline,
  facts,
  xp,
  xpLabel,
}: {
  headline: string;
  /** Supporting facts, already formatted. Rendered as a "·" separated line. */
  facts: string[];
  xp: number;
  xpLabel: string;
}) {
  return (
    <div
      className="rounded-2xl border border-border bg-card px-5 py-4 text-foreground sm:px-6 sm:py-5"
      data-testid="session-hero"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-olive-700 text-cream-25">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight tracking-tight sm:text-2xl">
              {headline}
            </h1>
            {facts.length > 0 && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {facts.join(' · ')}
              </p>
            )}
          </div>
        </div>
        {xp > 0 && (
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Zap className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {xpLabel}
              </div>
              <div className="mt-0.5 text-2xl font-black leading-none tabular-nums text-foreground sm:text-3xl">
                +{xp}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
