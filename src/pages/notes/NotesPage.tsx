import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, NotebookPen } from 'lucide-react';
import { saveTextFile } from '@/lib/exportFile';
import { InlineError } from '@/components/common/InlineError';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DeleteNotesDialog } from './DeleteNotesDialog';
import { groupTitle } from './groupTitle';
import { NoteGroupCard } from './NoteGroupCard';
import type { NotePatch } from './NoteItem';
import { NotesSelectionBar } from './NotesSelectionBar';
import { NotesToolbar, type ExportFormat } from './NotesToolbar';
import {
  deleteAccountNotes,
  deleteLocalNotes,
  errorCode,
  openInBrowser,
  openPrintable,
  prepareOpen,
  toggleAccountFavorite,
  updateAccountNote,
  updateLocalNote,
} from './notesApi';
import {
  allTags,
  buildVideoUrl,
  filterNotes,
  groupNotes,
  isOpenableUrl,
  notesToCsv,
  notesToJson,
  notesToMarkdown,
  notesToPrintHtml,
  planDelete,
  sortGroups,
  withTag,
  type ExportLabels,
  type NoteGroup,
  type OriginFilter,
  type SortOption,
  type UnifiedNote,
} from './notesLogic';
import { useNotes } from './useNotes';
import { withSeekParam } from '@/pages/podcast/utils/transport';

