import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CornerUpRight, Plus, Search, StickyNote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimpleMarkdown } from '@/components/common/SimpleMarkdown';
import type { ReaderNote } from '../types';

/**
 * Every note in the book, in one place.
 *
 * The markers on the page answer "is there a note here"; they cannot answer
 * "what have I written so far", which is the question you actually have when
 * you come back to a book after a week. Notes are grouped by page and ordered
 * the way the book is, so the list reads as a record of the reading rather than
 * as a pile in the order they happened to be typed.
 *
 * Adding a note from here needs no selection — not everything worth writing
 * down is about a particular phrase, and requiring one would quietly forbid
 * "this whole exercise was hard".
 */
export function PdfNotesPanel({
  notes,
  currentPage,
  onOpen,
  onGoToNote,
  onAddToCurrentPage,
  onClose,
}: {
  notes: ReaderNote[];
  currentPage: number;
  onOpen: (note: ReaderNote) => void;
  onGoToNote: (note: ReaderNote) => void;
  onAddToCurrentPage: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');
  const [query, setQuery] = useState('');

  const byPage = useMemo(() => {
    // Matched against what the reader WROTE and what they highlighted, plus the
    // page number — "page 28" is how you look for a note as often as any word
    // in it. Accents are folded, so `francais` finds `français`: nobody
    // searching their own notes should have to reproduce the diacritics.
    const needle = query.trim().toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const matches = (note: ReaderNote) => {
      if (!needle) return true;
      const hay = `${note.body} ${note.quote} ${note.page_number}`
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '');
      return hay.includes(needle);
    };

    const groups = new Map<number, ReaderNote[]>();
    for (const note of [...notes].filter(matches).sort((a, b) => a.page_number - b.page_number)) {
      const list = groups.get(note.page_number) ?? [];
      list.push(note);
      groups.set(note.page_number, list);
    }
    return [...groups.entries()];
  }, [notes, query]);

  const hiddenByQuery = query.trim().length > 0 && byPage.length === 0 && notes.length > 0;

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-s border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/[0.14]">
          <StickyNote className="h-4 w-4 text-warning" />
        </span>
        <h2 className="flex-1 text-sm font-bold text-foreground">
          {t('pdf.notes.panelTitle', { n: notes.length })}
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

      <div className="space-y-2.5 border-b border-border px-4 py-2.5">
        <Button
          variant="outline"
          size="md"
          onClick={onAddToCurrentPage}
          className="inline-flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t('pdf.notes.addOnPage', { n: currentPage })}
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('pdf.notes.search')}
            aria-label={t('pdf.notes.search')}
            className="h-9 w-full rounded-md border border-border bg-card ps-8 pe-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="px-4 py-6 text-sm leading-6 text-muted-foreground">
            {t('pdf.notes.empty')}
          </p>
        ) : hiddenByQuery ? (
          <p className="px-4 py-6 text-sm leading-6 text-muted-foreground">
            {t('pdf.notes.noMatch', { q: query })}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {byPage.map(([pageNumber, pageNotes]) => (
              <li key={pageNumber} className="px-4 py-3">
                <p className="mb-2 text-xs font-bold text-primary">
                  {t('pdf.notes.onPage', { n: pageNumber })}
                </p>

                <ul className="space-y-2">
                  {pageNotes.map((note) => (
                    <li key={note.id} className="rounded-md border border-border bg-muted">
                      {/* Two actions on one note, because they are different
                          intentions: go and look at it where it sits, or open
                          it to read and change. Folding them into one click
                          meant always guessing wrong for one of them. */}
                      <button
                        type="button"
                        onClick={() => onGoToNote(note)}
                        className="block w-full p-3 text-start transition-colors hover:bg-muted"
                      >
                        {note.quote && (
                          <span className="mb-1.5 block border-s-2 border-warning/60 ps-2 text-xs italic leading-5 text-muted-foreground">
                            {note.quote.length > 120 ? `${note.quote.slice(0, 120)}…` : note.quote}
                          </span>
                        )}
                        <span className="block text-sm leading-6 text-foreground">
                          {note.body.trim() ? (
                            <SimpleMarkdown content={note.body} />
                          ) : (
                            <span className="text-muted-foreground">
                              {t('pdf.notes.emptyBody')}
                            </span>
                          )}
                        </span>
                      </button>
                      <span className="flex justify-end border-t border-border px-2 py-1">
                        <button
                          type="button"
                          onClick={() => onOpen(note)}
                          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <CornerUpRight className="h-3 w-3" />
                          {t('pdf.notes.openNote')}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
