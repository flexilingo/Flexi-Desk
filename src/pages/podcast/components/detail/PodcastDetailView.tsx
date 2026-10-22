import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Headphones,
  Heart,
  HeartOff,
  Play,
  RefreshCw,
  Search,
  Share2,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePodcastDetailStore } from '../../stores/podcastDetailStore';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useAuthStore } from '@/stores/authStore';
import { useImportAndPlay } from '../../hooks/useImportAndPlay';
import { DetailEpisodeCard } from './DetailEpisodeCard';
import { RequestPodcastPanel } from './RequestPodcastPanel';
import { LevelFitCard } from './LevelFitCard';
import { RelatedEpisodes } from './RelatedEpisodes';
import { ShowPager } from './ShowPager';
import { ShowSkeleton } from './ShowSkeleton';
import {
  EPISODES_PER_PAGE,
  asCefr,
  clampPage,
  filterShowEpisodes,
  pageCount,
  podcastLanguageName,
  showLevelStats,
  showShareUrl,
  sliceAt,
  stripHtml,
} from '../../utils/showEpisodes';
import type { CefrLevel, CuratedEpisodeLite } from '../../types';

const EPISODE_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 xl:grid-cols-6';

/** Solid level tile beside the show's level name (literal classes so Tailwind emits them). */
const LEVEL_TILE: Record<CefrLevel, string> = {
  A1: 'bg-cefr-a1',
  A2: 'bg-cefr-a2',
  B1: 'bg-cefr-b1',
  B2: 'bg-cefr-b2',
  C1: 'bg-cefr-c1',
  C2: 'bg-cefr-c2',
};

const ACCENT_KEYS: Record<string, string> = {
  us: 'accentUs',
  uk: 'accentUk',
  au: 'accentAu',
  mixed: 'accentMixed',
};

const CHIP =
  'inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12px] text-muted-foreground';
const LINK =
  'inline-flex h-6 items-center gap-1 px-1 text-[12px] font-semibold text-primary hover:underline';

