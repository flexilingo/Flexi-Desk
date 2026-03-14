import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface HorizontalSectionProps {
  title: string;
  icon: LucideIcon;
  isLoading?: boolean;
  isEmpty?: boolean;
  onSeeAll?: () => void;
  children: ReactNode;
}

function SkeletonCard() {
  return (
    <div className="w-[140px] shrink-0 overflow-hidden rounded-lg border border-border bg-card animate-pulse">
      <div className="h-[140px] w-[140px] bg-muted" />
      <div className="space-y-2 p-2">
        <div className="h-3 w-[80%] rounded bg-muted" />
        <div className="h-2 w-[50%] rounded bg-muted" />
      </div>
    </div>
  );
}

export function HorizontalSection({
  title,
  icon: Icon,
  isLoading,
  isEmpty,
  onSeeAll,
  children,
}: HorizontalSectionProps) {
  // Hide section if not loading and no data
  if (!isLoading && isEmpty) return null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="flex items-center gap-0.5 text-xs font-medium text-accent hover:underline"
          >
            See All
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex gap-3 pb-1 px-1">
          {isLoading ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />) : children}
        </div>
      </div>
    </div>
  );
}
