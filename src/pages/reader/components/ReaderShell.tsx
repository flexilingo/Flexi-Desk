import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { BookOpen, FileUp, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddDocumentDialog } from './AddDocumentDialog';

/**
 * The frame of the reading home: the header with the Add button, and the Add
 * dialog. A file dropped anywhere on the page opens the dialog with that file
 * chosen — the page shows a drop target while one is held over it.
 *
 * On the library (the catalogue) the header is the Library's and there is no Add button,
 * drop target or dialog: the reader's own files live on the reading home, and offering
 * upload where they are never listed made people add the same book twice.
 */
export function ReaderShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  const { t: tLibrary } = useTranslation('readingLibrary');
  const isLibrary = /\/reader\/library\/?$/.test(useLocation().pathname);
  const [addOpen, setAddOpen] = useState(false);
  const [incoming, setIncoming] = useState<{ file: File; key: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child; only the outermost pair counts.
  const depth = useRef(0);
  const drops = useRef(0);

  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      className="relative min-w-0 max-w-full"
      onDragEnter={(e) => {
        if (isLibrary || !hasFiles(e)) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!isLibrary && hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (isLibrary || !hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (isLibrary || !hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        drops.current += 1;
        setIncoming({ file, key: drops.current });
        setAddOpen(true);
      }}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {isLibrary ? (
            <Library className="mt-1 h-6 w-6 shrink-0 text-primary" />
          ) : (
            <BookOpen className="mt-1 h-6 w-6 shrink-0 text-primary" />
          )}
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-foreground">
              {isLibrary ? t('nav.library') : t('title')}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isLibrary ? tLibrary('catalog.subtitle') : t('subtitle')}
            </p>
          </div>
        </div>
        {!isLibrary && (
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <FileUp className="h-4 w-4" />
            {t('home.add')}
          </Button>
        )}
      </div>

      {children}

      {!isLibrary && dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/10"
        >
          <p className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-primary bg-card px-6 py-4 text-sm font-semibold text-foreground shadow-lg">
            <FileUp className="h-5 w-5 text-primary" />
            {tDesk('upload.dropHere')}
          </p>
        </div>
      )}

      {!isLibrary && (
        <AddDocumentDialog open={addOpen} onOpenChange={setAddOpen} incoming={incoming} />
      )}
    </div>
  );
}
