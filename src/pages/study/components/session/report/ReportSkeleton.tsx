/**
 * What the report looks like while the end-session call is still in flight. Rendering
 * the real screen with the numbers it has so far would paint "0 cards / 0:00" for a
 * moment and then replace it — a learner who has just studied for an hour reads that
 * flash as "my session was lost", the one thing the report must never say by accident.
 */
export function ReportSkeleton() {
  return (
    <div
      className="flex animate-pulse flex-col gap-3"
      aria-hidden="true"
      data-testid="report-skeleton"
    >
      <div className="rounded-2xl bg-primary/90 px-5 py-5 sm:px-6">
        <div className="h-5 w-2/3 max-w-[320px] rounded bg-primary-foreground/15" />
        <div className="mt-3 h-3 w-1/2 max-w-[240px] rounded bg-primary-foreground/10" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5">
            <div className="h-2.5 w-20 rounded bg-muted" />
            <div className="mt-4 h-2 w-full rounded-full bg-muted" />
            <div className="mt-3 h-2 w-full rounded-full bg-muted" />
            <div className="mt-5 h-2.5 w-3/4 rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
