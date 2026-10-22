import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  ExternalLink,
  Globe,
  History,
  Languages,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Share2,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineError } from '@/components/common/InlineError';
import { cn } from '@/lib/utils';
import { useReviewStore } from '../stores/reviewStore';
import type { CardFull } from '../types';
import {
  CARDS_PAGE_SIZE,
  addCard,
  cardTags,
  deckProgress,
  deleteCard,
  listCards,
  updateCard,
  type CardDraft,
  type DeckProgress,
  type TagCount,
} from '../lib/deckLocal';
import { extractYouTubeId } from '../lib/deckLogic';
import { DeckVideoCard } from '@/pages/videos/components/DeckVideo';
import { languageLabel } from '../lib/deckLanguages';
import { listPublicDecks } from '../lib/deckCloud';
import type { PublicDeckSummary } from '../lib/deckLogic';
import { useErrorText } from '../lib/useErrorText';
import { AlgorithmBadge } from './AlgorithmBadge';
import { CardEditorDialog } from './CardEditorDialog';
import { DeckStudyPanel } from './DeckStudyPanel';
import { DeleteDeckDialog } from './DeleteDeckDialog';
import { RichCard } from './RichCard';
import { ReviewHistoryDialog } from './ReviewHistoryDialog';
import { SharePublishDialog } from './SharePublishDialog';
import { ExportHub } from './deck-hub/ExportHub';
import { Chip } from './parts/Chip';
import { PageBack } from './parts/PageBack';
import { Pagination } from './parts/Pagination';

