import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowLeft, ExternalLink, MonitorPlay, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { Pager } from './components/Pager';
import { FilterPills, levelPillOptions } from './components/FilterControls';
import { VideoGrid } from './components/VideoGrid';
import {
  VIDEO_PAGE_SIZE,
  parseCefr,
  totalPages,
  youtubeChannelUrl,
  youtubeSubscribeUrl,
} from './lib/videoFilters';
import { getVideoChannels, getVideos } from './lib/videosApi';
import { useCloudQuery } from './lib/useCloudQuery';
import { useRememberVideoList } from './lib/useRememberVideoList';

/** Every video we hold from one channel — the video counterpart of a podcast's show page. */
export function ChannelPage() {
  const { t } = useTranslation('videos');
  const { channelId: rawId = '' } = useParams<{ channelId: string }>();
  const channelId = decodeURIComponent(rawId);
  const [searchParams, setSearchParams] = useSearchParams();
  // The level lives in the URL, like the hub's filters, so the watch page's Back lands on the same one.
  const cefr = parseCefr(searchParams.get('cefr'));
  const [page, setPage] = useState(1);
  useRememberVideoList();

  const setCefr = useCallback(
    (v: ReturnType<typeof parseCefr>) => {
      setPage(1);
      setSearchParams(v ? { cefr: v } : {}, { replace: true });
    },
    [setSearchParams],
  );

  const listQ = useCloudQuery(`channel|${channelId}|${cefr ?? ''}|${page}`, () =>
    getVideos({
      channel: channelId,
      levels: cefr ? [cefr] : undefined,
      limit: VIDEO_PAGE_SIZE,
      offset: (page - 1) * VIDEO_PAGE_SIZE,
    }),
  );
  const channelsQ = useCloudQuery('channels|all', () => getVideoChannels());
  const channel = useMemo(
    () =>
      channelsQ.data?.channels.find((c) => c.id === channelId) ??
      channelsQ.data?.channels.find((c) => c.id.toLowerCase() === channelId.toLowerCase()) ??
      null,
    [channelsQ.data, channelId],
  );
  const list = listQ.currentData;
  const name = channel?.name ?? list?.items[0]?.channel ?? channelId;
  // The whole channel, not the level on screen — the pager already counts that.
  const channelTotal = channel?.videos ?? list?.total ?? 0;
  const levelCounts = channel?.levels;
  const levelsPresent = levelCounts ? Object.values(levelCounts).filter((n) => n > 0).length : 6;
  const subscribeId = channel?.youtube_channel_id;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Link
        to="/videos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('backToCatalogue')}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MonitorPlay className="h-6 w-6 shrink-0 text-accent" />
          <div>
            <h1 dir="auto" className="text-xl font-black tracking-tight sm:text-2xl">
              {name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('channel.videoCount', { count: channelTotal })}
              {channel?.dominant_level ? ` · ${channel.dominant_level}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* YouTube's own embedded Subscribe button cannot run inside the desktop app, so this opens the
              same subscribe prompt for the channel in the browser. */}
          {subscribeId && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => void openUrl(youtubeSubscribeUrl(subscribeId))}
            >
              <Youtube className="h-4 w-4" />
              {t('subscribe')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openUrl(youtubeChannelUrl(channelId))}
          >
            {t('channel.openOnYoutube')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {(levelsPresent > 1 || cefr) && (
        <FilterPills
          className="self-start"
          value={cefr ?? ''}
          options={levelPillOptions(t, {
            counts: levelCounts,
            total: channel?.videos,
            selected: cefr,
          })}
          onChange={(id) => setCefr(parseCefr(id))}
          sublabelMode="active"
        />
      )}

      {listQ.error !== undefined && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError className="flex-1" message={t('loadError')} />
          <Button size="sm" variant="outline" onClick={listQ.reload}>
            {t('retry')}
          </Button>
        </div>
      )}

      <VideoGrid
        videos={list?.items ?? []}
        isLoading={listQ.loading}
        skeletonCount={8}
        emptyTitle={listQ.error !== undefined ? undefined : t('empty.title')}
        emptySubtitle={t('empty.subtitle')}
      />
      <Pager
        page={page}
        pages={totalPages(list?.total ?? 0)}
        total={list?.total ?? 0}
        onPage={setPage}
      />
    </div>
  );
}
