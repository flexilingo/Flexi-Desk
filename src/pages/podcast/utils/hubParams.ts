import type { CefrLevel, TopicCategory } from '../types';
import type { PodcastReading } from '../services/podcastSearch';

export const VALID_CEFR: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const VALID_TOPICS: TopicCategory[] = [
  'education',
  'storytelling',
  'news',
  'conversation',
  'science',
  'culture',
];

/** Episode-length ceilings in minutes: "how much time do I have right now?". */
export const DURATION_CEILINGS = [10, 20, 30, 60] as const;

/** The website's five hub views, in its order; "Just analyzed" is the default. */
export const HUB_VIEWS = ['analyzed', 'newPodcasts', 'latest', 'popular', 'podcasts'] as const;
export type HubView = (typeof HUB_VIEWS)[number];
export const DEFAULT_HUB_VIEW: HubView = 'analyzed';

/** Views whose cards are episodes: the only ones a length filter applies to. */
export const EPISODE_VIEWS: HubView[] = ['analyzed', 'latest', 'popular'];

export const HUB_PAGE_SIZE = 24;

/** The three length bands a sentence can name, as the upper bound this page's control has. */
export const DURATION_MAX_MINUTES: Record<'s' | 'm' | 'l', number> = { s: 10, m: 25, l: 45 };

export interface HubParams {
  q: string;
  cefr?: CefrLevel;
  topic?: TopicCategory;
  language?: string;
  duration?: number;
  view: HubView;
  page: number;
}

export const EMPTY_HUB_PARAMS: HubParams = { q: '', view: DEFAULT_HUB_VIEW, page: 1 };

/** Everything the hub reads from the query string, each value checked against what the hub can render. */
export function parseHubParams(sp: Pick<URLSearchParams, 'get'>): HubParams {
  const cefr = sp.get('cefr');
  const topic = sp.get('topic');
  const duration = parseInt(sp.get('duration') ?? '', 10);
  const page = parseInt(sp.get('page') ?? '1', 10);
  const view = sp.get('view');
  return {
    q: sp.get('q') ?? '',
    cefr: cefr && (VALID_CEFR as string[]).includes(cefr) ? (cefr as CefrLevel) : undefined,
    topic:
      topic && (VALID_TOPICS as string[]).includes(topic) ? (topic as TopicCategory) : undefined,
    language: sp.get('language') || undefined,
    duration: (DURATION_CEILINGS as readonly number[]).includes(duration) ? duration : undefined,
    view: (HUB_VIEWS as readonly string[]).includes(view ?? '')
      ? (view as HubView)
      : DEFAULT_HUB_VIEW,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/**
 * The query string for these params. The untouched hub stays a bare URL; once anything is chosen the
 * page is always written (page=1 included); the view is written with filters or off the default, and
 * never with a search (a search replaces the view).
 */
export function serializeHubParams(p: HubParams): string {
  const sp = new URLSearchParams();
  if (p.cefr) sp.set('cefr', p.cefr);
  if (p.topic) sp.set('topic', p.topic);
  if (p.language) sp.set('language', p.language);
  if (p.duration) sp.set('duration', String(p.duration));
  if (p.q) sp.set('q', p.q);
  else if (sp.toString() !== '' || p.view !== DEFAULT_HUB_VIEW || p.page > 1)
    sp.set('view', p.view);
  if (sp.toString() !== '' || p.page > 1) sp.set('page', String(p.page));
  return sp.toString();
}

/** A filter was chosen (search excluded). Duration counts only where the view shows it. */
export function hasActiveFilter(p: HubParams, view: HubView = p.view): boolean {
  return !!(p.cefr || p.topic || p.language || (p.duration && EPISODE_VIEWS.includes(view)));
}

export interface EffectiveSearch {
  level?: CefrLevel;
  topic?: TopicCategory;
  language?: string;
  duration?: number;
  /** What to search titles for; undefined once a described query became filters. */
  searchTerm?: string;
  /** A browse category (kids, business, true-crime) has its own page. */
  section?: string;
  browsing: boolean;
  /** Only a length was said: shows carry none, so the podcast lane would run unfiltered. */
  durationOnly: boolean;
  described: boolean;
}

/**
 * What the typed sentence asks for, folded over the pills. The words beat the pills only where they
 * spoke; values are checked against the same lists the URL is (core may name a topic this build has
 * never heard of, and a filter that cannot be drawn is better dropped).
 */
export function applyReading(
  p: Pick<HubParams, 'q' | 'cefr' | 'topic' | 'language' | 'duration'>,
  read: PodcastReading | undefined,
): EffectiveSearch {
  const described = read?.as === 'filters' ? read.understood : undefined;
  const level =
    (described?.level && (VALID_CEFR as string[]).includes(described.level)
      ? (described.level as CefrLevel)
      : undefined) ?? p.cefr;
  const topic =
    (described?.topic && (VALID_TOPICS as string[]).includes(described.topic)
      ? (described.topic as TopicCategory)
      : undefined) ?? p.topic;
  return {
    level,
    topic,
    language: described?.language ?? p.language,
    duration: described?.duration ? DURATION_MAX_MINUTES[described.duration] : p.duration,
    // Until the reading arrives the sentence is a name, as the page has always treated it.
    searchTerm: read && read.as !== 'name' ? undefined : p.q || undefined,
    section: described?.section ?? undefined,
    browsing: read?.as === 'browse',
    durationOnly:
      !!described?.duration &&
      !described.level &&
      !described.topic &&
      !described.language &&
      !p.cefr &&
      !p.topic &&
      !p.language,
    described: !!described,
  };
}

export const PODCAST_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];

/** The name of a view in the filter bar's view switcher (podcastUi keys, the website's labels). */
export const VIEW_LABEL_KEY: Record<HubView, string> = {
  analyzed: 'justAnalyzed',
  newPodcasts: 'newPodcasts',
  latest: 'latestEpisodes',
  popular: 'mostPopular',
  podcasts: 'curatedByFlexiLingo',
};
