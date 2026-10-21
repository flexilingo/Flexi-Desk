import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Layers, WholeWord, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToDeckSheet } from '@/components/common/AddToDeckSheet';
import type { ReaderWordSummary } from '../types';

/**
 * Every word looked up in this book, ready to become flashcards.
 *
 * Each lookup has been logged since the Reader shipped (`log-word`), and the
 * list endpoint existed, but nothing ever showed it. So a reader could spend
 * fifty minutes on a novel, open forty-five words, and leave with none of
 * them saved (PostHog, 2026-09-25). Most-looked-up first: a word opened three
 * times is the one worth reviewing. All start selected — they are already the
 * reader's own choice, unlike the page-ranked picker in ReaderDeckButton.
 */
export function PdfWordsPanel({
  words: items,
  loading: isLoading,
  documentTitle,
  language,
  onGoToPage,
  onClose,
}: {
  /** Every word looked up in this document, folded across its lookups. */
  words: ReaderWordSummary[];
  loading: boolean;
  documentTitle: string;
  language: string;
  onGoToPage: (page: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('reader');

  const words = useMemo(
    () => [...items].sort((a, b) => b.count - a.count || b.last_seen.localeCompare(a.last_seen)),
    [items],
  );

  // Keys the reader unticked. Stored as exclusions so a word looked up while
  // the panel is open arrives already selected.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [deckOpen, setDeckOpen] = useState(false);

  const chosen = words.filter((w) => !excluded.has(w.key));
  const toggle = (word: ReaderWordSummary) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(word.key)) next.delete(word.key);
      else next.add(word.key);
      return next;
    });

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-s border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <WholeWord className="h-4 w-4 text-primary" />
        </span>
        <h2 className="flex-1 text-sm font-bold text-foreground">
          {t('pdf.words.panelTitle', { n: words.length })}
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

      {words.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          {chosen.length > 0 && (
            <Button
              size="md"
              onClick={() => setDeckOpen(true)}
              className="inline-flex items-center gap-1.5"
            >
              <Layers className="h-4 w-4" />
              {t('pdf.words.addToDeck', { n: chosen.length })}
            </Button>
          )}
          <button
            type="button"
            onClick={() =>
              setExcluded(
                chosen.length === words.length ? new Set(words.map((w) => w.key)) : new Set(),
              )
            }
            className="inline-flex items-center rounded-md px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary/10"
          >
            {chosen.length === words.length ? t('pdf.words.clearAll') : t('pdf.words.selectAll')}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 px-4 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : words.length === 0 ? (
          <p className="px-4 py-6 text-sm leading-6 text-muted-foreground">
            {t('pdf.words.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {words.map((word) => {
              const on = !excluded.has(word.key);
              return (
                <li key={word.key} className="flex items-start gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={word.word}
                    onClick={() => toggle(word)}
                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card'
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span dir="auto" className="text-sm font-bold text-foreground">
                        {word.word}
                      </span>
                      {word.count > 1 && (
                        <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-bold tabular-nums text-primary">
                          ×{word.count}
                        </span>
                      )}
                    </div>
                    {word.context && (
                      <p
                        dir="auto"
                        className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground"
                      >
                        {word.context}
                      </p>
                    )}
                    {word.pages.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {word.pages.slice(0, 6).map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => onGoToPage(page)}
                            className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                          >
                            {t('pdf.words.page', { n: page })}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deckOpen && (
        <AddToDeckSheet
          open
          onOpenChange={(open) => !open && setDeckOpen(false)}
          // The sentence each word was read in, so every card carries its context.
          items={chosen.map((w) => ({
            word: w.word,
            language,
            exampleSentence: w.context ?? undefined,
          }))}
          sourceLanguage={language}
          defaultDeckName={documentTitle}
        />
      )}
    </aside>
  );
}
