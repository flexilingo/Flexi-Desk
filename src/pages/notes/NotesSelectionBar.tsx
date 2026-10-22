import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InlineError } from '@/components/common/InlineError';
import { errorCode } from './notesApi';

interface Props {
  count: number;
  onDeselectAll: () => void;
  onDelete: () => void;
  /** Resolves when every note took the tag; rejects with a code when some did not. */
  onAddTag: (tag: string) => Promise<void>;
}

export function NotesSelectionBar({ count, onDeselectAll, onDelete, onAddTag }: Props) {
  const { t } = useTranslation('notes');
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  const add = async () => {
    const value = tag.trim().toLowerCase();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await onAddTag(value);
      setTag('');
      setOpen(false);
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary-light px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground">
          {count}
        </span>
        <span className="font-medium text-muted-foreground">{t('selectedCount', { count })}</span>
      </span>
      <div className="h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="bg-error/15 text-error hover:bg-error/25 hover:text-error"
      >
        <Trash2 />
        {t('bulkDelete')}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Tag />
            {t('bulkAddTag')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" side="top" className="w-72 space-y-2 p-3">
          <div className="flex gap-2">
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              placeholder={t('addTag')}
              dir="auto"
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] text-foreground outline-none placeholder:text-caption focus:border-accent"
            />
            <Button
              variant="accent"
              size="icon-sm"
              onClick={add}
              loading={busy}
              aria-label={t('addTag')}
            >
              {!busy && <Plus />}
            </Button>
          </div>
          {error && <InlineError message={error} onDismiss={() => setError(null)} />}
        </PopoverContent>
      </Popover>
      <div className="h-5 w-px bg-border" />
      <Button variant="ghost" size="sm" onClick={onDeselectAll}>
        <X />
        {t('deselectAll')}
      </Button>
    </div>
  );
}
