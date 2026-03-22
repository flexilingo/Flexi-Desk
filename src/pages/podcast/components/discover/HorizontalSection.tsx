import { useRef, useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface HorizontalSectionProps {
  title: string;
  icon: LucideIcon;
  isLoading?: boolean;
  isEmpty?: boolean;
  onMoreClick?: () => void;
  children: ReactNode;
}

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-[200px] snap-start rounded-lg overflow-hidden">
      <div className="h-36 bg-muted/50 animate-pulse" />
      <div className="p-3 space-y-2 bg-card">
        <div className="h-4 bg-muted/50 animate-pulse rounded w-3/4" />
        <div className="h-3 bg-muted/50 animate-pulse rounded w-1/2" />
        <div className="h-2 bg-muted/50 animate-pulse rounded w-full" />
      </div>
    </div>
  );
}

export function HorizontalSection({
  title,
  icon: Icon,
  isLoading,
  isEmpty,
  onMoreClick,
  children,
}: HorizontalSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Check after a frame so children are measured
    requestAnimationFrame(checkScroll);

    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      observer.disconnect();
    };
  }, [checkScroll, children, isLoading]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // Hide section if not loading and no data
  if (!isLoading && isEmpty) return null;

  return (
    <div className="mb-8 min-w-0">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {onMoreClick && (
            <button
              onClick={onMoreClick}
              className="text-sm text-accent hover:text-accent/80 font-medium transition-colors"
            >
              More →
            </button>
          )}
          {(canScrollLeft || canScrollRight) && (
            <>
              <button
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                className="w-7 h-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4 text-foreground" />
              </button>
              <button
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                className="w-7 h-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4 text-foreground" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        style={{ overflowX: 'auto', overflowY: 'hidden' }}
        className="w-full min-w-0 scrollbar-hide snap-x snap-mandatory pb-2"
      >
        <div className="flex gap-4 w-fit">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : children}
        </div>
      </div>
    </div>
  );
}
