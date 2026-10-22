import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Languages,
  Loader2,
  Tag,
  Users,
  Youtube,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { WatchWithSubtitlesButton } from '@/pages/videos/components/DeckVideo';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { parseCloudError } from '@/lib/cloudError';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { useReviewStore } from '@/pages/review/stores/reviewStore';
import { getDeckPage, listPublicDecks, type CloudDeckPage } from '@/pages/review/lib/deckCloud';
import {
  copiesOf,
  deckMeaningLang,
  deckSourceLang,
  extractYouTubeId,
  publicDeckTitle,
  type PublicDeckSummary,
} from '@/pages/review/lib/deckLogic';
import { languageLabel } from '@/pages/review/lib/deckLanguages';
import { useErrorText } from '@/pages/review/lib/useErrorText';
import { RichCard } from '@/pages/review/components/RichCard';
import { Chip } from '@/pages/review/components/parts/Chip';
import { PageBack } from '@/pages/review/components/parts/PageBack';
import { Pagination } from '@/pages/review/components/parts/Pagination';
import { CloneDeckDialog } from './CloneDeckDialog';

const PAGE_SIZE = 10;

export function ExploreDeckPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { nativeLang } = useLanguageSettings();
  const { decks: library, fetchDecks } = useReviewStore();

  const [page, setPage] = useState(1);
  const [data, setData] = useState<CloudDeckPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [related, setRelated] = useState<PublicDeckSummary[]>([]);

  useEffect(() => {
    void fetchDecks();
  }, [fetchDecks]);

  useEffect(() => {
    if (!deckId) return;
    let live = true;
    setLoading(true);
    setError(null);
    getDeckPage(deckId, { page, pageSize: PAGE_SIZE })
      .then((r) => live && (setData(r), setNotFound(false)))
      .catch((e) => {
        if (!live) return;
        // A removed or private deck reads as "not found", not as a failure to retry.
        const status = parseCloudError(e).status;
        if (status === 404 || status === 403) setNotFound(true);
        else setError(errorText(e));
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [deckId, page, errorText]);

  useEffect(() => {
    listPublicDecks({ sort: 'popular' })
      .then((all) =>
        setRelated(all.filter((d) => d.id !== deckId && d.card_count >= 5).slice(0, 6)),
      )
      .catch(() => setRelated([]));
  }, [deckId]);

  const copies = useMemo(() => copiesOf(library, deckId), [library, deckId]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <PageBack to="/explore" label={t('explore.back')} />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </p>
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-accent" />
        <h2 className="text-base font-bold">{t('explore.notFound')}</h2>
        <p className="text-sm text-muted-foreground">{error ?? t('explore.notFoundDesc')}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/explore">{t('explore.back')}</Link>
        </Button>
      </div>
    );
  }

  const cardsLang = deckSourceLang(data.language_pair);
  const meaningLang = deckMeaningLang(data.language_pair);
  // Meanings are shown only to someone who reads them; everyone else picks a language on save.
  const showMeanings = !!meaningLang && nativeLang === meaningLang;
  const total = data.pagination?.total_count ?? data.card_count;
  const totalPages = data.pagination?.total_pages ?? 1;
  const clones = data.total_clones ?? 0;
  const youtubeId = data.source_public ? extractYouTubeId(data.source_url) : null;

  return (
    <div className="space-y-5">
      <PageBack to="/explore" label={t('explore.back')} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h1 className="text-xl font-bold" dir="auto">
              {publicDeckTitle(data.title)}
            </h1>
            {data.description && (
              <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                {data.description}
              </p>
            )}
          </div>

          {data.cover_url && (
            <img
              src={data.cover_url}
              alt=""
              className="aspect-video w-full max-w-xl rounded-xl border border-border object-cover"
            />
          )}
          {youtubeId && (
            <div className="flex flex-wrap items-center gap-2">
              <WatchWithSubtitlesButton youtubeId={youtubeId} />
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => void openUrl(`https://www.youtube.com/watch?v=${youtubeId}`)}
              >
                <Youtube className="h-4 w-4" />
                {t('hero.watchOnYoutube')}
              </Button>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="primary">
                <span className="font-bold tabular-nums">{total}</span> {t('cards')}
              </Chip>
              <Chip tone="success" icon={<Globe className="h-3 w-3" />}>
                {t('public')}
              </Chip>
              {clones > 0 && (
                <Chip tone="primary" icon={<Users className="h-3 w-3" />}>
                  <span className="font-bold tabular-nums">{clones}</span> {t('hero.clones')}
                </Chip>
              )}
              <Chip>{t('explore.cardsIn', { language: languageLabel(cardsLang) })}</Chip>
              <Chip tone="accent" icon={<Languages className="h-3 w-3" />}>
                {t('explore.anyLanguage')}
              </Chip>
              {data.source_public && data.source_url && !youtubeId && (
                <button
                  onClick={() => void openUrl(data.source_url!)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('hero.viewSource')}
                </button>
              )}
            </div>
            {data.tags && data.tags.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  {t('hero.tags')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((x) => (
                    <span
                      key={x}
                      className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground"
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:hidden">
            <CloneCta
              total={total}
              clones={clones}
              copyCount={copies.length}
              onClone={() => setCloneOpen(true)}
              onView={() => navigate(`/review/deck/${copies[0].id}`)}
            />
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <BookOpen className="h-4 w-4 text-accent" />
              <div>
                <h2 className="text-sm font-bold leading-none">{t('explore.cardsPreview')}</h2>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {t('cardsCount', { count: total })}
                </p>
              </div>
              {loading && (
                <Loader2 className="ms-auto h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="space-y-3 p-4">
              <InlineError message={error} />
              {(data.cards ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('explore.noCardsYet')}
                </p>
              ) : (
                (data.cards ?? []).map((c, i) => (
                  <RichCard
                    key={c.id}
                    card={{
                      id: c.id,
                      front: c.front_text,
                      back: c.back_text ?? '',
                      notes: c.notes,
                      tags: c.tags ?? [],
                    }}
                    number={(page - 1) * PAGE_SIZE + i + 1}
                    sourceLang={cardsLang}
                    isOwner={false}
                    hideBack={!showMeanings}
                  />
                ))
              )}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </section>

          {related.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold">{t('related.title')}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {related.map((d) => (
                  <Link
                    key={d.id}
                    to={`/explore/${d.id}`}
                    onClick={() => setPage(1)}
                    className="rounded-xl border border-border bg-card p-3 hover:shadow-md"
                  >
                    <p dir="auto" className="line-clamp-2 text-xs font-bold">
                      {publicDeckTitle(d.title)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t('cardsCount', { count: d.card_count })}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <CloneCta
            total={total}
            clones={clones}
            copyCount={copies.length}
            onClone={() => setCloneOpen(true)}
            onView={() => navigate(`/review/deck/${copies[0].id}`)}
          />
        </aside>
      </div>

      <CloneDeckDialog
        deck={{
          id: data.id,
          title: data.title,
          description: data.description,
          card_count: data.card_count,
          language_pair: data.language_pair,
          created_at: data.created_at,
          tags: data.tags,
          source_url: data.source_url,
          source_type: data.source_type,
          source_public: data.source_public,
          cover_url: data.cover_url,
        }}
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
      />
    </div>
  );
}

function CloneCta({
  total,
  clones,
  copyCount,
  onClone,
  onView,
}: {
  total: number;
  clones: number;
  copyCount: number;
  onClone: () => void;
  onView: () => void;
}) {
  const { t } = useTranslation('decks');
  const have = copyCount > 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
          <Copy className="h-3.5 w-3.5" />
          {t('explore.cloneThis')}
        </div>
        <p className="inline-flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-primary-light">
          <Languages className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('explore.anyLanguageHint')}
        </p>
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tabular-nums leading-none">{total}</span>
            <span className="text-xs text-muted-foreground">{t('cards')}</span>
          </div>
          {clones > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('explore.learnersStudying', { count: clones })}
            </p>
          )}
        </div>
        {have && (
          <div className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            <Check className="h-3 w-3" strokeWidth={3} />
            {t('explore.inLibrary')}
            {copyCount > 1 ? ` (${copyCount})` : ''}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {have && (
            <Button size="sm" onClick={onView}>
              <BookOpen className="h-4 w-4" />
              {t('explore.viewMyCopy')}
            </Button>
          )}
          <Button size="sm" variant={have ? 'outline' : 'default'} onClick={onClone}>
            <Copy className="h-4 w-4" />
            {t('explore.cloneToMyDecks')}
          </Button>
        </div>
      </div>
      <div className="border-t border-border bg-muted/40 px-4 py-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {t('explore.whatYouGet')}
        </p>
        <ul className="space-y-1.5">
          {(['edit', 'srs', 'progress'] as const).map((k) => (
            <li key={k} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3 w-3 text-success" strokeWidth={3} />
              {t(`explore.perk.${k}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
