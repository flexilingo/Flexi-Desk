import { cn } from '@/lib/utils';

/** The reading card's lines while they load (website: `LinesSkeleton`): faint lines around one strong one. */
export function LinesSkeleton({ className }: { className?: string }) {
  const bar = 'animate-pulse bg-muted';
  const context = (w: string, o: string) => <div className={cn('h-4 rounded-full', bar, w, o)} />;
  return (
    <div
      aria-hidden
      className={cn(
        'flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 px-6',
        className,
      )}
    >
      {context('w-1/2', 'opacity-40')}
      {context('w-2/3', 'opacity-60')}
      <div className="flex w-full max-w-[720px] flex-col items-center gap-3 rounded-2xl bg-muted/60 px-4 py-5">
        <div className={cn('h-7 w-5/6 rounded-full', bar)} />
        <div className={cn('h-7 w-1/2 rounded-full', bar)} />
      </div>
      {context('w-3/5', 'opacity-60')}
      {context('w-2/5', 'opacity-40')}
    </div>
  );
}
