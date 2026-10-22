import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** A loading placeholder in the page's own cream, gently pulsing. */
function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