export default function NotesPage() {
  const { t, i18n } = useTranslation('notes');
  const navigate = useNavigate();
  const { notes, loading, signedIn, deviceError, accountError, reload } = useNotes();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [tags, setTags] = useState<string[]>([]);
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageError, setPageError] = useState<string | null>(null);

  const [deleteKeys, setDeleteKeys] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const msg = useCallback(
    (code: string) => t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR') }),
    [t],
  );
  const byKey = useMemo(() => new Map(notes.map((n) => [n.key, n])), [notes]);

  const tagOptions = useMemo(() => allTags(notes), [notes]);
  const hasFavorites = useMemo(() => notes.some((n) => n.favorite), [notes]);
  const filtered = useMemo(
    () => filterNotes(notes, { query, tags, origin, favoritesOnly }),
    [notes, query, tags, origin, favoritesOnly],
  );
  const groups = useMemo(
    () => sortGroups(groupNotes(filtered), sort, (g) => groupTitle(g, t)),
    [filtered, sort, t],
  );
  const totalGroups = useMemo(() => new Set(notes.map((n) => n.groupKey)).size, [notes]);
  const isFiltering = !!query.trim() || tags.length > 0 || origin !== 'all' || favoritesOnly;

  /** After any change: reread both places (selections that no longer exist drop out of `liveSelected`). */
  const refresh = reload;
  const liveSelected = useMemo(() => [...selected].filter((k) => byKey.has(k)), [selected, byKey]);

  const select = useCallback((key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const selectMany = useCallback((keys: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }, []);

  // ── Edit, tag, favourite ──
  const save = useCallback(
    async (note: UnifiedNote, patch: NotePatch) => {
      if (note.origin === 'device') await updateLocalNote(note, patch);
      else await updateAccountNote(note.id, patch);
      await refresh();
    },
    [refresh],
  );

  const toggleFavorite = useCallback(
    async (note: UnifiedNote) => {
      await toggleAccountFavorite(note);
      await refresh();
    },
    [refresh],
  );

  /** One note at a time, each to its own place; fails with the first error after trying all. */
  const addTagToSelection = useCallback(
    async (tag: string) => {
      const jobs = liveSelected
        .map((k) => byKey.get(k))
        .filter((n): n is UnifiedNote => !!n)
        .map((n) => ({ n, next: withTag(n.tags, tag) }))
        .filter((j): j is { n: UnifiedNote; next: string[] } => j.next !== null);
      const results = await Promise.allSettled(
        jobs.map(({ n, next }) =>
          n.origin === 'device'
            ? updateLocalNote(n, { tags: next })
            : updateAccountNote(n.id, { tags: next }),
        ),
      );
      await refresh();
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
    },
    [liveSelected, byKey, refresh],
  );

  // ── Delete: the plan names each note's own place ──
  const deleteNotes = useMemo(
    () => (deleteKeys ?? []).map((k) => byKey.get(k)).filter((n): n is UnifiedNote => !!n),
    [deleteKeys, byKey],
  );
  const plan = useMemo(() => planDelete(deleteNotes), [deleteNotes]);

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const jobs: Promise<unknown>[] = [];
    if (plan.device.length > 0) jobs.push(deleteLocalNotes(plan.device));
    if (plan.account.length > 0) jobs.push(deleteAccountNotes(plan.account));
    const results = await Promise.allSettled(jobs);
    await refresh();
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) {
      // What went is gone from the list; what is left stays here, with the reason.
      setDeleteError(msg(errorCode(failed.reason)));
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of deleteKeys ?? []) next.delete(k);
        return next;
      });
      setDeleteKeys(null);
    }
    setDeleting(false);
  };

  // ── Open the source ──
  const open = useCallback(
    async (note: UnifiedNote, mode: 'note' | 'source') => {
      setPageError(null);
      try {
        if (note.origin === 'account') {
          const url = buildVideoUrl(
            note.videoUrl ?? '',
            note.sourceId,
            mode === 'note' ? (note.seconds ?? undefined) : undefined,
          );
          if (!isOpenableUrl(url)) throw new Error('NOTE_SOURCE_GONE');
          await openInBrowser(url);
        } else {
          const route = await prepareOpen(note, mode);
          navigate(mode === 'note' ? withSeekParam(route, note.seconds) : route);
        }
      } catch (err) {
        setPageError(msg(errorCode(err)));
      }
    },
    [navigate, msg],
  );
  const onOpen = useCallback((n: UnifiedNote) => void open(n, 'note'), [open]);
  const onOpenSource = useCallback((g: NoteGroup) => void open(g.notes[0], 'source'), [open]);

  // ── Export what is on screen (the filtered notes) ──
  const exportLabels = (): ExportLabels => ({
    title: t('export.title'),
    exported: t('export.exported'),
    tags: t('export.tags'),
    pageLabel: (n) => t('pageNumber', { n }),
    headers: {
      source: t('export.source'),
      where: t('export.where'),
      position: t('export.position'),
      text: t('export.text'),
      translation: t('export.translation'),
      note: t('export.note'),
      tags: t('export.tags'),
      date: t('export.date'),
    },
    whereDevice: t('where.device'),
    whereAccount: t('where.account'),
  });

  const onExport = async (format: ExportFormat) => {
    setPageError(null);
    const titleOf = (g: NoteGroup) => groupTitle(g, t);
    const labels = exportLabels();
    const date = new Date().toLocaleDateString(i18n.language);
    try {
      if (format === 'markdown')
        await saveTextFile(
          'flexilingo-notes.md',
          'md',
          notesToMarkdown(groups, titleOf, labels, date),
        );
      else if (format === 'csv')
        await saveTextFile('flexilingo-notes.csv', 'csv', notesToCsv(groups, titleOf, labels));
      else if (format === 'json')
        await saveTextFile('flexilingo-notes.json', 'json', notesToJson(groups, titleOf));
      else
        await openPrintable(
          notesToPrintHtml(groups, titleOf, labels, date, i18n.dir() === 'rtl' ? 'rtl' : 'ltr'),
        );
    } catch (err) {
      setPageError(msg(errorCode(err)));
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

  const filteredCount = filtered.length;
  const sourceFailed = deviceError || accountError;

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
        icon={NotebookPen}
        title={t('title')}
        className="mb-0"
        subtitle={
          notes.length === 0
            ? t('subtitle')
            : t('subtitleCount', { notes: notes.length, sources: totalGroups })
        }
      />

      {deviceError && <InlineError message={`${t('where.device')}: ${msg(deviceError)}`} />}
      {accountError && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError message={`${t('where.account')}: ${msg(accountError)}`} className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {pageError && <InlineError message={pageError} onDismiss={() => setPageError(null)} />}

      {notes.length > 0 || !sourceFailed ? (
        <NotesToolbar
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          origin={origin}
          onOrigin={setOrigin}
          showOrigin={
            signedIn &&
            notes.some((n) => n.origin === 'account') &&
            notes.some((n) => n.origin === 'device')
          }
          favoritesOnly={favoritesOnly}
          onFavoritesOnly={setFavoritesOnly}
          hasFavorites={hasFavorites}
          tags={tagOptions}
          selectedTags={tags}
          onToggleTag={(tag) =>
            setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
          }
          onClearTags={() => setTags([])}
          canExport={groups.length > 0}
          onExport={onExport}
        />
      ) : null}

      {isFiltering && groups.length > 0 && (
        <p className="-mt-1 text-[11.5px] tabular-nums text-muted-foreground">
          {t('resultCount', { notes: filteredCount, sources: groups.length })}
        </p>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed border-border bg-card">
          <EmptyState
            icon={sourceFailed && notes.length === 0 ? AlertCircle : NotebookPen}
            title={isFiltering ? t('noNotesSearch') : t('noNotes')}
            body={
              isFiltering
                ? t('tryDifferentSearch')
                : signedIn
                  ? t('startWriting')
                  : t('startWritingSignedOut')
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <NoteGroupCard
              key={g.key}
              group={g}
              selected={selected}
              onSelect={select}
              onSelectMany={selectMany}
              onDelete={(key) => {
                setDeleteError(null);
                setDeleteKeys([key]);
              }}
              onOpen={onOpen}
              onOpenSource={onOpenSource}
              onSave={save}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}

      <DeleteNotesDialog
        open={deleteKeys !== null}
        device={plan.device.length}
        account={plan.account.length}
        deleting={deleting}
        error={deleteError}
        onClose={() => setDeleteKeys(null)}
        onConfirm={confirmDelete}
      />

      <NotesSelectionBar
        count={liveSelected.length}
        onDeselectAll={() => setSelected(new Set())}
        onDelete={() => {
          setDeleteError(null);
          setDeleteKeys(liveSelected);
        }}
        onAddTag={addTagToSelection}
      />
    </div>
  );
}
