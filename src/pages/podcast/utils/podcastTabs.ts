export type PodcastTab = 'browse' | 'saved' | 'savedEpisodes' | 'history' | 'local';

export const PODCAST_TABS: PodcastTab[] = ['browse', 'saved', 'savedEpisodes', 'history', 'local'];

export const TAB_LABEL: Record<PodcastTab, string> = {
  browse: 'podcastUi:tabBrowse',
  saved: 'common:podcast.tabSaved',
  savedEpisodes: 'podcastUi:tabSavedEpisodes',
  history: 'common:podcast.tabHistory',
  local: 'common:podcast.tabLocal',
};

/** The tab a `?tab=` value names; anything else is not a tab. */
export function parsePodcastTab(value: string | null | undefined): PodcastTab | null {
  return PODCAST_TABS.includes(value as PodcastTab) ? (value as PodcastTab) : null;
}

/** Where a tab lives: Browse is the hub, the rest are the library with that tab open. */
export function podcastTabPath(tab: PodcastTab): string {
  return tab === 'browse' ? '/podcast' : `/podcast/library?tab=${tab}`;
}
