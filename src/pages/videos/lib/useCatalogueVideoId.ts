import { useEffect, useState } from 'react';
import { getVideoByYoutubeId } from './videosApi';

/** Our catalogue copy of a YouTube video, or null (we do not have it, or the lookup failed). */
export function useCatalogueVideoId(youtubeId: string | null): string | null {
  const [found, setFound] = useState<{ youtubeId: string; id: string | null } | null>(null);
  useEffect(() => {
    if (!youtubeId) return;
    let live = true;
    getVideoByYoutubeId(youtubeId)
      .then((r) => live && setFound({ youtubeId, id: r.video?.id ?? null }))
      .catch(() => live && setFound({ youtubeId, id: null }));
    return () => {
      live = false;
    };
  }, [youtubeId]);
  return found && found.youtubeId === youtubeId ? found.id : null;
}
