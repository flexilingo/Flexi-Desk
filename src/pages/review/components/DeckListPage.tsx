import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Brain,
  Flame,
  Globe,
  Layers,
  Link2,
  Loader2,
  Lock,
  Merge,
  Pencil,
  Plus,
  Search,
  Share2,
  Star,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineError } from '@/components/common/InlineError';
import { cn } from '@/lib/utils';
import { useReviewStore } from '../stores/reviewStore';
import {
  deckStatus,
  filterAndSortDecks,
  masteryPercent,
  streakHint,
  type DeckSort,
  type DeckVisibilityFilter,
} from '../lib/deckLogic';
import { languageLabel } from '../lib/deckLanguages';
import { useStartDeckStudy } from '../lib/useStartDeckStudy';
import { AlgorithmBadge } from './AlgorithmBadge';
import { DeleteDeckDialog } from './DeleteDeckDialog';
import { MergeDeckDialog } from './MergeDeckDialog';
import { Chip } from './parts/Chip';

const STATUS_BAR: Record<string, string> = {
  review: 'bg-accent',
  good: 'bg-success',
  untouched: 'bg-muted',
};

export function DeckListPage() {
  const { t } = useTranslation('decks');
  const navigate = useNavigate();
  const { decks, isLoadingDecks, error, overview, fetchDecks, fetchOverview, clearError } =
    useReviewStore();
  const { start, starting, error: startError, clearError: clearStartError } = useStartDeckStudy();

  const [filter, setFilter] = useState<DeckVisibilityFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DeckSort>('recent');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    void fetchDecks();
    void fetchOverview();
  }, [fetchDecks, fetchOverview]);

  const shown = useMemo(
    () => filterAndSortDecks(decks, { filter, search, sort }),
    [decks, filter, search, sort],
  );
  const totalDue = useMemo(() => decks.reduce((n, d) => n + d.dueToday, 0), [decks]);
  const totalNew = useMemo(() => decks.reduce((n, d) => n + d.newCards, 0), [decks]);

  const reviewed = overview?.totalReviewed ?? 0;
  const mastered = overview?.totalMastered ?? 0;
  const pct = reviewed > 0 ? Math.min(100, Math.round((mastered / reviewed) * 100)) : 0;
  const streak = streakHint(overview?.currentStreak ?? 0, overview?.longestStreak ?? 0);

  const tabs: { id: DeckVisibilityFilter; label: string }[] = [
    { id: 'all', label: t('filter.all') },
    { id: 'public', label: t('public') },
    { id: 'private', label: t('private') },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          {(totalDue > 0 || totalNew > 0) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('today', { due: totalDue, new: totalNew })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/review/share-links">
              <Link2 className="h-4 w-4" />
              {t('shareLinks.nav')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/review/shared-reviews">
              <Share2 className="h-4 w-4" />
              {t('sharedReviews.nav')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/review/deck-hub')}>
            <Layers className="h-4 w-4" />
            {t('deckHub')}
          </Button>
          {decks.length >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
              <Merge className="h-4 w-4" />
              {t('merge.button')}
            </Button>
          )}
          <Button size="sm" asChild>
            <Link to="/review/create">
              <Plus className="h-4 w-4" />
              {t('createNewDeck')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<BookOpen className="h-4 w-4" />}
          value={reviewed.toLocaleString()}
          label={t('stats.reviewed')}
          hint={t('stats.masteredPct', { pct })}
        />
        <StatTile
          icon={<Star className="h-4 w-4" />}
          value={mastered.toLocaleString()}
          label={t('stats.mastered')}
          hint={t('stats.pctOfAll', { pct })}
          tone="success"
        />
        <StatTile
          icon={<Target className="h-4 w-4" />}
          value={`${(overview?.rollingAccuracy ?? 0).toFixed(1)}%`}
          label={t('stats.accuracy')}
          hint={t('stats.rolling')}
        />
        <StatTile
          icon={<Flame className="h-4 w-4" />}
          value={String(overview?.currentStreak ?? 0)}
          label={t('stats.streak')}
          tone="warning"
          hint={
            streak.kind === 'toBest'
              ? t('stats.daysToBest', { count: streak.days })
              : streak.kind === 'best'
                ? t('stats.personalBest')
                : t('stats.startStreak')
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-card p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                filter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchInDecks')}
            aria-label={t('searchInDecks')}
            className="h-9 w-full rounded-md border border-border bg-card ps-9 pe-8 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label={t('clear')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as DeckSort)}>
          <SelectTrigger className="w-44" aria-label={t('sort.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['recent', 'alpha', 'cards', 'due'] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {t(`sort.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <InlineError message={error} onDismiss={clearError} />}
      {startError && <InlineError message={startError} onDismiss={clearStartError} />}

      {isLoadingDecks && decks.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/60 px-8 py-14 text-center">
          <Brain className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
          <h3 className="mb-1 text-base font-bold">
            {search || decks.length > 0 ? t('noResults') : t('noDecksYet')}
          </h3>
          <p className="mx-auto mb-5 max-w-xs text-sm text-muted-foreground">
            {search || decks.length > 0 ? t('tryDifferentSearch') : t('createFirst')}
          </p>
          {!search && decks.length === 0 && (
            <Button asChild>
              <Link to="/review/create">
                <Plus className="h-4 w-4" />
                {t('createNewDeck')}
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {shown.map((deck) => {
            const status = deckStatus(deck);
            const mp = masteryPercent(deck);
            const key = `${deck.id}:due`;
            return (
              <div
                key={deck.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className={cn('h-[3px]', STATUS_BAR[status])} />
                <div className="absolute end-2 top-3 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Link
                    to={`/review/deck/${deck.id}/edit`}
                    title={t('edit')}
                    aria-label={t('edit')}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    title={t('delete.title')}
                    aria-label={t('delete.title')}
                    onClick={() => setToDelete({ id: deck.id, name: deck.name })}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Link
                  to={`/review/deck/${deck.id}`}
                  className="flex flex-1 flex-col gap-2 p-4 pb-3"
                >
                  <h3 className="truncate pe-14 text-sm font-semibold text-foreground">
                    {deck.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {deck.isPublic ? (
                      <Chip tone="success" icon={<Globe className="h-3 w-3" />}>
                        {t('public')}
                      </Chip>
                    ) : (
                      <Chip icon={<Lock className="h-3 w-3" />}>{t('private')}</Chip>
                    )}
                    <AlgorithmBadge algorithm={deck.algorithm} />
                    <span className="text-xs text-muted-foreground">
                      <bdi>{languageLabel(deck.language)}</bdi>
                      {deck.nativeLanguage ? (
                        <>
                          {' '}
                          → <bdi>{languageLabel(deck.nativeLanguage)}</bdi>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[10.5px] tabular-nums text-muted-foreground">
                      <span>{t('mastery')}</span>
                      <span>{mp}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-success transition-all"
                        style={{ width: `${mp}%` }}
                      />
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/50 px-4 py-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t('cardsCount', { count: deck.cardCount })}
                    {deck.dueToday > 0 && (
                      <span className="ms-1 text-accent">
                        · {t('dueCount', { count: deck.dueToday })}
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={starting !== null}
                    onClick={() => start(deck.id, 'due')}
                  >
                    {starting === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {deck.dueToday > 0 ? t('review') : t('studyButton')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DeleteDeckDialog
        deck={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={() => void fetchOverview()}
      />
      {decks.length >= 2 && (
        <MergeDeckDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          decks={decks}
          onMerged={() => void fetchDecks()}
        />
      )}
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  hint,
  tone = 'primary',
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint: string;
  tone?: 'primary' | 'success' | 'warning';
}) {
  const color = { primary: 'text-accent', success: 'text-success', warning: 'text-warning' }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted',
          color,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-extrabold leading-none tabular-nums text-foreground">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
        <p className={cn('mt-0.5 truncate text-[10px] font-medium', color)}>{hint}</p>
      </div>
    </div>
  );
}
