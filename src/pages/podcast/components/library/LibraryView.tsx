import { useSearchParams } from 'react-router-dom';
import { PodcastPageHeader } from '../PodcastPageHeader';
import { parsePodcastTab, type PodcastTab } from '../../utils/podcastTabs';
import { FeedListView } from '../FeedListView';
import { SavedEpisodesTab } from './SavedEpisodesTab';
import { SavedPodcastsTab } from './SavedPodcastsTab';
import { HistoryTab } from './HistoryTab';

/** The tab shown when the address names none: subscriptions kept on this computer, as before. */
const DEFAULT_LIBRARY_TAB: PodcastTab = 'local';

/**
 * The podcasts page's other tabs, as the website lays them out under the same header and tab strip
 * as the hub: Saved, Saved episodes and History from the account (merged with what this computer
 * holds), plus desk's own "My feeds" for local, offline-first subscriptions. The tab lives in the
 * address (`?tab=`), so Back and refresh keep it.
 */
export function LibraryView() {
  const [searchParams] = useSearchParams();
  const parsed = parsePodcastTab(searchParams.get('tab'));
  const tab: PodcastTab = parsed && parsed !== 'browse' ? parsed : DEFAULT_LIBRARY_TAB;

  return (
    <div className="space-y-5">
      <PodcastPageHeader active={tab} />
      {tab === 'local' && <FeedListView />}
      {tab === 'saved' && <SavedPodcastsTab />}
      {tab === 'savedEpisodes' && <SavedEpisodesTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}
