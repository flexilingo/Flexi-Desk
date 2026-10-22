import { useTranslation } from 'react-i18next';
import { Layers, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  count: number;
  totalOnPage: number;
  isAllSelected: boolean;
  /** How many of the selected words are on this computer (the only ones that can be deleted). */
  deletable: number;
  onAddToDeck: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}

/** The bar that rises from the bottom while words are selected (the website's VocabAddToDeckBar). */
export function VocabSelectionBar({
  count,
  totalOnPage,
  isAllSelected,
  deletable,
  onAddToDeck,
  onDelete,
  onSelectAll,
  onClear,
}: Props) {
  const { t } = useTranslation('vocabulary');
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 transition-transform duration-300',
        count > 0 ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
      aria-hidden={count === 0}
    >
      <div className="mx-auto max-w-5xl px-4 pb-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-success/30 bg-card/95 px-5 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {t('selectionBar.selected', { count })}
            </span>
            {!isAllSelected && totalOnPage > count && (
              <Button
                type="button"
                variant="link"
                onClick={onSelectAll}
                className="text-xs font-medium"
              >
                {t('selectionBar.selectAll', { count: totalOnPage })}
              </Button>
            )}
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-caption transition-colors hover:text-foreground"
            >
              {t('selectionBar.clear')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {deletable > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="bg-error/15 text-error hover:bg-error/25 hover:text-error"
              >
                <Trash2 />
                {t('deleteSelected', { count: deletable })}
              </Button>
            )}
            <Button type="button" variant="accent" onClick={onAddToDeck}>
              <Layers />
              {t('addToDeck')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
