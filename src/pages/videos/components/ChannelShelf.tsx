import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { VideoChannel } from '../lib/videosApi';
import { ChannelTile } from './ChannelTile';

export const CHANNEL_GRID = 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';

/** The channels behind the catalogue — a shelf of twelve; the whole list lives at /videos/channels. */
export function ChannelShelf({
  channels,
  total,
  loading,
  limit = 12,
}: {
  channels: VideoChannel[];
  total: number;
  loading: boolean;
  limit?: number;
}) {
  const { t } = useTranslation('videos');
  const shown = channels.slice(0, limit);
  if (!loading && shown.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <MonitorPlay className="h-4 w-4 text-accent" />
          {t('channels.heading')}
          {total > 0 && <span className="text-xs font-normal text-muted-foreground">{total}</span>}
        </h2>
        {total > limit && (
          <Button variant="ghost" size="sm" asChild>
            <Link to="/videos/channels">
              {t('podcasts.seeAll')} <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
        )}
      </div>
      <div className={CHANNEL_GRID}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/2] rounded-xl" />
            ))
          : shown.map((c) => <ChannelTile key={c.id} channel={c} />)}
      </div>
    </section>
  );
}
