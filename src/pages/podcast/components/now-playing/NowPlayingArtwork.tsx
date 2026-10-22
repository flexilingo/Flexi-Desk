import { useState } from 'react';
import { Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The show's square artwork (website: `NowPlayingArtwork`). A refused or missing image falls back
 * to a quiet tile, keyed by url because the player swaps episodes without remounting.
 */
export function NowPlayingArtwork({
  image,
  alt,
  className,
}: {
  image?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!image || failed === image) {
    return (
      <div
        className={cn('flex items-center justify-center bg-primary-light/[0.12]', className)}
        aria-hidden
      >
        <Headphones className="h-1/3 w-1/3 text-primary" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={image}
      alt={alt}
      className={cn('object-cover', className)}
      onError={() => setFailed(image)}
    />
  );
}

/** A video's picture in the card, 16:9 (website: `VideoThumbnail`); YouTube's own is the fallback. */
export function VideoThumbnail({
  youtubeId,
  thumbnail,
  alt,
  className,
}: {
  youtubeId: string;
  thumbnail?: string | null;
  alt: string;
  className?: string;
}) {
  const fallback = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  const [src, setSrc] = useState(thumbnail || fallback);
  return (
    <div className={cn('relative aspect-video overflow-hidden bg-muted', className)}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => {
          if (src !== fallback) setSrc(fallback);
        }}
      />
    </div>
  );
}
