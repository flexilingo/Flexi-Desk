import { AlignLeft, FileText, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookCover } from '../library/BookCover';
import type { ReadingItem } from '../lib/queue';

/**
 * What an item on the reading list looks like at a glance: a library book by
 * its cover, a document by what kind of file it is. The picture does the work
 * a "Library / PDF / Photo" chip would do in words.
 */
export function ReaderThumb({ item, size }: { item: ReadingItem; size: 'xs' | 'md' }) {
  if (item.cover) {
    return (
      <BookCover
        slug={item.cover.slug}
        title={item.title}
        level={item.level ?? 'A1'}
        coverPath={item.cover.path}
        size={size === 'xs' ? 'xs' : 'sm'}
        showLevel={false}
      />
    );
  }

  const Icon = item.kind === 'image' ? ImageIcon : item.kind === 'text' ? AlignLeft : FileText;
  return (
    <div
      aria-hidden
      className={cn(
        'flex aspect-[3/4] items-center justify-center border border-border bg-muted text-primary-dark',
        size === 'xs' ? 'rounded-[5px]' : 'rounded-[7px]',
      )}
    >
      <Icon className={size === 'xs' ? 'h-4 w-4' : 'h-7 w-7'} />
    </div>
  );
}
