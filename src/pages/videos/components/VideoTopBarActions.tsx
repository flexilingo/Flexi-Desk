import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Tv, Youtube } from 'lucide-react';
import { youtubeWatchUrl } from '../lib/videoFilters';
import type { VideoSummary } from '../lib/videosApi';
import { CARD_ICON_BUTTON } from '@/pages/podcast/components/now-playing/CardActions';

// The same plain icon button as the player card's Bookmark, Episodes and Share (website: CardActions).
const ICON_BUTTON = CARD_ICON_BUTTON;

/** The player card's extras for a video: its channel page, and the video on YouTube (in the browser). */
export function VideoTopBarActions({ video }: { video: VideoSummary }) {
  const { t } = useTranslation('videos');
  return (
    <>
      {video.channel_id && (
        <Link
          to={`/videos/channel/${encodeURIComponent(video.channel_id)}`}
          title={
            video.channel
              ? t('player.openChannelNamed', { channel: video.channel })
              : t('player.openChannel')
          }
          aria-label={t('player.openChannel')}
          className={ICON_BUTTON}
        >
          <Tv className="h-[18px] w-[18px]" />
        </Link>
      )}
      <button
        type="button"
        onClick={() => void openUrl(youtubeWatchUrl(video.youtube_id))}
        title={t('player.openOnYoutube')}
        aria-label={t('player.openOnYoutube')}
        className={ICON_BUTTON}
      >
        <Youtube className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
