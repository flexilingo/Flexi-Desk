import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, MonitorPlay, Play } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { durationLabel, pickUpNext, upNextQueries } from '../lib/videoFilters';
import { getVideos, type VideoSummary } from '../lib/videosApi';
import { useCloudQuery } from '../lib/useCloudQuery';
import { LevelBadge } from './LevelBadge';

function UpNextCard({ video, onOpen }: { video: VideoSummary; onOpen: () => void }) {
  const [imgError, setImgError] = useState(false);
  const dur = durationLabel(video.duration_sec);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md"
    >
      <div className="relative flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {video.thumbnail && !imgError ? (
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <MonitorPlay className="h-5 w-5 text-muted-foreground/40" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-4 w-4 translate-x-px fill-current text-white" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h4
          dir="auto"
          className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-accent"
        >
          {video.title}
        </h4>
        {video.channel && (
          <p dir="auto" className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
            {video.channel}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <LevelBadge level={video.cefr_level} />
          {dur && (
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
              <Clock className="h-3 w-3" /> {dur}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** "Up next" for the end-of-video overlay: the same channel first, then the same language and level. */
export function VideoUpNext({ video, onDismiss }: { video: VideoSummary; onDismiss: () => void }) {
  const { t } = useTranslation('videos');
  const navigate = useNavigate();
  const queries = upNextQueries(video);
  const channelQ = useCloudQuery(queries.channel ? `upnext|ch|${video.channel_id}` : null, () =>
    getVideos(queries.channel ?? {}),
  );
  const levelQ = useCloudQuery(
    `upnext|lv|${video.language}|${video.cefr_level ?? ''}|${video.category === 'music' ? 'music' : ''}`,
    () => getVideos(queries.level),
  );

  const videos = pickUpNext(video, channelQ.currentData?.items, levelQ.currentData?.items);
  const loading = (!!queries.channel && channelQ.loading) || levelQ.loading;
  const grid = 'grid grid-cols-1 gap-2.5 2xl:grid-cols-2';

  // replace, not push: hopping video → video must not stack history, so Back still returns to the list.
  const open = (next: VideoSummary) => {
    onDismiss();
    navigate(`/videos/watch/${next.id}`, { replace: true });
  };

  if (loading) {
    return (
      <div className={grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
          >
            <Skeleton className="aspect-video w-24 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3" />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (videos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <MonitorPlay className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm">{t('upNext.empty')}</p>
      </div>
    );
  }
  return (
    <div className={grid}>
      {videos.map((v) => (
        <UpNextCard key={v.id} video={v} onOpen={() => open(v)} />
      ))}
    </div>
  );
}
