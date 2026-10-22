import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MonitorPlay, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { useAuthStore } from '@/stores/authStore';
import { ChannelShelf, CHANNEL_GRID } from './components/ChannelShelf';
import { ChannelTile } from './components/ChannelTile';
import { Pager } from './components/Pager';
import { SignInForMusic } from './components/SignInForMusic';
import { TopicGrid } from './components/TopicGrid';
import { VideoFilterBar } from './components/VideoFilterBar';
import { VideoGrid } from './components/VideoGrid';
import {
  SEARCH_CHANNEL_SHELF,
  VIDEO_PAGE_SIZE,
  isMusicLocked,
  matchChannels,
  parseCatalogState,
  serializeCatalogState,
  shouldLeadWithPinned,
  totalPages,
  type CatalogState,
} from './lib/videoFilters';
import {
  buildFiltersQuery,
  buildListQuery,
  getVideoChannels,
  getVideoFilters,
  getVideos,
  type CefrLabel,
  type VideoFilterArgs,
  type VideoListArgs,
} from './lib/videosApi';
import { useCloudQuery } from './lib/useCloudQuery';
import { useRememberVideoList } from './lib/useRememberVideoList';

/**
 * The video hub — filter bar, then either the active view or, once a search is typed, one result
 * grid (matching channels first). Every filter lives in the URL, so Back from a video returns to the
 * same filtered list.
 */
export function CatalogPage() {
  const { t } = useTranslation('videos');
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => parseCatalogState(searchParams), [searchParams]);
  const { cefr, topic, duration, language, category, view, page, q } = state;
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  useRememberVideoList();

  const update = useCallback(
    (patch: Partial<CatalogState>) =>
      setSearchParams(serializeCatalogState({ ...state, ...patch }), { replace: true }),
    [state, setSearchParams],
  );

  const musicLocked = isMusicLocked(category, !!session, authLoading);
  const levels = cefr ? ([cefr] as CefrLabel[]) : undefined;

  // Faceted: every menu counts under the rest of the bar, and `total` is what the list will show.
  const filterArgs: VideoFilterArgs = {
    levels,
    tag: topic,
    language,
    category,
    maxDuration: duration,
    q: q || undefined,
  };
  const filtersQ = useCloudQuery(`filters|${buildFiltersQuery(filterArgs)}`, () =>
    getVideoFilters(filterArgs),
  );

  const listArgs: VideoListArgs = q
    ? {
        q,
        levels,
        tag: topic,
        maxDuration: duration,
        language,
        category,
        limit: VIDEO_PAGE_SIZE,
        offset: (page - 1) * VIDEO_PAGE_SIZE,
      }
    : {
        levels,
        tag: topic,
        maxDuration: duration,
        language,
        category,
        sort: view,
        limit: VIDEO_PAGE_SIZE,
        offset: (page - 1) * VIDEO_PAGE_SIZE,
        // The pinned video leads the hub as it opens, or narrowed to a language.
        pinned: shouldLeadWithPinned(state),
      };
  const listQ = useCloudQuery(musicLocked ? null : `list|${buildListQuery(listArgs)}`, () =>
    getVideos(listArgs),
  );

  // The shelf, and — under a search — the channels whose name matches (a channel's name is rarely in
  // its videos' titles).
  const channelsQ = useCloudQuery(`channels|${language ?? ''}`, () =>
    getVideoChannels({ language, pinned: true }),
  );
  const matchedChannels = useMemo(() => {
    if (!q) return [];
    const matched = matchChannels(channelsQ.currentData?.channels ?? [], q);
    return cefr ? matched.filter((c) => (c.levels[cefr] ?? 0) > 0) : matched;
  }, [channelsQ.currentData, q, cefr]);
  // "See all" belongs to the search it was pressed for; a new search folds back.
  const [channelsOpenFor, setChannelsOpenFor] = useState<string | null>(null);
  const shownChannels =
    channelsOpenFor === q ? matchedChannels : matchedChannels.slice(0, SEARCH_CHANNEL_SHELF);

  const list = listQ.currentData;
  const pages = totalPages(list?.total ?? 0);
  const topics = (filtersQ.data?.tags ?? [])
    .filter((x) => x.count > 0 && x.tag !== topic)
    .slice(0, 14)
    .map((x) => x.tag);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MonitorPlay className="h-6 w-6 text-accent" />
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <VideoFilterBar
        state={state}
        onChange={update}
        filters={filtersQ.data}
        // Signed out, music counts 0 for this caller — the sign-in card explains it. A search answers in
        // two lanes, channels and videos, each with its own count.
        resultCount={musicLocked || q ? undefined : filtersQ.currentData?.total}
        searching={!!q && listQ.loading}
      />

      {listQ.error !== undefined && !musicLocked && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError className="flex-1" message={t('loadError')} />
          <Button size="sm" variant="outline" onClick={listQ.reload}>
            {t('retry')}
          </Button>
        </div>
      )}

      {musicLocked ? (
        <SignInForMusic />
      ) : q ? (
        <div className="space-y-6">
          {matchedChannels.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <MonitorPlay className="h-5 w-5 text-accent" />
                  {t('channels.totalCount', { count: matchedChannels.length })}
                </h2>
                {shownChannels.length < matchedChannels.length && (
                  <Button variant="ghost" size="sm" onClick={() => setChannelsOpenFor(q)}>
                    {t('podcasts.seeAll')} <ChevronDown className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className={CHANNEL_GRID}>
                {shownChannels.map((c) => (
                  <ChannelTile key={c.id} channel={c} />
                ))}
              </div>
            </section>
          )}
          <div>
            <VideoGrid
              videos={list?.items ?? []}
              isLoading={listQ.loading}
              title={t('resultCount', { count: list?.total ?? 0 })}
              icon={<Youtube className="h-5 w-5 text-accent" />}
              skeletonCount={8}
              // Channels found but no video titles: the channels ARE the answer.
              emptyTitle={matchedChannels.length ? undefined : t('empty.title')}
              emptySubtitle={t('empty.subtitle')}
            />
            <Pager
              page={page}
              pages={pages}
              total={list?.total ?? 0}
              onPage={(p) => update({ page: p })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <p className="mb-4 text-[12.5px] text-muted-foreground">{t(`views.${view}Hint`)}</p>
            <VideoGrid
              videos={list?.items ?? []}
              isLoading={listQ.loading}
              skeletonCount={8}
              emptyTitle={listQ.error !== undefined ? undefined : t('empty.title')}
              emptySubtitle={t('empty.subtitle')}
            />
            <Pager
              page={page}
              pages={pages}
              total={list?.total ?? 0}
              onPage={(p) => update({ page: p })}
            />
          </section>

          <ChannelShelf
            channels={channelsQ.currentData?.channels ?? []}
            total={channelsQ.currentData?.total ?? 0}
            loading={channelsQ.loading}
          />

          <TopicGrid tags={topics} onSelect={(tag) => update({ topic: tag, page: 1 })} />
        </div>
      )}
    </div>
  );
}
