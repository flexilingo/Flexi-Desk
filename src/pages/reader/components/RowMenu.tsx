import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QUIET_MENU } from '../lib/reading-copy';

export interface MenuAction {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}

/** The quiet "more" menu on a card or row. */
export function RowMenu({ items, label }: { items: MenuAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} title={label} className={QUIET_MENU}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setOpen(false);
              item.onClick();
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm transition-colors hover:bg-muted',
              item.destructive ? 'text-error' : 'text-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
