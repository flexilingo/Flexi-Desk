import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n/config';
import { PodcastFilterPills } from '../src/pages/podcast/components/hub/PodcastFilterPills';
import { HubPager } from '../src/pages/podcast/components/hub/HubPager';
import {
  DEFAULT_HUB_VIEW,
  EPISODE_VIEWS,
  HUB_VIEWS,
  applyReading,
  hasActiveFilter,
  parseHubParams,
  serializeHubParams,
} from '../src/pages/podcast/utils/hubParams';
import { curatedToEpisodeByLevel } from '../src/pages/podcast/utils/episodeCards';
import {
  parsePodcastTab,
  podcastTabPath,
} from '../src/pages/podcast/utils/podcastTabs';
import type { CuratedEpisodeLite } from '../src/pages/podcast/types';

const sp = (q: string) => new URLSearchParams(q);

describe('hub views and URL state (the website hub)', () => {
  it('has the website five views and opens on Just analyzed', () => {
    expect([...HUB_VIEWS]).toEqual(['analyzed', 'newPodcasts', 'latest', 'popular', 'podcasts']);
    expect(DEFAULT_HUB_VIEW).toBe('analyzed');
    expect(parseHubParams(sp('')).view).toBe('analyzed');
    // The old desk-only overview is not a view any more.
    expect(parseHubParams(sp('view=overview')).view).toBe('analyzed');
  });

  it('keeps the untouched hub a bare URL and writes page once anything is chosen', () => {
    expect(serializeHubParams(parseHubParams(sp('')))).toBe('');
    expect(serializeHubParams(parseHubParams(sp('cefr=B1')))).toBe('cefr=B1&view=analyzed&page=1');
    expect(serializeHubParams(parseHubParams(sp('view=popular')))).toBe('view=popular&page=1');
    expect(serializeHubParams(parseHubParams(sp('view=latest&page=3')))).toBe('view=latest&page=3');
  });

  it('round-trips every filter, drops values it cannot draw, and a search replaces the view', () => {
    const p = parseHubParams(sp('cefr=B2&topic=news&language=fr&duration=20&view=latest&page=2'));
    expect(p).toMatchObject({ cefr: 'B2', topic: 'news', language: 'fr', duration: 20, view: 'latest', page: 2 });
    expect(parseHubParams(sp('cefr=Z9&topic=nope&duration=7&page=-4'))).toMatchObject({
      cefr: undefined,
      topic: undefined,
      duration: undefined,
      page: 1,
    });
    expect(serializeHubParams(parseHubParams(sp('q=cooking&view=latest')))).toBe('q=cooking&page=1');
  });

  it('counts a length only where the view shows it', () => {
    const p = parseHubParams(sp('duration=10'));
    expect(EPISODE_VIEWS).toContain('analyzed');
    expect(hasActiveFilter(p, 'analyzed')).toBe(true);
    expect(hasActiveFilter(p, 'podcasts')).toBe(false);
    expect(hasActiveFilter(parseHubParams(sp('language=es')), 'podcasts')).toBe(true);
  });

  it('lets the words of a search beat the pills only where they spoke', () => {
    const base = { q: 'beginner french', cefr: 'C1' as const, topic: undefined, language: 'en', duration: undefined };
    const eff = applyReading(base, {
      as: 'filters',
      understood: { level: 'A2', language: 'fr' },
    } as never);
    expect(eff).toMatchObject({ level: 'A2', language: 'fr', described: true });
    expect(eff.searchTerm).toBeUndefined();
    // Until the reading arrives the sentence is a name.
    expect(applyReading(base, undefined).searchTerm).toBe('beginner french');
  });
});

describe('podcast page tabs', () => {
  it('Browse is the hub, every other tab is the library with that tab open', () => {
    expect(podcastTabPath('browse')).toBe('/podcast');
    expect(podcastTabPath('savedEpisodes')).toBe('/podcast/library?tab=savedEpisodes');
    expect(parsePodcastTab('history')).toBe('history');
    expect(parsePodcastTab('nonsense')).toBeNull();
    expect(parsePodcastTab(null)).toBeNull();
  });
});

describe('episode card mapping', () => {
  const row = {
    id: 'e1',
    episode_id: 7,
    feed_id: 42,
    title: 'T',
    audio_url: 'a',
    image_url: null,
    publish_date: null,
    duration_seconds: 600,
    learning_score: null,
    cefr_level: null,
    speech_rate_wpm: null,
    status: 'ready',
    video_id: null,
  } as CuratedEpisodeLite;

  it('synthesises the player id a row without one needs', () => {
    expect(curatedToEpisodeByLevel(row).video_id).toBe('podcast_42_ep_7');
    expect(curatedToEpisodeByLevel({ ...row, video_id: 'abc' }).video_id).toBe('abc');
  });
});

afterEach(cleanup);

const bar = {
  searchQuery: '',
  onSearchChange: vi.fn(),
  selectedCefr: undefined,
  onCefrChange: vi.fn(),
  selectedTopic: undefined,
  onTopicChange: vi.fn(),
  selectedLanguage: undefined,
  onLanguageChange: vi.fn(),
};

describe('podcast filter bar', () => {
  it('shows no chips and no Clear all while nothing is chosen', () => {
    render(<PodcastFilterPills {...bar} view="analyzed" onViewChange={vi.fn()} />);
    expect(screen.queryByText(/clear all/i)).toBeNull();
    expect(screen.queryByLabelText(/remove filter/i)).toBeNull();
  });

  it('lists each active filter as a removable chip with the match count, and the view switcher', () => {
    const onCefrChange = vi.fn();
    render(
      <PodcastFilterPills
        {...bar}
        selectedCefr="B1"
        selectedLanguage="fr"
        onCefrChange={onCefrChange}
        view="latest"
        onViewChange={vi.fn()}
        resultCount={12}
        resultKind="podcasts"
      />,
    );
    expect(screen.getByLabelText(/remove filter.*B1/i)).toBeTruthy();
    expect(screen.getByLabelText(/remove filter.*Fran/i)).toBeTruthy();
    expect(screen.getByText(/12/)).toBeTruthy();
    expect(screen.getByLabelText(/^view$/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/remove filter.*B1/i));
    expect(onCefrChange).toHaveBeenCalledWith(undefined);
  });

  it('hides the view switcher during a search and the length control on podcast views', () => {
    render(<PodcastFilterPills {...bar} searchQuery="x" showDuration={false} onDurationChange={vi.fn()} />);
    expect(screen.queryByLabelText(/^view$/i)).toBeNull();
    expect(screen.queryByLabelText(/duration|length/i)).toBeNull();
  });
});

describe('hub pager', () => {
  it('prints nothing for one page, and pages on click otherwise', () => {
    const onPageChange = vi.fn();
    const { container, rerender } = render(<HubPager page={1} totalPages={1} onPageChange={onPageChange} />);
    expect(container.firstChild).toBeNull();
    rerender(<HubPager page={2} totalPages={9} totalCount={216} pageSize={24} onPageChange={onPageChange} />);
    fireEvent.click(screen.getAllByText('3')[0]);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
