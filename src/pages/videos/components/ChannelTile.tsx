import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import type { VideoChannel } from '../lib/videosApi';
import { LevelBadge } from './LevelBadge';

/** One channel tile: a cover behind a dark gradient, the label at the bottom. Shared by every channel list. */
export function ChannelTile({ channel }: { channel: VideoChannel }) {
  const { t } = useTranslation('videos');
  return (
    <Link
      to={`/videos/channel/${encodeURIComponent(channel.id)}`}
      className="group relative isolate block aspect-[3/2] overflow-hidden rounded-xl text-start transition-shadow duration-200 hover:shadow-md"
    >
      <div className="absolute inset-0 bg-olive-600">
        {channel.cover && (
          <img
            src={channel.cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/25" />
      <div className="absolute inset-0 bg-olive-700/15" />
      <div className="relative z-10 flex h-full flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {channel.pinned && (
              <span className="inline-flex items-center gap-1 rounded bg-olive-450/90 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
                <Pin className="h-3 w-3" aria-hidden />
                {t('pinned')}
              </span>
            )}
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
              {t('channels.videoCount', { count: channel.videos })}
            </span>
          </div>
          <LevelBadge level={channel.dominant_level} />
        </div>
        <h3
          dir="auto"
          className="text-[12px] font-bold leading-tight text-white drop-shadow-md sm:text-[13px]"
        >
          {channel.name}
        </h3>
      </div>
    </Link>
  );
}
