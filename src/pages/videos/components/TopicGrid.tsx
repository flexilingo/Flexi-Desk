import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getVideos } from '../lib/videosApi';
import { useCloudQuery } from '../lib/useCloudQuery';

/** One topic tile: a cover from the topic's own videos behind a dark gradient; hidden when empty. */
function TopicCard({ tag, onSelect }: { tag: string; onSelect: (tag: string) => void }) {
  const { currentData, loading } = useCloudQuery(`topic|${tag}`, () =>
    getVideos({ tag, limit: 3, offset: 0 }),
  );
  const items = currentData?.items ?? [];
  const cover = items.find((v) => !!v.thumbnail)?.thumbnail;
  if (loading) return <Skeleton className="aspect-[3/2] rounded-xl" />;
  if (items.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => onSelect(tag)}
      className="group relative isolate block aspect-[3/2] w-full overflow-hidden rounded-xl text-start transition-shadow duration-200 hover:shadow-md"
    >
      <div className="absolute inset-0 bg-primary">
        {cover && (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/25" />
      <div className="relative z-10 flex h-full flex-col justify-between p-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-md">
          <Globe className="h-4 w-4" />
        </div>
        <h3
          dir="auto"
          className="text-[12px] font-bold leading-tight text-white drop-shadow-md sm:text-[13px]"
        >
          {tag}
        </h3>
      </div>
    </button>
  );
}

/** Browse-by-topic tiles. */
export function TopicGrid({ tags, onSelect }: { tags: string[]; onSelect: (tag: string) => void }) {
  const { t } = useTranslation('videos');
  if (tags.length === 0) return null;
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Globe className="h-4 w-4 text-accent" />
        {t('browseByTopic')}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {tags.map((tag) => (
          <TopicCard key={tag} tag={tag} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