/** The show's own description, two lines until asked for more. */
function ShowDescription({ text }: { text: string }) {
  const { t: tp } = useTranslation('podcastUi');
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 max-w-[760px]">
      <p
        dir="auto"
        className={cn(
          'whitespace-pre-line text-[14.5px] leading-relaxed text-muted-foreground',
          !open && 'line-clamp-2',
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1 text-[13px] font-semibold text-primary hover:underline"
      >
        {open ? tp('show.showLess') : tp('show.showMore')}
      </button>
    </div>
  );
}

export function PodcastDetailView() {
  const { t } = useTranslation('common');
  const { t: tp, i18n } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const { feedId: feedIdParam } = useParams<{ feedId: string }>();
  const feedId = Number(feedIdParam);
  const [searchParams, setSearchParams] = useSearchParams();

  const session = useAuthStore((s) => s.session);
  const {
    podcast,
    curated,
    episodes,
    isLoading,
    isEpisodesLoading,
    isFetchingMore,
    curatedTotal,
    hasMore,
    notFound,
    error,
    isRefreshing,
    refreshResult,
    load,
    loadOlder,
    refreshEpisodes,
    clearRefreshResult,
    clear,
  } = usePodcastDetailStore();

  const {
    followedFeedIds,
    followedPodcasts,
    followingFeedId,
    updatingFollowFeedId,
    fetchFollowed,
    followPodcast,
    unfollowPodcast,
    setAutoTranscribe,
  } = useDiscoverStore();

  const { playCuratedEpisode, importingId, error: importError } = useImportAndPlay();

  const [rssCopied, setRssCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [readyOnly, setReadyOnly] = useState(false);
  const episodesRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (Number.isFinite(feedId)) load(feedId);
    setQuery('');
    setReadyOnly(false);
    return () => clear();
  }, [feedId, load, clear]);

  useEffect(() => {
    if (session) fetchFollowed();
  }, [session, fetchFollowed]);

  const visibleEpisodes = useMemo(
    () => filterShowEpisodes(episodes, query, readyOnly),
    [episodes, query, readyOnly],
  );

  if (isLoading) return <ShowSkeleton />;

  if (notFound || !podcast) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Headphones className="h-12 w-12 text-caption/40" />
        <p className="text-base font-semibold text-foreground">{tp('show.notFound')}</p>
        <p className="max-w-md text-sm text-muted-foreground">{tp('show.notFoundDesc')}</p>
        {error && <p className="max-w-md text-xs text-caption">{error}</p>}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {tp('show.back')}
        </Button>
      </div>
    );
  }

  const isFollowed = followedFeedIds.has(feedId);
  const follow = followedPodcasts.find((p) => p.feed_id === feedId);
  const isFollowBusy = followingFeedId === feedId;
  const isAutoBusy = updatingFollowFeedId === feedId;

  const readyEpisodes = episodes.filter((e) => e.status === 'ready');
  const readyIsPartial = hasMore || episodes.length < curatedTotal;
  const description = stripHtml(curated?.description || podcast.description || '');
  const categories = Object.values(podcast.categories ?? curated?.categories ?? {}).slice(0, 4);
  const cover = curated?.image_url || podcast.image || null;
  const author =
    podcast.author || podcast.ownerName || curated?.author || curated?.owner_name || '';
  const language = podcast.language || curated?.language || '';
  const languageName = podcastLanguageName(language, i18n.language);
  const isExplicit = podcast.isExplicit ?? curated?.is_explicit ?? false;
  const websiteUrl = podcast.websiteUrl || curated?.website_url || '';
  const itunesId = podcast.itunesId || curated?.itunes_id || null;
  const feedTotal = podcast.episodeCount ?? 0;
  const episodeTotal = Math.max(feedTotal, curatedTotal, episodes.length);
  const num = new Intl.NumberFormat(i18n.language);

  const { showLevel } = showLevelStats(
    readyEpisodes.map((e) => asCefr(e.difficulty_band ?? e.cefr_level)),
    curated,
  );

  // The one action on the page: the newest episode the player can do something with, or simply the newest.
  const latest =
    readyEpisodes.find((e) => e.audio_url) ?? episodes.find((e) => e.audio_url) ?? null;
  const latestReady = latest?.status === 'ready';

  const isFiltered = query.trim() !== '' || readyOnly;
  const pagerTotal = isFiltered
    ? visibleEpisodes.length
    : hasMore
      ? Math.max(episodes.length, feedTotal, curatedTotal)
      : episodes.length;
  const totalPages = pageCount(pagerTotal);
  const currentPage = clampPage(Number(searchParams.get('page')), totalPages);
  const pageEpisodes = sliceAt(visibleEpisodes, currentPage);

  const goToPage = (page: number) => {
    const next = Math.min(Math.max(1, page), totalPages);
    setSearchParams(next > 1 ? { page: String(next) } : {}, { replace: false });
    episodesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Changing what is filtered invalidates the page number; replace so typing leaves no history entries.
  const resetToFirstPage = () => {
    if (searchParams.has('page')) setSearchParams({}, { replace: true });
  };

  const openEpisode = (ep: CuratedEpisodeLite) =>
    playCuratedEpisode({
      ...ep,
      podcast_title: podcast.title,
      podcast_image: cover ?? undefined,
    });

  const copyRss = async () => {
    if (!podcast.rssUrl) return;
    await navigator.clipboard.writeText(podcast.rssUrl);
    setRssCopied(true);
    setTimeout(() => setRssCopied(false), 1600);
  };

  // The show's public page: what a person pastes to a friend.
  const shareShow = async () => {
    await navigator.clipboard.writeText(showShareUrl(feedId, podcast.title, i18n.language));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const fitCard = (compact: boolean) => (
    <LevelFitCard
      level={showLevel}
      bands={readyEpisodes.map((e) => asCefr(e.difficulty_band ?? e.cefr_level))}
      wordsPerMinute={curated?.avg_wpm ?? null}
      readyCount={readyEpisodes.length}
      readyIsPartial={readyIsPartial}
      compact={compact}
    />
  );

  const hasChips = !!(curated || isExplicit || categories.length > 0);
  const hasLinks = !!(websiteUrl || podcast.rssUrl || itunesId);

  return (
    <div className="space-y-6">
      {(error || importError) && (
        <div
          role="alert"
          className="rounded-[9px] border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error"
        >
          {importError ?? error}
        </div>
      )}

      {/* Hero: compact, the cover beside the facts, one row of actions */}
      <section className="rounded-[9px] border border-border bg-muted/50">
        <div className="px-6 pb-7 pt-5">
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Link to="/podcast" className="hover:text-primary">
              {tp('show.breadcrumb')}
            </Link>
            <span aria-hidden>/</span>
            <span aria-current="page" dir="auto" className="line-clamp-1 text-foreground">
              {podcast.title}
            </span>
          </nav>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-5">
              <div className="row-span-3 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted shadow-md">
                {cover ? (
                  <img src={cover} alt={podcast.title} className="h-full w-full object-cover" />
                ) : (
                  <Headphones className="h-10 w-10 text-caption/40" />
                )}
              </div>

              <div className="min-w-0">
                {author && (
                  <p className="text-[13px] font-semibold text-primary">
                    <bdi>{author}</bdi>
                  </p>
                )}
                <h1 className="mt-0.5 text-[26px] font-bold leading-[1.15] tracking-[-0.015em] text-foreground">
                  <bdi>{podcast.title}</bdi>
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-muted-foreground">
                  {showLevel && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white dark:text-primary-foreground',
                          LEVEL_TILE[showLevel],
                        )}
                      >
                        {showLevel}
                      </span>
                      {tp(`show.levelNames.${showLevel}`)}
                    </span>
                  )}
                  {languageName && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-caption" />
                      {languageName}
                    </span>
                  )}
                  {episodeTotal > 0 && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Headphones className="h-3.5 w-3.5 text-caption" />
                      {tp('show.showEpisodes', { count: episodeTotal })}
                    </span>
                  )}
                  {curated?.accent_type && (
                    <span>
                      {tp('show.accent')}:{' '}
                      <span className="font-semibold text-foreground">
                        {tp(`show.${ACCENT_KEYS[curated.accent_type] ?? 'accentMixed'}`)}
                      </span>
                    </span>
                  )}
                </div>
                {(hasChips || hasLinks) && (
                  <ul className="mt-2 flex flex-wrap items-center gap-1.5">
                    {curated && (
                      <li className={CHIP}>
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                        {tp('show.editorsPick')}
                      </li>
                    )}
                    {isExplicit && (
                      <li className={CHIP}>
                        <AlertTriangle className="h-3 w-3 text-error" />
                        {tp('show.explicit')}
                      </li>
                    )}
                    {categories.map((category) => (
                      <li key={category} className={CHIP}>
                        {category}
                      </li>
                    ))}
                    {websiteUrl && (
                      <li className={hasChips ? 'ms-1.5' : undefined}>
                        <a
                          href={websiteUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className={LINK}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {tp('show.visitWebsite')}
                        </a>
                      </li>
                    )}
                    {itunesId && (
                      <li>
                        <a
                          href={`https://podcasts.apple.com/podcast/id${itunesId}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className={LINK}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {tp('show.listenOnApple')}
                        </a>
                      </li>
                    )}
                    {/* Desk only: the feed address for another podcast app. */}
                    {podcast.rssUrl && (
                      <li>
                        <button type="button" onClick={copyRss} className={LINK}>
                          {rssCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {rssCopied ? t('podcast.copied') : t('podcast.copyRss')}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {description && (
                <div className="col-start-2">
                  <ShowDescription text={description} />
                </div>
              )}

              <div className="col-start-2 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  {latest && (
                    <Button
                      variant="accent"
                      loading={importingId === latest.id}
                      onClick={() => openEpisode(latest)}
                    >
                      {importingId !== latest.id && <Play className="h-4 w-4 fill-current" />}
                      {tp('show.playLatest')}
                    </Button>
                  )}
                  {session &&
                    (isFollowed ? (
                      <Button
                        variant="outline"
                        loading={isFollowBusy}
                        onClick={() => unfollowPodcast(feedId)}
                      >
                        {!isFollowBusy && <HeartOff className="h-4 w-4" />}
                        {tp('show.unfollow')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        loading={isFollowBusy}
                        onClick={() => followPodcast(feedId)}
                      >
                        {!isFollowBusy && <Heart className="h-4 w-4" />}
                        {tp('show.follow')}
                      </Button>
                    ))}
                  <Button variant="outline" onClick={shareShow}>
                    {linkCopied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                    {linkCopied ? tp('show.linkCopied') : tp('show.share')}
                  </Button>
                  {/* Desk only: what following adds on this machine. */}
                  {session && isFollowed && (
                    <>
                      <Button
                        variant={follow?.auto_transcribe ? 'default' : 'outline'}
                        loading={isAutoBusy}
                        title={t('podcast.autoTranscribeHint')}
                        onClick={() => setAutoTranscribe(feedId, !follow?.auto_transcribe)}
                      >
                        {!isAutoBusy && <Wand2 className="h-4 w-4" />}
                        {t('podcast.autoTranscribe')}
                      </Button>
                      <Button
                        variant="outline"
                        loading={isRefreshing}
                        onClick={() => refreshEpisodes(feedId)}
                      >
                        {!isRefreshing && <RefreshCw className="h-4 w-4" />}
                        {t('podcast.checkForNew')}
                      </Button>
                    </>
                  )}
                </div>
                {/* Only a promise the player can keep: no transcript, no clickable words. */}
                {latestReady && (
                  <p className="max-w-[340px] text-[12px] leading-snug text-caption">
                    {tp('show.playHint')}
                  </p>
                )}
              </div>
            </div>

            <div className="hidden lg:block">{fitCard(true)}</div>
          </div>
        </div>
      </section>

      {/* refresh-user-episodes result */}
      {refreshResult && (
        <div
          className={cn(
            'flex items-start gap-2.5 rounded-[9px] border px-4 py-3 text-sm',
            refreshResult.credit_exhausted
              ? 'border-warning/40 bg-warning/10 text-warning'
              : 'border-success/30 bg-success/10 text-success',
          )}
        >
          {refreshResult.credit_exhausted ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {t('podcast.refreshDiscovered', { count: refreshResult.discovered })}
            </p>
            {refreshResult.auto_transcribed > 0 && (
              <p className="text-xs opacity-90">
                {t('podcast.refreshAutoTranscribed', { count: refreshResult.auto_transcribed })}
              </p>
            )}
            {refreshResult.credit_exhausted && (
              <p className="text-xs opacity-90">{t('podcast.refreshCreditExhausted')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={clearRefreshResult}
            className="text-xs font-semibold underline underline-offset-2"
          >
            {t('podcast.dismiss')}
          </button>
        </div>
      )}

      {/* Request-a-podcast: only when not curated */}
      {!curated && <RequestPodcastPanel feedId={feedId} />}

      {/* Body: full width, like the podcasts hub */}
      <div className="space-y-12 pt-2">
        <section ref={episodesRef} className="scroll-mt-24">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[22px] font-bold tracking-[-0.01em] text-foreground">
              {tp('show.episodes')}
              <span className="ms-1.5 text-[14px] font-normal tabular-nums text-caption">
                (
                {isFiltered
                  ? `${num.format(visibleEpisodes.length)}/${num.format(episodes.length)}`
                  : num.format(pagerTotal)}
                )
              </span>
            </h2>

            {episodes.length > 0 && (
              <div className="flex items-center gap-2.5">
                <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none lg:w-80">
                  <Search className="pointer-events-none absolute inset-y-0 my-auto h-4 w-4 text-caption start-3" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      resetToFirstPage();
                    }}
                    placeholder={tp('show.searchEpisodes')}
                    aria-label={tp('show.searchEpisodes')}
                    className="w-full rounded-[9px] border border-input bg-card py-2 text-sm text-foreground placeholder:text-caption transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ps-9 pe-3"
                  />
                </div>
                {readyEpisodes.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={readyOnly}
                    onClick={() => {
                      setReadyOnly((v) => !v);
                      resetToFirstPage();
                    }}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border px-3.5 py-2 text-sm font-semibold transition-colors',
                      readyOnly
                        ? 'border-primary/50 bg-primary/12 text-primary'
                        : 'border-input bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Check className="h-4 w-4" />
                    {tp('show.readyOnly')}
                  </button>
                )}
              </div>
            )}
          </div>

          {isEpisodesLoading ? (
            <ul className={`${EPISODE_GRID} mt-5`}>
              {Array.from({ length: 12 }).map((_, i) => (
                <li
                  key={i}
                  className="list-none overflow-hidden rounded-[9px] border border-border bg-card"
                >
                  <div className="aspect-square animate-pulse bg-muted" />
                  <div className="space-y-2 p-3">
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </li>
              ))}
            </ul>
          ) : episodes.length > 0 ? (
            <>
              {pageEpisodes.length > 0 ? (
                <ul className={`${EPISODE_GRID} mt-5`}>
                  {pageEpisodes.map((ep) => (
                    <DetailEpisodeCard
                      key={ep.id}
                      episode={ep}
                      podcastImage={cover}
                      isOpening={importingId === ep.id}
                      onOpen={openEpisode}
                    />
                  ))}
                </ul>
              ) : (
                <div className="mt-5 rounded-[9px] border border-border bg-card py-10 text-center text-muted-foreground shadow-xs">
                  <Headphones className="mx-auto mb-3 h-10 w-10 text-caption/40" />
                  <p className="text-sm">{tp('show.noMatch')}</p>
                  {hasMore && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      loading={isFetchingMore}
                      onClick={() => loadOlder(feedId)}
                    >
                      {tp('show.searchOlder')}
                    </Button>
                  )}
                </div>
              )}

              <ShowPager
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={pagerTotal}
                pageSize={EPISODES_PER_PAGE}
                onPageChange={goToPage}
              />

              {/* End of what the pager can offer, with the feed not exhausted. */}
              {hasMore && currentPage >= totalPages && pageEpisodes.length > 0 && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    loading={isFetchingMore}
                    onClick={() => loadOlder(feedId)}
                  >
                    {tp('show.searchOlder')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-[9px] border border-border bg-card py-10 text-center text-muted-foreground shadow-xs">
              <Headphones className="mx-auto mb-3 h-10 w-10 text-caption/40" />
              <p className="text-sm">{tp('show.noEpisodes')}</p>
            </div>
          )}
        </section>

        <div className="lg:hidden">{fitCard(false)}</div>

        {/* Related by meaning: silent until the seed episode is indexed. */}
        <RelatedEpisodes
          seedEpisodeId={readyEpisodes[0]?.id}
          excludeFeedId={feedId}
          language={podcast.language}
        />
      </div>

      <p className="pt-6 text-center text-[12px] text-caption">
        {tp('show.poweredBy')}{' '}
        <a
          href="https://podcastindex.org"
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-primary hover:underline"
        >
          PodcastIndex.org
        </a>
      </p>
    </div>
  );
}
