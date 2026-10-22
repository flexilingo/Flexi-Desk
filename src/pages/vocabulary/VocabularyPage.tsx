import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { AddToDeckSheet, type AddToDeckItem } from '@/components/common/AddToDeckSheet';
import { InlineError } from '@/components/common/InlineError';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { saveTextFile } from '@/lib/exportFile';
import { cn } from '@/lib/utils';
import { errorCode } from '@/pages/notes/notesApi';
import { DeleteWordsDialog } from './DeleteWordsDialog';
import { VocabFilters } from './VocabFilters';
import { VocabRecommendations } from './VocabRecommendations';
import { VocabSelectionBar } from './VocabSelectionBar';
import { VocabStatsCards } from './VocabStatsCards';
import { VocabWordCard } from './VocabWordCard';
import { WordEditDialog } from './WordEditDialog';
import {
  filterWords,
  pageWindow,
  paginate,
  recommendWords,
  sortWords,
  splitByStore,
  wordsToCsv,
  wordsToJson,
  wordStats,
  type CefrBand,
  type VocabItem,
  type VocabSort,
  type VocabStatus,
} from './vocabLogic';
import { useVocabulary } from './useVocabulary';

export default function VocabularyPage() {
  const { t } = useTranslation('vocabulary');
  const navigate = useNavigate();
  const { targetLang } = useLanguageSettings();
  const { items, loading, signedIn, localError, accountError, reload } = useVocabulary();

  const [status, setStatus] = useState<'all' | VocabStatus>('all');
  const [cefr, setCefr] = useState<CefrBand>('all');
  const [sort, setSort] = useState<VocabSort>('recent');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deckWords, setDeckWords] = useState<VocabItem[] | null>(null);
  const [editWord, setEditWord] = useState<VocabItem | null>(null);
  const [deleteWords, setDeleteWords] = useState<VocabItem[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const msg = useCallback(
    (code: string) => t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR') }),
    [t],
  );

  const stats = useMemo(() => wordStats(items), [items]);
  const recommendations = useMemo(() => recommendWords(items), [items]);
  const filtered = useMemo(
    () => sortWords(filterWords(items, { status, cefr, search }), sort),
    [items, status, cefr, search, sort],
  );
  const view = useMemo(() => paginate(filtered, page), [filtered, page]);

  // A change of filter or page starts a fresh selection (the website does the same).
  useEffect(() => {
    setSelected(new Set());
  }, [status, cefr, sort, search, view.page]);

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const pageWords = view.items;
  const selectedWords = useMemo(() => items.filter((i) => selected.has(i.key)), [items, selected]);
  const isAllSelected = pageWords.length > 0 && pageWords.every((w) => selected.has(w.key));
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const deckItems = (words: VocabItem[]): AddToDeckItem[] =>
    words.map((w) => ({
      word: w.word,
      language: w.language ?? targetLang,
      translation: w.translation ?? undefined,
      definition: w.local?.definition ?? undefined,
      pos: w.local?.pos ?? undefined,
      cefrLevel: w.cefr === 'unknown' ? undefined : w.cefr,
      exampleSentence: w.contexts[0],
    }));

  const exportList = async (format: 'csv' | 'json') => {
    setExporting(format);
    setPageError(null);
    try {
      if (format === 'csv')
        await saveTextFile('flexilingo-vocabulary.csv', 'csv', wordsToCsv(filtered));
      else await saveTextFile('flexilingo-vocabulary.json', 'json', wordsToJson(filtered));
      setExportOpen(false);
    } catch (err) {
      setPageError(msg(errorCode(err)));
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div
        className="flex min-h-[60vh] items-center justify-center text-muted-foreground"
        role="status"
        aria-label={t('loading')}
      >
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const sourceFailed = !!localError || !!accountError;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6 pb-28">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        {t('back')}
      </button>

      <PageHeader
        icon={BookOpen}
        title={t('title')}
        className="mb-0"
        subtitle={
          items.length > 0
            ? t('subtitleStats', {
                total: stats.total.toLocaleString(),
                mastered: stats.mastered.toLocaleString(),
              })
            : t('subtitle')
        }
        action={
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={filtered.length === 0}>
                <Download />
                {t('exportButton')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              {(['csv', 'json'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={exporting !== null}
                  onClick={() => void exportList(f)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {exporting === f ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  {f === 'csv' ? t('exportCsv') : t('exportJson')}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {signedIn ? t('intro') : t('introSignedOut')}
        </p>
      </div>

      {localError && <InlineError message={`${t('where.device')}: ${msg(localError)}`} />}
      {accountError && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError message={`${t('where.account')}: ${msg(accountError)}`} className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {pageError && <InlineError message={pageError} onDismiss={() => setPageError(null)} />}

      {items.length > 0 && <VocabStatsCards stats={stats} />}
      <VocabRecommendations items={recommendations} />

      <VocabFilters
        status={status}
        onStatus={change(setStatus)}
        cefr={cefr}
        onCefr={change(setCefr)}
        sort={sort}
        onSort={change(setSort)}
        search={search}
        onSearch={change(setSearch)}
      />

      {view.total > 0 && !search && (
        <p className="-mt-1 text-[12.5px] text-caption">
          {t('wordsTotal', { count: view.total.toLocaleString() })}
        </p>
      )}

      {pageWords.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
          {pageWords.map((w) => (
            <VocabWordCard
              key={w.key}
              word={w}
              selected={selected.has(w.key)}
              fallbackLanguage={targetLang}
              onToggleSelect={() => toggle(w.key)}
              onAddToDeck={() => setDeckWords([w])}
              onEdit={() => setEditWord(w)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-[1.5px] border-dashed border-border bg-card">
          <EmptyState
            icon={BookOpen}
            title={t('noWords')}
            body={
              items.length > 0
                ? t('noWordsFilter')
                : sourceFailed
                  ? t('noWordsError')
                  : t('noWordsDesc')
            }
          />
        </div>
      )}

      {view.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-1.5 pt-2" aria-label={t('pagination')}>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={view.page === 1}
            onClick={() => setPage(view.page - 1)}
            aria-label={t('prevPage')}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          {pageWindow(view.page, view.totalPages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-[13px] text-caption">
                &middot;&middot;&middot;
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={view.page === p ? 'page' : undefined}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg border-[1.5px] text-[12.5px] font-semibold transition-all',
                  view.page === p
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-accent',
                )}
              >
                {p}
              </button>
            ),
          )}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={view.page === view.totalPages}
            onClick={() => setPage(view.page + 1)}
            aria-label={t('nextPage')}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </nav>
      )}

      <VocabSelectionBar
        count={selectedWords.length}
        totalOnPage={pageWords.length}
        isAllSelected={isAllSelected}
        deletable={splitByStore(selectedWords).local.length}
        onAddToDeck={() => setDeckWords(selectedWords)}
        onDelete={() => setDeleteWords(selectedWords)}
        onSelectAll={() => setSelected(new Set(pageWords.map((w) => w.key)))}
        onClear={() => setSelected(new Set())}
      />

      <AddToDeckSheet
        open={deckWords !== null}
        onOpenChange={(o) => {
          if (!o) setDeckWords(null);
        }}
        items={deckItems(deckWords ?? [])}
        defaultLanguage={targetLang}
        onAdded={() => {
          setSelected(new Set());
          void reload();
        }}
      />
      <WordEditDialog word={editWord} onClose={() => setEditWord(null)} onSaved={reload} />
      <DeleteWordsDialog
        words={deleteWords}
        onClose={() => setDeleteWords(null)}
        onDeleted={async () => {
          setSelected(new Set());
          await reload();
        }}
      />
    </div>
  );
}
