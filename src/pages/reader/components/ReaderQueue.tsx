import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, X } from 'lucide-react';
import { deleteReaderDocument } from '../services/readerService';
import { removeFromLibraryShelf } from '../services/libraryService';
import { useReaderErrorText } from '../lib/use-error-text';
import type { ReadingItem } from '../lib/queue';
import { ConfirmDialog } from './ConfirmDialog';
import { ReaderContinueCard } from './ReaderContinueCard';
import { ReaderQueueRow } from './ReaderQueueRow';
import type { MenuAction } from './RowMenu';

/** How many rows show before the list asks to be expanded. */
const VISIBLE = 6;

/**
 * Everything the reader can continue, in one list.
 *
 * The newest UNFINISHED item is lifted out into the continue card and the rest
 * follow as rows, so the page answers "where was I" before it answers "what
 * else do I have". A finished book never leads — "read again" is not where
 * anyone was. `lead` replaces the card altogether, for the sequel of a book
 * just finished. Books and documents are interleaved by activity rather than
 * separated by where they came from.
 *
 * `onChanged` runs after a delete or a removal succeeded, so the page reloads.
 */
export function ReaderQueue({
  items,
  lead,
  onChanged,
}: {
  items: ReadingItem[];
  lead?: ReactNode;
  onChanged: () => void;
}) {
  const { t } = useTranslation('reader');
  const { t: tl } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();

  const [pending, setPending] = useState<ReadingItem | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const unfinished = items.findIndex((i) => !i.finished);
  const heroAt = lead ? -1 : Math.max(unfinished, 0);
  const current = heroAt >= 0 ? items[heroAt] : null;
  const rest = items.filter((_, i) => i !== heroAt);
  const shown = expanded ? rest : rest.slice(0, VISIBLE);

  // A local document has one view (its pages), so the text/pages switch of the
  // website never appears; the only action is the removal.
  const menuFor = (item: ReadingItem): MenuAction[] => [
    {
      icon: item.kind === 'book' ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />,
      label: item.kind === 'book' ? tl('catalog.remove') : t('library.delete'),
      destructive: true,
      onClick: () => {
        setFailure(null);
        setPending(item);
      },
    },
  ];

  const confirm = async () => {
    if (!pending || working) return;
    setWorking(true);
    try {
      if (pending.kind === 'book' && pending.bookId)
        await removeFromLibraryShelf({ book_id: pending.bookId });
      else if (pending.documentId) await deleteReaderDocument({ document_id: pending.documentId });
      setPending(null);
      setFailure(null);
      onChanged();
    } catch (cause) {
      // The dialog stays open with the reason in it — a row that silently
      // refuses to disappear reads as a broken page.
      setFailure(errorText(cause));
    } finally {
      setWorking(false);
    }
  };

  const isBook = pending?.kind === 'book';

  return (
    <div className="space-y-8">
      {current ? <ReaderContinueCard item={current} menu={menuFor(current)} /> : lead}

      {rest.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground">{t('home.queueHeading')}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('home.queueCount', { n: rest.length })}
            </span>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {shown.map((item) => (
              <ReaderQueueRow key={item.id} item={item} menu={menuFor(item)} />
            ))}
          </ul>

          {rest.length > VISIBLE && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-bold text-primary transition-colors hover:bg-muted"
              >
                {expanded ? t('home.showLess') : t('home.showAll', { n: rest.length - VISIBLE })}
              </button>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setFailure(null);
          }
        }}
        title={isBook ? t('home.removeTitle') : t('library.deleteTitle')}
        description={isBook ? t('home.removeBody') : t('library.deleteBody')}
        error={failure}
        confirmText={isBook ? tl('catalog.remove') : t('library.delete')}
        cancelText={tDesk('home.cancel')}
        loading={working}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
