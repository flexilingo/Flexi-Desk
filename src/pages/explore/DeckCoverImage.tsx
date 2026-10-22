import { extractYouTubeId } from '@/pages/review/lib/deckLogic';
import { languageLabel } from '@/pages/review/lib/deckLanguages';

/**
 * A deck's picture: its cover, else its YouTube video's frame, else a drawn cover in the
 * cards' language — so every card in a grid is the same size and has a face.
 */
export function DeckCoverImage({
  coverUrl,
  sourceUrl,
  lang,
}: {
  coverUrl?: string | null;
  sourceUrl?: string | null;
  lang: string;
}) {
  const youtubeId = extractYouTubeId(sourceUrl);
  if (coverUrl)
    return (
      <img
        src={coverUrl}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  if (youtubeId) {
    return (
      <img
        src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-light/15 via-muted to-muted">
      <div className="relative aspect-[4/3] h-[52%]">
        <div className="absolute inset-0 -rotate-[9deg] rounded-lg border border-border bg-card" />
        <div className="absolute inset-0 rotate-[6deg] rounded-lg border border-border bg-card" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-card shadow-sm">
          <span className="text-2xl font-black uppercase leading-none text-primary-light">
            {lang}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            <bdi>{languageLabel(lang)}</bdi>
          </span>
        </div>
      </div>
    </div>
  );
}
