import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { NlpAnalysis } from '../../types';
import { cn } from '@/lib/utils';

const CEFR_ORDER = ['C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const;
type CefrLevel = (typeof CEFR_ORDER)[number];
type Bucket = CefrLevel | 'NR';
const DISPLAY_ORDER: Bucket[] = ['C2', 'C1', 'B2', 'B1', 'A2', 'A1', 'NR'];
// B2 is where the useful "new but learnable" words sit for most learners.
const DEFAULT_PREFERENCE: Bucket[] = ['B2', 'B1', 'C1', 'A2', 'C2', 'A1', 'NR'];

const CEFR_STYLE: Record<CefrLevel, { chip: string; badge: string }> = {
  C2: {
    chip: 'bg-cefr-c2/25 text-cefr-c2 border-cefr-c2 hover:bg-cefr-c2/35',
    badge: 'bg-cefr-c2 text-white',
  },
  C1: {
    chip: 'bg-cefr-c1/25 text-cefr-c1 border-cefr-c1 hover:bg-cefr-c1/35',
    badge: 'bg-cefr-c1 text-white',
  },
  B2: {
    chip: 'bg-cefr-b2/25 text-cefr-b2 border-cefr-b2 hover:bg-cefr-b2/35',
    badge: 'bg-cefr-b2 text-white',
  },
  B1: {
    chip: 'bg-cefr-b1/25 text-cefr-b1 border-cefr-b1 hover:bg-cefr-b1/35',
    badge: 'bg-cefr-b1 text-white',
  },
  A2: {
    chip: 'bg-cefr-a2/25 text-cefr-a2 border-cefr-a2 hover:bg-cefr-a2/35',
    badge: 'bg-cefr-a2 text-white',
  },
  A1: {
    chip: 'bg-cefr-a1/25 text-cefr-a1 border-cefr-a1 hover:bg-cefr-a1/35',
    badge: 'bg-cefr-a1 text-white',
  },
};
const NR_STYLE = {
  chip: 'bg-muted text-muted-foreground border-input hover:bg-muted/70',
  badge: 'bg-input text-foreground',
};
const styleFor = (b: Bucket) => (b === 'NR' ? NR_STYLE : CEFR_STYLE[b]);

/**
 * The episode's words, by level, to pick and save to a deck — the one study panel the now-playing
 * player keeps (website: `VocabDialog` + `SidebarVocab`). A dialog over the player, so it never
 * takes the lines' place.
 */
export function VocabDialog({
  open,
  onOpenChange,
  analysis,
  onAddToDeck,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: NlpAnalysis | null;
  onAddToDeck: (words: string[]) => void;
}) {
  const { t } = useTranslation('podcastUi');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,720px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle>{t('np.vocabLabel')}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <VocabPanel analysis={analysis} onAddToDeck={onAddToDeck} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseTopWords(raw: string | undefined): { word: string; cefr: string }[] {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function VocabPanel({
  analysis,
  onAddToDeck,
}: {
  analysis: NlpAnalysis | null;
  onAddToDeck: (words: string[]) => void;
}) {
  const { t } = useTranslation('podcastUi');

  const wordsByLevel = useMemo(() => {
    const buckets: Record<Bucket, string[]> = {
      C2: [],
      C1: [],
      B2: [],
      B1: [],
      A2: [],
      A1: [],
      NR: [],
    };
    const top = parseTopWords(analysis?.topWords);
    for (const w of top) {
      const level = (w.cefr ?? '').toUpperCase();
      const b: Bucket = (CEFR_ORDER as readonly string[]).includes(level)
        ? (level as CefrLevel)
        : 'NR';
      const word = (w.word ?? '').trim();
      if (word && !buckets[b].includes(word)) buckets[b].push(word);
    }
    return buckets;
  }, [analysis]);

  const [activeFilters, setActiveFilters] = useState<Set<Bucket> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const availableLevels = DISPLAY_ORDER.filter((l) => wordsByLevel[l].length > 0);
  const defaultLevel = DEFAULT_PREFERENCE.find((l) => availableLevels.includes(l));
  const picked = availableLevels.filter((l) => activeFilters?.has(l));
  const effective: Bucket[] = picked.length > 0 ? picked : defaultLevel ? [defaultLevel] : [];
  const groups = effective
    .map((level) => ({ level, words: wordsByLevel[level] }))
    .filter((g) => g.words.length > 0);
  const visibleWords = [...new Set(groups.flatMap((g) => g.words))];
  // Only words on screen go to the deck: hiding a level never sends words the user cannot see.
  const selectedWords = visibleWords.filter((w) => selected.has(w));

  const toggleFilter = (level: Bucket) => {
    const next = new Set(effective);
    if (next.has(level)) {
      if (next.size === 1) return; // keep one level on screen
      next.delete(level);
    } else next.add(level);
    setActiveFilters(next);
  };
  const toggleWord = (word: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  const selectAllVisible = () => setSelected((prev) => new Set([...prev, ...visibleWords]));

  if (!analysis) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Target className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold text-foreground">{t('np.vocabNoData')}</p>
        <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
          {t('np.vocabNoDataDesc')}
        </p>
      </div>
    );
  }
  if (availableLevels.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-caption">
          <Inbox className="h-6 w-6" strokeWidth={1.75} />
        </div>
        <p className="text-sm text-muted-foreground">{t('np.vocabNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 pb-2.5 pt-3">
        {availableLevels.map((level) => {
          const on = effective.includes(level);
          return (
            <button
              key={level}
              type="button"
              aria-pressed={on}
              onClick={() => toggleFilter(level)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors',
                on
                  ? styleFor(level).chip
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span>{level === 'NR' ? t('np.vocabUnrated') : level}</span>
              <span
                className={cn(
                  'inline-flex h-[16px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none tabular-nums',
                  on ? styleFor(level).badge : 'bg-muted text-muted-foreground',
                )}
              >
                {wordsByLevel[level].length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] tabular-nums">
          {selectedWords.length > 0 ? (
            <span className="font-bold text-accent">
              {t('np.selectedCount', { count: selectedWords.length })}
            </span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{visibleWords.length}</span>{' '}
              {t('np.words')}
            </span>
          )}
        </span>
        {selectedWords.length > 0 ? (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('np.clearSelection')}
          </button>
        ) : (
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-[11px] font-medium text-accent transition-colors hover:underline"
          >
            {t('np.selectAllWords')}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto px-3 py-3">
        {groups.map(({ level, words }) => {
          const all = words.every((w) => selected.has(w));
          const some = words.some((w) => selected.has(w));
          return (
            <div key={level}>
              <div className="mb-2 flex items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold leading-none',
                    styleFor(level).badge,
                  )}
                >
                  {level === 'NR' ? t('np.vocabUnrated') : level}
                </span>
                <span className="text-[10px] tabular-nums text-caption">
                  {words.length} {t('np.words')}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      words.forEach((w) => (all ? next.delete(w) : next.add(w)));
                      return next;
                    })
                  }
                  className={cn(
                    'ms-auto text-[10px] font-medium transition-colors hover:underline',
                    some ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {all ? t('np.deselectAll') : t('np.selectAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {words.map((word) => {
                  const on = selected.has(word);
                  return (
                    <button
                      key={word}
                      type="button"
                      onClick={() => toggleWord(word)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        on
                          ? cn(styleFor(level).badge, 'border-transparent')
                          : 'border-border bg-card text-foreground hover:border-accent/40 hover:bg-muted',
                      )}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center border-t border-border bg-muted px-3 py-3">
        {selectedWords.length === 0 ? (
          <button
            type="button"
            onClick={selectAllVisible}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-input bg-card px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
          >
            {t('np.tapToSelect', { count: visibleWords.length })}
          </button>
        ) : (
          <Button type="button" variant="accent" onClick={() => onAddToDeck(selectedWords)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {t('np.addWordsToDecks', { count: selectedWords.length })}
          </Button>
        )}
      </div>
    </div>
  );
}
