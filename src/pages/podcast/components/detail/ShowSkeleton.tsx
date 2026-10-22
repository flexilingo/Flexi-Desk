function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className ?? ''}`} />;
}

/** The show page while its first data lands: the hero and the box grid, drawn as placeholders. */
export function ShowSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <section className="rounded-[9px] border border-border bg-muted/40">
        <div className="px-6 pb-7 pt-5">
          <Bone className="mb-4 h-3 w-40" />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
            <div className="flex min-w-0 items-start gap-5">
              <Bone className="h-28 w-28 shrink-0 rounded-[9px]" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <Bone className="h-3 w-24" />
                <Bone className="h-7 w-2/3" />
                <div className="flex flex-wrap gap-2">
                  <Bone className="h-6 w-32" />
                  <Bone className="h-6 w-20" />
                  <Bone className="h-6 w-24" />
                </div>
                <div className="max-w-[760px] space-y-2 pt-1">
                  <Bone className="h-3.5 w-full" />
                  <Bone className="h-3.5 w-2/3" />
                </div>
                <div className="flex gap-2.5 pt-2">
                  <Bone className="h-10 w-48 rounded-[9px]" />
                  <Bone className="h-10 w-24 rounded-[9px]" />
                </div>
              </div>
            </div>
            <Bone className="hidden h-48 rounded-[9px] lg:block" />
          </div>
        </div>
      </section>
      <div>
        <Bone className="h-6 w-40" />
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <li
              key={i}
              className="list-none overflow-hidden rounded-[9px] border border-border bg-card"
            >
              <div className="aspect-square animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
