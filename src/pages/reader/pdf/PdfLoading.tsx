import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import './pdf-text-layer.css';

/**
 * What a book looks like while it is opening.
 *
 * The first version of this was a grey rectangle, which says nothing: a reader
 * waiting on a 191 MB textbook could not tell it apart from a page that had
 * failed, and the honest answer — "your book is arriving, this much of it so
 * far" — was information we already had and were throwing away.
 *
 * So it names the file, shows the real fraction pdf.js reports, and draws the
 * shape of a page underneath. A bar that moves is the difference between
 * waiting and wondering.
 */
export function PdfLoading({ title, progress }: { title: string; progress: number | null }) {
  const { t } = useTranslation('reader');
  const pct = progress === null ? null : Math.round(progress * 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {title || t('pdf.loading.untitled')}
            </span>
            <span className="block text-xs text-muted-foreground">{t('pdf.loading.opening')}</span>
          </span>
          {pct !== null && (
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">{pct}%</span>
          )}
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          {/* Indeterminate until pdf.js knows the size — a bar sitting at zero
              reads as stuck, so it sweeps instead of pretending to a number. */}
          <div
            className={
              pct === null
                ? 'h-full w-1/3 animate-[pdfSweep_1.4s_ease-in-out_infinite] rounded-full bg-primary/70'
                : 'h-full rounded-full bg-success transition-[width] duration-200'
            }
            // The real fraction pdf.js reports — a continuous value.
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>

        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t('pdf.loading.hint')}</p>
      </div>
    </div>
  );
}
