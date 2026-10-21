import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, PenLine, X } from 'lucide-react';
import type { TextBox, TextBoxStore } from '../lib/text-box-store';
import { inkTextClass, inkTextStyle } from '../lib/ink';

/**
 * Everything written in this book, in the order it appears in it.
 *
 * A page you have filled in looks exactly like a page you have not until you
 * are standing on it, and a textbook is two hundred pages long. So the answers
 * are also a list: what you wrote, which page it is on, and a way back to it.
 *
 * Reading order, not the order they were written: the reader is looking for
 * "the exercise on page 42", never "the sixth thing I typed".
 */
export function PdfWritingPanel({
  store,
  currentPage,
  onGoToBox,
  onClose,
}: {
  store: TextBoxStore;
  currentPage: number;
  /** Lands on the page, at the height the box sits at. */
  onGoToBox: (box: TextBox) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');
  const subscribe = useCallback((listener: () => void) => store.subscribeAll(listener), [store]);
  const boxes = useSyncExternalStore(
    subscribe,
    () => store.allBoxes(),
    () => store.allBoxes(),
  );

  // An empty box is one being written this second; it is not an answer yet.
  const written = useMemo(() => boxes.filter((box) => box.body.trim()), [boxes]);

  const groups = useMemo(() => {
    const out: { page: number; rows: TextBox[] }[] = [];
    for (const box of written) {
      const last = out[out.length - 1];
      if (last && last.page === box.page) last.rows.push(box);
      else out.push({ page: box.page, rows: [box] });
    }
    return out;
  }, [written]);

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-s border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <PenLine className="h-4 w-4 text-primary" />
        </span>
        <h2 className="flex-1 text-sm font-bold text-foreground">
          {t('pdf.write.panelTitle', { n: written.length })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pdf.notes.close')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {written.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t('pdf.write.empty')}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.page}>
              <h3 className="sticky top-0 z-[1] border-y border-border bg-muted px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                {t('pdf.write.onPage', { n: group.page })}
                {group.page === currentPage && (
                  <span className="ms-1.5 font-semibold normal-case text-muted-foreground">
                    {t('pdf.write.here')}
                  </span>
                )}
              </h3>
              <ul className="divide-y divide-border">
                {group.rows.map((box) => (
                  <li key={box.key} className="flex items-start gap-2 px-3 py-2">
                    {/* Shown in the ink it was written in — that is how the
                        reader recognises their own answer in a list. */}
                    <p
                      style={inkTextStyle(box.color)}
                      className={`min-w-0 flex-1 whitespace-pre-wrap break-words px-1.5 text-sm leading-snug ${
                        box.bold ? 'font-bold' : 'font-medium'
                      } ${inkTextClass(box.color)}`}
                    >
                      {box.body}
                    </p>
                    <button
                      type="button"
                      onClick={() => onGoToBox(box)}
                      aria-label={t('pdf.write.goToPage', { n: box.page })}
                      title={t('pdf.write.goToPage', { n: box.page })}
                      className="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary/55 hover:bg-primary/10"
                    >
                      {t('pdf.audio.go')}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
