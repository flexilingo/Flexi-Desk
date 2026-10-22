import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MonitorPlay, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CHANNEL_GRID } from './components/ChannelShelf';
import { ChannelTile } from './components/ChannelTile';
import { SearchBox } from './components/FilterControls';
import { matchChannels } from './lib/videoFilters';
import { getVideoChannels } from './lib/videosApi';
import { useCloudQuery } from './lib/useCloudQuery';
import { useRememberVideoList } from './lib/useRememberVideoList';

/** Every channel in the catalogue — searchable, filtered by language (the hub only has room for a shelf). */
export function ChannelsPage() {
  const { t } = useTranslation('videos');
  useRememberVideoList();
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('');
  const channelsQ = useCloudQuery('channels|all', () => getVideoChannels());
  const all = useMemo(() => channelsQ.data?.channels ?? [], [channelsQ.data]);

  // Language options come from the channels themselves — no hardcoded list.
  const languageOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of all) counts.set(c.language, (counts.get(c.language) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const shown = useMemo(() => {
    const inLanguage = language ? all.filter((c) => c.language === language) : all;
    return query.trim() ? matchChannels(inLanguage, query) : inLanguage;
  }, [all, language, query]);
  const hasFilters = Boolean(query || language);
  const pill = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
    );

  return (
    <div className="space-y-5">
      <Link
        to="/videos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t('backToCatalogue')}
      </Link>

      <div className="flex items-center gap-2.5">
        <MonitorPlay className="h-6 w-6 shrink-0 text-accent" />
        <div>
          <h1 className="text-2xl font-bold">{t('channels.heading')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('channels.totalCount', { count: all.length })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={query}
          onCommit={setQuery}
          placeholder={t('channels.searchPlaceholder')}
          className="w-full sm:w-60 lg:w-72"
        />
        <div
          role="group"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card p-1"
        >
          <button
            type="button"
            aria-pressed={!language}
            onClick={() => setLanguage('')}
            className={pill(!language)}
          >
            {t('channels.allLanguages')}
          </button>
          {languageOptions.map(([code, n]) => (
            <button
              key={code}
              type="button"
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
              className={pill(language === code)}
            >
              {code.toUpperCase()} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery('');
              setLanguage('');
            }}
          >
            <X className="h-4 w-4" />
            {t('channels.clear')}
          </Button>
        )}
      </div>

      {channelsQ.error !== undefined && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError className="flex-1" message={t('loadError')} />
          <Button size="sm" variant="outline" onClick={channelsQ.reload}>
            {t('retry')}
          </Button>
        </div>
      )}

      {channelsQ.loading && !channelsQ.data ? (
        <div className={CHANNEL_GRID}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/2] rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        channelsQ.error === undefined && (
          <div className="rounded-2xl border border-border bg-card py-12 text-center">
            <p className="text-muted-foreground">{t('channels.empty')}</p>
          </div>
        )
      ) : (
        <div className={CHANNEL_GRID}>
          {shown.map((c) => (
            <ChannelTile key={c.id} channel={c} />
          ))}
        </div>
      )}
    </div>
  );
}
