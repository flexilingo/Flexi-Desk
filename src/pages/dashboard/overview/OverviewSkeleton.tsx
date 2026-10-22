const card = 'rounded-xl border border-border bg-card';
const line = 'rounded-full bg-muted animate-pulse';
const STATIONS = [
  { viz: 'h-12', rows: 3 },
  { viz: 'h-[58px]', rows: 1 },
  { viz: 'h-11', rows: 2 },
  { viz: 'h-[150px]', rows: 1 },
];

/** The overview's own shape while its numbers load: next step + week, the path, the shelf. Cards stay still; only what is inside breathes. */
export function OverviewSkeleton() {
  return (
    <div aria-hidden data-testid="overview-skeleton" className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className={`${card} flex min-h-[300px] items-center gap-6 p-5 sm:p-6`}>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className={`${line} h-3 w-36`} />
            <div className={`${line} mt-4 h-6 w-4/5`} />
            <div className={`${line} mt-4 h-3 w-3/5`} />
            <div className={`${line} mt-2 h-3 w-2/5`} />
            <div className="mt-5 h-11 w-40 animate-pulse rounded-lg bg-muted" />
            <div className="mt-6 flex gap-2 border-t border-border pt-4">
              <div className={`${line} h-7 w-36`} />
              <div className={`${line} h-7 w-44`} />
            </div>
          </div>
          <div className="hidden h-[150px] w-[150px] shrink-0 animate-pulse rounded-full bg-muted sm:block" />
        </div>
        <div className={`${card} flex min-h-[300px] flex-col p-5`}>
          <div className={`${line} h-3.5 w-28`} />
          <div className={`${line} mt-4 h-6 w-40`} />
          <div className="mt-auto grid grid-cols-7 items-end gap-2 pt-8">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-b-sm rounded-t-md bg-muted" />
            ))}
          </div>
          <div className={`${line} mt-4 h-3 w-1/2`} />
        </div>
      </div>

      <div className={`${card} pt-5`}>
        <div className="px-5 sm:px-6">
          <div className={`${line} h-4 w-40`} />
          <div className={`${line} mt-3 h-3 w-3/4 max-w-xl`} />
        </div>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {STATIONS.map((s, i) => (
            <div key={i} className="flex flex-col items-center gap-2 px-5 py-5">
              <div className="h-14 w-14 rounded-full border-2 border-border bg-card" />
              <div className={`${line} h-3.5 w-28`} />
              <div className={`${line} h-7 w-24`} />
              <div className={`w-full animate-pulse rounded-lg bg-muted ${s.viz}`} />
              {Array.from({ length: s.rows }, (_, r) => (
                <div key={r} className={`${line} h-3 w-full`} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} px-5 pb-5 pt-5 sm:px-6`}>
        <div className={`${line} h-4 w-48`} />
        <div className="mt-4 flex gap-3.5 overflow-hidden md:grid md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={`w-[62%] shrink-0 md:w-auto ${i === 4 ? 'md:hidden xl:block' : ''}`}
            >
              <div className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              <div className={`${line} mt-3 h-3 w-4/5`} />
              <div className={`${line} mt-2 h-3 w-3/5`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
