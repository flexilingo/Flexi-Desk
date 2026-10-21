import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Layers, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AddToDeckSheet } from '@/components/common/AddToDeckSheet';
import { ReaderToolbarItem } from '../text/ReaderToolbar';
import { readerCandidates } from '../lib/candidates';
import {
  BUCKET_ORDER,
  rankPreteach,
  type LevelBucket,
  type PreteachWord,
} from '../lib/word-select';
import { useWordLevels } from '../lib/use-word-levels';

/** Ranked pool offered, and how many start checked. */
export const POOL = 40;
export const PRESELECT = 12;

/**
 * "Make a deck" from the page currently open.
 *
 * The words are ranked hardest-first and the top twelve start selected. That
 * is not a guess dressed up as intelligence: `rankPreteach` can subtract words
 * the learner already knows, but nothing in the product can currently supply
 * that set, so the honest design is to pre-select a defensible few and leave
 * the rest one tap away. Selecting all 250 words on a page would produce a
 * deck nobody reviews twice.
 *
 * Levels come from the on-device tables. A language without a table is ranked
 * by how often the word recurs on the page instead of by a fabricated level.
 */
export function ReaderDeckButton({
  pageText,
  page,
  documentTitle,
  language,
}: {
  /** The text of the page on screen. */
  pageText: string;
  page: number;
  documentTitle: string;
  language: string;
}) {
  const { t } = useTranslation('reader');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [handoffOpen, setHandoffOpen] = useState(false);
  // The sheet reports success through its own close; remember it so the picker
  // closes with it instead of being left behind a finished job.
  const addedRef = useRef(false);

  const candidates = useMemo(
    () => (pageText ? readerCandidates(pageText, language) : []),
    [pageText, language],
  );
  const words = useMemo(() => candidates.map((c) => c.word), [candidates]);
  const { levelOf, usable, ready } = useWordLevels(words, language);

  const ranked: PreteachWord[] = useMemo(() => {
    if (!ready) return [];
    if (!usable) {
      // No level data for this language: rank by how often the word recurs on
      // the page. A defensible fallback rather than a fabricated level.
      return [...candidates]
        .sort((a, b) => b.occurrences - a.occurrences || a.word.localeCompare(b.word))
        .slice(0, POOL)
        .map((c) => ({
          word: c.word,
          level: 'NR' as LevelBucket,
          sentence: c.sentence,
          occurrences: c.occurrences,
          score: c.occurrences,
        }));
    }
    return rankPreteach(candidates, { levelOf, count: POOL });
  }, [usable, ready, candidates, levelOf]);

  const openPicker = () => {
    setSelected(new Set(ranked.slice(0, PRESELECT).map((w) => w.word)));
    setOpen(true);
  };

  const toggle = (word: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });

  const grouped = useMemo(() => {
    const map = new Map<LevelBucket, PreteachWord[]>();
    for (const w of ranked) {
      if (!map.has(w.level)) map.set(w.level, []);
      map.get(w.level)!.push(w);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => [b, map.get(b)!] as const);
  }, [ranked]);

  const chosen = ranked.filter((w) => selected.has(w.word));
  const isBusy = candidates.length > 0 && !ready;
  const quiet =
    'rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

  return (
    <>
      <ReaderToolbarItem
        icon={isBusy ? Loader2 : Layers}
        busy={isBusy}
        label={t('deck.button')}
        onClick={openPicker}
        disabled={isBusy || candidates.length === 0}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('deck.title', { n: page })}</DialogTitle>
          </DialogHeader>

          {isBusy ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('deck.loading')}</p>
          ) : ranked.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Layers className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('deck.noCandidates')}</p>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted-foreground">{t('deck.body')}</p>

              {/* The count leads; the three shortcuts are quiet text. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <span className="font-semibold text-foreground">
                  {t('deck.selected', { n: selected.size })}
                </span>
                <span className="ms-auto flex items-center gap-3 font-semibold text-primary">
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(new Set(ranked.slice(0, PRESELECT).map((w) => w.word)))
                    }
                    className={quiet}
                  >
                    {t('deck.selectTop')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(ranked.map((w) => w.word)))}
                    className={quiet}
                  >
                    {t('deck.selectAll')}
                  </button>
                  <button type="button" onClick={() => setSelected(new Set())} className={quiet}>
                    {t('deck.clear')}
                  </button>
                </span>
              </div>

              {/* One list in one card, a row per level. A chosen word is solid
                  primary (a state, like a switch that is on) against white.
                  Weight does not change on selection, so rows do not jump. */}
              <div className="max-h-[46vh] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                {grouped.map(([bucket, group]) => (
                  <div key={bucket} className="flex gap-3 px-3.5 py-3">
                    <span className="w-7 shrink-0 pt-1 text-[12px] font-semibold text-muted-foreground">
                      {bucket === 'NR' ? '—' : bucket}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-1.5" dir="ltr">
                      {group.map((w) => {
                        const isOn = selected.has(w.word);
                        return (
                          <button
                            key={w.word}
                            type="button"
                            aria-pressed={isOn}
                            onClick={() => toggle(w.word)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors ${
                              isOn
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            {isOn && <Check className="h-3 w-3" strokeWidth={2.5} />}
                            {w.word}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  size="md"
                  onClick={() => setHandoffOpen(true)}
                  disabled={selected.size === 0}
                >
                  {t('deck.continue')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {handoffOpen && (
        <AddToDeckSheet
          open
          onOpenChange={(next) => {
            if (next) return;
            setHandoffOpen(false);
            if (addedRef.current) {
              addedRef.current = false;
              setOpen(false);
            }
          }}
          onAdded={() => {
            addedRef.current = true;
          }}
          // Each card carries the sentence it was actually read in, and its level.
          items={chosen.map((w) => ({
            word: w.word,
            language,
            cefrLevel: w.level === 'NR' ? undefined : w.level,
            exampleSentence: w.sentence,
          }))}
          sourceLanguage={language}
          defaultDeckName={`${documentTitle} — ${page}`}
        />
      )}
    </>
  );
}
