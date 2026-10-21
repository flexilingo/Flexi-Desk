import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rss, Bookmark, History, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FeedListView } from '../FeedListView';
import { SavedPodcastsTab } from './SavedPodcastsTab';
import { HistoryTab } from './HistoryTab';

type Tab = 'local' | 'saved' | 'history';

const TABS: { value: Tab; labelKey: string; icon: typeof Rss }[] = [
  { value: 'local', labelKey: 'podcast.tabLocal', icon: Rss },
  { value: 'saved', labelKey: 'podcast.tabSaved', icon: Bookmark },
  { value: 'history', labelKey: 'podcast.tabHistory', icon: History },
];

/**
 * The library unions desk's *local* subscriptions (offline-first, the only tab that
 * works with no network) with the cloud-account surfaces front has: followed
 * podcasts and cross-device listening history.
 */
export function LibraryView() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('local');

  // Remember the last tab within a session so navigating back doesn't reset it.
  useEffect(() => {
    const saved = sessionStorage.getItem('podcast.libraryTab');
    if (saved === 'local' || saved === 'saved' || saved === 'history') setTab(saved);
  }, []);
  useEffect(() => {
    sessionStorage.setItem('podcast.libraryTab', tab);
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(({ value, labelKey, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                tab === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(labelKey)}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={() => navigate('/podcast')}>
          <Search className="h-4 w-4" />
          {t('podcast.discover')}
        </Button>
      </div>

      {tab === 'local' && <FeedListView />}
      {tab === 'saved' && <SavedPodcastsTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}
