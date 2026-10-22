import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { targetLanguages, getLanguageByCode } from '@/config/languages';

/** A searchable language picker (the website's `LanguageSearchSelect`). */
export function LanguageSearchSelect({
  value,
  onSelect,
  disabled,
  label,
  searchPlaceholder,
  noResults,
}: {
  value: string;
  onSelect: (code: string) => void;
  disabled?: boolean;
  label: string;
  searchPlaceholder: string;
  noResults: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = getLanguageByCode(value);
  const needle = q.trim().toLowerCase();
  const list = targetLanguages.filter(
    (l) =>
      !needle ||
      l.name.toLowerCase().includes(needle) ||
      l.nativeName.toLowerCase().includes(needle) ||
      l.code === needle,
  );
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={label}
          className="min-w-[200px] justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {value}
            </span>
            <span dir={current?.dir}>{current?.nativeName ?? value}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2"
        />
        <div className="max-h-60 overflow-y-auto">
          {list.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">{noResults}</p>
          )}
          {list.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setOpen(false);
                setQ('');
                onSelect(l.code);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted',
                l.code === value && 'bg-primary/10 text-primary',
              )}
            >
              <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                {l.code}
              </span>
              <span dir={l.dir} className="flex-1 truncate">
                {l.nativeName}
              </span>
              <span className="text-xs text-muted-foreground">{l.name}</span>
              {l.code === value && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
