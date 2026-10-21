import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CefrBadge } from '@/components/common/CefrBadge';
import type { CefrLevel } from '../services/libraryService';
import { coverUrl } from './format';

// A single-hue ramp for books without artwork: the level badge carries the
// information, the colour only has to tell one book from the next.
const TONES = ['bg-primary', 'bg-primary-dark', 'bg-primary/80', 'bg-primary-dark/80'];

/** Stable per book, so a cover keeps its colour between visits and pages. */
function toneFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

/**
 * A book's cover, 3:4. The real artwork when the book has one (served by the
 * website); until then — or when it fails to load — a typographic cover: title,
 * level and a large faint first letter, so a shelf never shows an empty box.
 * `xs` is a list thumbnail: the tone and the first letter only.
 */
export function BookCover({
  slug,
  title,
  level,
  series,
  coverPath,
  size = 'md',
  alt = '',
  showLevel = true,
}: {
  slug: string;
  title: string;
  level: string;
  series?: string | null;
  coverPath?: string | null;
  size?: 'xs' | 'sm' | 'md';
  alt?: string;
  showLevel?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);

  if (coverPath && failed !== coverPath) {
    return (
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted shadow-sm">
        <img
          src={coverUrl(coverPath)}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(coverPath)}
        />
        {showLevel && (
          <span className="absolute end-2 top-2">
            <CefrBadge level={level as CefrLevel} className="bg-card" />
          </span>
        )}
      </div>
    );
  }

  if (size === 'xs') {
    return (
      <div
        aria-hidden
        className={cn(
          'flex aspect-[3/4] items-center justify-center rounded-[5px] font-serif text-[15px] font-bold text-primary-foreground/80',
          toneFor(slug),
        )}
      >
        {title.charAt(0)}
      </div>
    );
  }

  const small = size === 'sm';
  return (
    <div
      className={cn(
        'relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-md text-primary-foreground shadow-sm',
        toneFor(slug),
        small ? 'p-2' : 'p-3.5',
      )}
    >
      <span aria-hidden className="absolute inset-y-0 start-0 w-[5px] bg-black/20" />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -bottom-3 -end-1 font-serif font-bold leading-none text-primary-foreground/10',
          small ? 'text-[72px]' : 'text-[120px]',
        )}
      >
        {title.charAt(0)}
      </span>
      <span className="flex items-start justify-between gap-2 ps-1">
        {!small && series ? (
          <span className="line-clamp-2 text-[10px] font-bold uppercase tracking-[0.1em] text-primary-foreground/70">
            {series}
          </span>
        ) : (
          <span />
        )}
        <CefrBadge level={level as CefrLevel} className="bg-card" />
      </span>
      <span
        className={cn(
          'relative line-clamp-3 ps-1 font-serif font-bold leading-tight',
          small ? 'text-[11.5px]' : 'text-[17px]',
        )}
        dir="auto"
      >
        {title}
      </span>
    </div>
  );
}
