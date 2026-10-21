import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Eye, Italic, List, Loader2, PenLine, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SimpleMarkdown } from '@/components/common/SimpleMarkdown';

export interface EditingNote {
  id?: string;
  quote: string;
  body: string;
  pageNumber: number;
}

const MAX_LENGTH = 8000;

/**
 * Writing or re-reading one note.
 *
 * A note is stored as the Markdown typed, which is the same string wherever it
 * is later shown. The editor is a plain field with the three formatting buttons
 * that matter and a preview — the desk has no heavier editor to reuse.
 *
 * The quote is shown and never editable: it is what the note is ABOUT, and a
 * quote that could drift from the page it is pinned to would quietly stop
 * meaning anything.
 *
 * The dialog does not close until the save has succeeded: a failed save keeps
 * it open, with the text still in it and the reason underneath.
 */
export function PdfNoteDialog({
  note,
  onSave,
  onDelete,
  onClose,
}: {
  note: EditingNote;
  onSave: (body: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  // Seeded once. The parent remounts this dialog per note (see its `key`), so
  // there is nothing to re-sync — and an effect that re-seeded it would wipe
  // whatever the reader had already typed the moment anything above re-rendered.
  const [body, setBody] = useState(note.body);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  /** Wrap the selection (or insert an empty pair) so the formatting buttons never lose the caret. */
  const wrap = (before: string, after = before) => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: from, selectionEnd: to } = area;
    const next = `${body.slice(0, from)}${before}${body.slice(from, to)}${after}${body.slice(to)}`;
    if (next.length > MAX_LENGTH) return;
    setBody(next);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(from + before.length, to + before.length);
    });
  };
  const bullet = () => {
    const area = areaRef.current;
    if (!area) return;
    const from = body.lastIndexOf('\n', area.selectionStart - 1) + 1;
    const next = `${body.slice(0, from)}- ${body.slice(from)}`;
    if (next.length > MAX_LENGTH) return;
    setBody(next);
    requestAnimationFrame(() => area.focus());
  };

  const run = async (kind: 'save' | 'delete', job: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await job();
    } catch {
      setError(tDesk(kind === 'save' ? 'notes.saveFailed' : 'notes.deleteFailed'));
      setBusy(null);
    }
  };

  const tool =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40';

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl overflow-hidden p-0">
        <div className="h-1 bg-warning" />
        <div className="p-5">
          <DialogHeader className="mb-3 pe-8">
            <DialogTitle className="text-sm font-bold text-foreground">
              {t('pdf.notes.onPage', { n: note.pageNumber })}
            </DialogTitle>
          </DialogHeader>

          {note.quote && (
            <blockquote
              dir="auto"
              className="mb-4 rounded-md border-s-2 border-warning/60 bg-muted px-3 py-2 text-sm italic leading-6 text-muted-foreground"
            >
              {note.quote}
            </blockquote>
          )}

          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="pdf-note-body"
              className="text-xs font-bold uppercase tracking-wide text-primary"
            >
              {t('pdf.notes.label')}
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={preview}
                onClick={() => wrap('**')}
                aria-label={tDesk('notes.bold')}
                title={tDesk('notes.bold')}
                className={tool}
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={preview}
                onClick={() => wrap('*')}
                aria-label={tDesk('notes.italic')}
                title={tDesk('notes.italic')}
                className={tool}
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={preview}
                onClick={bullet}
                aria-label={tDesk('notes.list')}
                title={tDesk('notes.list')}
                className={tool}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPreview((on) => !on)}
                aria-pressed={preview}
                aria-label={preview ? tDesk('notes.write') : tDesk('notes.preview')}
                title={preview ? tDesk('notes.write') : tDesk('notes.preview')}
                className={`${tool} ${preview ? 'border-primary/50 bg-primary/10 text-primary' : ''}`}
              >
                {preview ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {preview ? (
            <div className="min-h-[11rem] rounded-md border border-border bg-background p-3 text-sm leading-6 text-foreground">
              {body.trim() ? (
                <SimpleMarkdown content={body} />
              ) : (
                <span className="text-muted-foreground">{t('pdf.notes.emptyBody')}</span>
              )}
            </div>
          ) : (
            <textarea
              id="pdf-note-body"
              ref={areaRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              maxLength={MAX_LENGTH}
              dir="auto"
              autoFocus
              placeholder={t('pdf.notes.placeholder')}
              className="block w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button
              disabled={busy !== null}
              onClick={() => run('save', () => onSave(body))}
              className="inline-flex"
            >
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('pdf.notes.save')}
            </Button>
            {onDelete && (
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => run('delete', onDelete)}
                className="inline-flex border-error/40 text-error hover:text-error"
              >
                {busy === 'delete' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t('pdf.notes.delete')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