export function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { decks, fetchDecks } = useReviewStore();
  const deck = decks.find((d) => d.id === deckId);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<CardFull[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [progress, setProgress] = useState<DeckProgress | null>(null);
  const [loadingCards, setLoadingCards] = useState(true);
  const [related, setRelated] = useState<PublicDeckSummary[]>([]);

  const [editing, setEditing] = useState<{ card: CardFull | null } | null>(null);
  const [cardToDelete, setCardToDelete] = useState<CardFull | null>(null);
  const [deletingCard, setDeletingCard] = useState(false);
  const [deleteDeckOpen, setDeleteDeckOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [banner, setBanner] = useState<'created' | 'cardCreated' | 'cardUpdated' | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!deck && deckId) void fetchDecks();
  }, [deck, deckId, fetchDecks]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (params.get('created') === '1') {
      setBanner('created');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    if (!banner || banner === 'created') return;
    const id = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(id);
  }, [banner]);

  const refreshSide = useCallback(async () => {
    if (!deckId) return;
    try {
      const [tg, pr] = await Promise.all([cardTags(deckId), deckProgress(deckId)]);
      setTags(tg);
      setProgress(pr);
      // A tag filter whose last card is gone would show an empty list forever.
      setTag((cur) => (cur && !tg.some((x) => x.tag === cur) ? null : cur));
    } catch {
      // The side panel is a courtesy; the cards are what matter.
    }
  }, [deckId]);

  const refreshCards = useCallback(async () => {
    if (!deckId) return;
    try {
      const res = await listCards(deckId, { page, search: debounced, tag });
      setCards(res.cards);
      setTotal(res.total);
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setLoadingCards(false);
    }
  }, [deckId, page, debounced, tag, errorText]);

  useEffect(() => {
    void refreshCards();
  }, [refreshCards]);
  useEffect(() => {
    void refreshSide();
  }, [refreshSide]);

  const isFromCloud = !!(deck?.originalDeckId || deck?.cloudDeckId);
  useEffect(() => {
    if (!isFromCloud) return;
    const own = deck?.originalDeckId ?? deck?.cloudDeckId;
    listPublicDecks({ sort: 'popular' })
      .then((all) => setRelated(all.filter((d) => d.id !== own && d.card_count >= 5).slice(0, 6)))
      .catch(() => setRelated([]));
  }, [isFromCloud, deck?.originalDeckId, deck?.cloudDeckId]);

  const afterCardChange = async () => {
    await Promise.all([refreshCards(), refreshSide(), fetchDecks()]);
  };

  const saveCard = async (draft: CardDraft) => {
    if (!deck) return;
    try {
      if (editing?.card) {
        await updateCard(editing.card.id, draft);
        setBanner('cardUpdated');
      } else {
        await addCard(deck.id, deck.language, draft);
        setBanner('cardCreated');
      }
    } catch (e) {
      throw new Error(errorText(e), { cause: e });
    }
    setEditing(null);
    await afterCardChange();
  };

  const confirmDeleteCard = async () => {
    if (!cardToDelete) return;
    setDeletingCard(true);
    try {
      await deleteCard(cardToDelete.id);
      setCardToDelete(null);
      await afterCardChange();
    } catch (e) {
      setActionError(errorText(e));
      setCardToDelete(null);
    } finally {
      setDeletingCard(false);
    }
  };

  if (!deckId) return null;
  if (!deck) {
    return (
      <div className="space-y-4">
        <PageBack to="/review" label={t('backToDecks')} />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </p>
      </div>
    );
  }

  const youtubeId = extractYouTubeId(deck.sourceUrl);
  const totalPages = Math.max(1, Math.ceil(total / CARDS_PAGE_SIZE));
  const pendingPublish = deck.isPublic && !deck.cloudDeckId;

  return (
    <div className="space-y-5">
      <PageBack to="/review" label={t('backToDecks')} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{deck.name}</h1>
          {deck.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{deck.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" />
            {t('share.button')}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/review/deck/${deck.id}/edit`}>
              <Pencil className="h-4 w-4" />
              {t('edit')}
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" />
            {t('history.title')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDeleteDeckOpen(true)}
            aria-label={t('delete.title')}
            title={t('delete.title')}
          >
            <Trash2 className="h-4 w-4 text-error" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 empty:hidden">
        {banner && (
          <Banner icon={<CheckCircle className="h-4 w-4" />} onDismiss={() => setBanner(null)}>
            {banner === 'created'
              ? t('banner.deckCreated')
              : banner === 'cardCreated'
                ? t('banner.cardCreated')
                : t('banner.cardUpdated')}
          </Banner>
        )}
        {actionError && (
          <InlineError message={actionError} onDismiss={() => setActionError(null)} />
        )}
        {pendingPublish && (
          <Banner tone="accent" icon={<Globe className="h-4 w-4" />}>
            <span className="flex-1">{t('banner.notOnExplore')}</span>
            <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
              {t('banner.publishNow')}
            </Button>
          </Banner>
        )}
        {deck.cardCount >= 5 && !deck.isPublic && !nudgeDismissed && (
          <Banner
            tone="accent"
            icon={<Users className="h-4 w-4" />}
            onDismiss={() => setNudgeDismissed(true)}
          >
            <span className="flex-1">{t('banner.shareNudge', { count: deck.cardCount })}</span>
            <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
              {t('banner.shareNow')}
            </Button>
          </Banner>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* The deck's own video, or its cover */}
          {youtubeId ? (
            <DeckVideoCard youtubeId={youtubeId} />
          ) : (
            deck.coverUrl && (
              <img
                src={deck.coverUrl}
                alt=""
                className="aspect-video w-full max-w-xl rounded-xl border border-border object-cover"
              />
            )
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('hero.deckInfo')}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="primary">
                <span className="font-bold tabular-nums">{deck.cardCount}</span> {t('cards')}
              </Chip>
              {deck.isPublic ? (
                <Chip tone="success" icon={<Globe className="h-3 w-3" />}>
                  {t('public')}
                </Chip>
              ) : (
                <Chip icon={<Lock className="h-3 w-3" />}>{t('private')}</Chip>
              )}
              {deck.totalClones > 0 && (
                <Chip tone="primary">
                  <span className="font-bold tabular-nums">{deck.totalClones}</span>{' '}
                  {t('hero.clones')}
                </Chip>
              )}
              <Chip tone="accent" icon={<Languages className="h-3 w-3" />}>
                <bdi>{languageLabel(deck.language)}</bdi>
                {deck.nativeLanguage && (
                  <>
                    {' '}
                    → <bdi>{languageLabel(deck.nativeLanguage)}</bdi>
                  </>
                )}
              </Chip>
              <AlgorithmBadge algorithm={deck.algorithm} />
              {deck.sourceUrl && !youtubeId && (
                <button
                  onClick={() => void openUrl(deck.sourceUrl!)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('hero.viewSource')}
                </button>
              )}
            </div>
            {deck.tags.length > 0 && (
              <div className="mt-4 border-t border-dashed border-border pt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-light">
                  <Tag className="h-3 w-3" />
                  {t('hero.tags')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {deck.tags.map((x) => (
                    <span
                      key={x}
                      className="rounded-md bg-primary-light/10 px-2 py-0.5 text-[11.5px] font-semibold text-primary-light"
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:hidden">
            <DeckStudyPanel deckId={deck.id} progress={progress} />
          </div>

          {/* Cards */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold">{t('cardsHeading')}</h2>
                <p className="text-xs font-semibold text-primary-light">{total}</p>
              </div>
              <Button size="sm" onClick={() => setEditing({ card: null })}>
                <Plus className="h-4 w-4" />
                {t('card.add')}
              </Button>
            </div>
            <div className="space-y-4 p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('card.searchPlaceholder')}
                  aria-label={t('card.searchPlaceholder')}
                  className="h-10 w-full rounded-xl border border-border bg-card ps-9 pe-9 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    aria-label={t('clear')}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {tags.length > 0 && (
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label={t('card.filterByTag')}
                >
                  <button
                    onClick={() => {
                      setTag(null);
                      setPage(1);
                    }}
                    aria-pressed={tag === null}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      tag === null
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {t('card.allTags')}
                  </button>
                  {tags.map((x) => (
                    <button
                      key={x.tag}
                      onClick={() => {
                        setTag(x.tag);
                        setPage(1);
                      }}
                      aria-pressed={tag === x.tag}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold',
                        tag === x.tag
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      <Tag className="h-3 w-3" />
                      {x.tag}
                      <span className="tabular-nums opacity-70">{x.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {loadingCards ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('loading')}
                </div>
              ) : cards.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                  <BookOpen className="mb-3 h-8 w-8 text-muted-foreground/60" />
                  <h3 className="mb-1.5 text-base font-bold">
                    {search || tag ? t('noResults') : t('card.none')}
                  </h3>
                  {!search && !tag && (
                    <>
                      <p className="mb-4 max-w-xs text-sm text-muted-foreground">
                        {t('card.noneHint')}
                      </p>
                      <Button size="sm" onClick={() => setEditing({ card: null })}>
                        <Plus className="h-4 w-4" />
                        {t('card.add')}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cards.map((c, i) => (
                      <RichCard
                        key={c.id}
                        card={c}
                        number={(page - 1) * CARDS_PAGE_SIZE + i + 1}
                        sourceLang={deck.language}
                        isOwner
                        onEdit={() => setEditing({ card: c })}
                        onDelete={() => setCardToDelete(c)}
                      />
                    ))}
                  </div>
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </>
              )}
            </div>
          </section>

          {/* Export & sync */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <button
              onClick={() => setExportOpen((v) => !v)}
              className="text-sm font-semibold"
              aria-expanded={exportOpen}
            >
              {t('exportSync')}
            </button>
            {exportOpen && (
              <div className="mt-3">
                <ExportHub deckId={deck.id} />
              </div>
            )}
          </div>

          {related.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold">{t('related.title')}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {related.map((d) => (
                  <Link
                    key={d.id}
                    to={`/explore/${d.id}`}
                    className="flex flex-col overflow-hidden rounded-xl border border-border bg-card hover:shadow-md"
                  >
                    {d.cover_url ? (
                      <img src={d.cover_url} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-muted text-lg font-black uppercase text-primary-light">
                        {(d.language_pair ?? 'en').split('-')[0]}
                      </div>
                    )}
                    <div className="p-2.5">
                      <p dir="auto" className="line-clamp-2 text-xs font-bold">
                        {d.title}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t('cardsCount', { count: d.card_count })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <DeckStudyPanel deckId={deck.id} progress={progress} />
        </aside>
      </div>

      <CardEditorDialog
        open={!!editing}
        card={editing?.card ?? null}
        onSave={saveCard}
        onClose={() => setEditing(null)}
      />

      <Dialog
        open={!!cardToDelete}
        onOpenChange={(o) => !o && !deletingCard && setCardToDelete(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-error" />
              {t('card.deleteTitle')}
            </DialogTitle>
            <DialogDescription>{t('card.deleteDescription')}</DialogDescription>
          </DialogHeader>
          {cardToDelete && (
            <p className="truncate rounded-md bg-muted px-3 py-2 text-sm font-medium" dir="auto">
              {cardToDelete.front}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCardToDelete(null)} disabled={deletingCard}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCard} disabled={deletingCard}>
              {deletingCard && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('delete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDeckDialog
        deck={deleteDeckOpen ? { id: deck.id, name: deck.name } : null}
        onClose={() => setDeleteDeckOpen(false)}
        onDeleted={() => navigate('/review')}
      />
      <ReviewHistoryDialog
        deckId={deck.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
      <SharePublishDialog deck={deck} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function Banner({
  icon,
  children,
  onDismiss,
  tone = 'success',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
  tone?: 'success' | 'accent';
}) {
  const { t } = useTranslation('decks');
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold',
        tone === 'success'
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-accent/30 bg-accent/10 text-accent',
      )}
    >
      {icon}
      {children}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={t('dismiss')}
          className="opacity-60 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
