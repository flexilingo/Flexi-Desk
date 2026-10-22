import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCsLocale } from './shared';

/**
 * A card's rows, the first few showing and the rest one tap away — the same
 * "show N more" as the topic page's related list.
 */
export default function CardRows({ rows, first = 3 }: { rows: ReactNode[]; first?: number }) {
  const { t } = useCsLocale();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, first);
  const hidden = rows.length - shown.length;

  return (
    <>
      <ul className="divide-y divide-border border-t border-border">{shown}</ul>
      {hidden > 0 && (
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-accent"
          >
            {t('relatedMore', { count: hidden })}
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
