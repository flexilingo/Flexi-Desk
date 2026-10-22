import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EpisodeRow } from './EpisodeRow';
import type { CuratedEpisodeLite } from '../../types';

interface Props {
  episodes: CuratedEpisodeLite[];
  isLoading?: boolean;
  /** Id of the episode currently being imported into the local DB, if any. */
  openingId?: string | null;
  onOpen: (ep: CuratedEpisodeLite) => void;
}

export function HotEpisodesSection({ episodes, isLoading, openingId, onOpen }: Props) {
  const { t } = useTranslation('common');

  if (!isLoading && episodes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-accent" />
        <h2 className="text-base font-bold text-foreground">{t('podcast.hotEpisodesTitle')}</h2>
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
            ))
          : episodes.map((ep, i) => (
              <EpisodeRow
                key={ep.id}
                episode={ep}
                index={i + 1}
                showRank
                showListenerCount
                isOpening={openingId === ep.id}
                onOpen={onOpen}
              />
            ))}
      </div>
    </section>
  );
}
