import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ExternalLink, MonitorPlay, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCatalogueVideoId } from '../lib/useCatalogueVideoId';
import { youtubeWatchUrl } from '../lib/videoFilters';

/** "Watch with subtitles" — only when the deck's video is in our catalogue. */
export function WatchWithSubtitlesButton({
  youtubeId,
  variant = 'accent',
}: {
  youtubeId: string | null;
  variant?: 'accent' | 'outline';
}) {
  const { t } = useTranslation('videos');
  const catalogueId = useCatalogueVideoId(youtubeId);
  if (!catalogueId) return null;
  return (
    <Button size="sm" variant={variant} className="w-fit" asChild>
      <Link to={`/videos/watch/${catalogueId}`}>
        <MonitorPlay className="h-4 w-4" />
        {t('watchWithSubtitles')}
      </Link>
    </Button>
  );
}

/** A deck's own video: its frame (opens our watch page when we hold the video, else YouTube) and both buttons. */
export function DeckVideoCard({ youtubeId }: { youtubeId: string }) {
  const { t } = useTranslation('decks');
  const catalogueId = useCatalogueVideoId(youtubeId);
  const frame = (
    <>
      <img
        src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
        alt=""
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 flex items-center justify-center bg-primary/20 transition-colors group-hover:bg-primary/35">
        <Youtube className="h-12 w-12 text-primary-foreground" />
      </span>
    </>
  );
  const frameClass =
    'group relative block aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-border bg-muted';
  return (
    <div>
      {catalogueId ? (
        <Link
          to={`/videos/watch/${catalogueId}`}
          className={frameClass}
          aria-label={t('hero.watchOnYoutube')}
        >
          {frame}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void openUrl(youtubeWatchUrl(youtubeId))}
          className={frameClass}
          aria-label={t('hero.watchOnYoutube')}
        >
          {frame}
        </button>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <WatchWithSubtitlesButton youtubeId={youtubeId} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void openUrl(youtubeWatchUrl(youtubeId))}
        >
          <ExternalLink className="h-4 w-4" />
          {t('hero.watchOnYoutube')}
        </Button>
      </div>
    </div>
  );
}
