import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, ExternalLink, Globe, Pin, Play, Youtube } from 'lucide-react';
import { durationLabel } from '../lib/videoFilters';
import type { VideoSummary } from '../lib/videosApi';
import { LevelBadge } from './LevelBadge';

/** The video card — 16:9 thumbnail with level, length and pin, the title, the channel, the language. */
export function VideoCard({ video }: { video: VideoSummary }) {
  const { t } = useTranslation('videos');
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const dur = durationLabel(video.duration_sec);
  const href = `/videos/watch/${video.id}`;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_10px_28px_rgba(14,36,10,0.12)]">
      <Link to={href} className="block" aria-label={video.title}>
        <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted">
          {!imgError && video.thumbnail ? (
            <img
              src={video.thumbnail}
              alt=""
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <Youtube className="h-12 w-12 text-muted-foreground/30" />
          )}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/55 to-transparent"
          />
          {video.pinned && (
            <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-md bg-olive-450/90 px-1.5 py-0.5 text-[10px] font-semibold text-cream-50 backdrop-blur-sm">
              <Pin className="h-2.5 w-2.5" aria-hidden />
              {t('pinned')}
            </span>
          )}
          <LevelBadge
            level={video.cefr_level}
            size="md"
            className="absolute end-2 top-2 drop-shadow-md"
          />
          {dur && (
            <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-cream-50 backdrop-blur-sm">
              <Clock className="h-2.5 w-2.5" /> {dur}
            </span>
          )}
        </div>
      </Link>

      <div className="p-3">
        <Link to={href} className="mb-1 block">
          <h3
            dir="auto"
            className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground transition-colors group-hover:text-accent"
          >
            {video.title}
          </h3>
        </Link>

        {video.channel && video.channel_id ? (
          <Link
            to={`/videos/channel/${encodeURIComponent(video.channel_id)}`}
            className="group/channel -mx-1 mb-2 flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-muted"
          >
            <p
              dir="auto"
              className="line-clamp-1 flex-1 text-[11.5px] text-muted-foreground transition-colors group-hover/channel:text-foreground"
            >
              {video.channel}
            </p>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-colors group-hover/channel:text-accent" />
          </Link>
        ) : video.topic_tags.length > 0 ? (
          <p className="mb-2 line-clamp-1 text-[11.5px] text-muted-foreground">
            {video.topic_tags.slice(0, 3).join(' · ')}
          </p>
        ) : null}

        <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" /> {video.language.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Quick play — overlaid on the thumbnail only */}
      <div
        className="pointer-events-none absolute left-0 top-0 flex aspect-video w-full items-center justify-center"
        aria-hidden="true"
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => navigate(href)}
          className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-card/90 text-accent opacity-90 shadow-md backdrop-blur transition-all hover:scale-105 hover:bg-card group-hover:opacity-100"
        >
          <Play className="h-5 w-5 translate-x-px fill-current" />
        </button>
      </div>
    </div>
  );
}
