import type { SemanticHit } from '../services/podcastSearch';
import type { EffectiveSearch } from './hubParams';

/**
 * A similarity floor, because the index always returns its nearest rows and "nearest" is not
 * "related". Set on the website from a measured spread (nonsense queries top out at 0.48, real short
 * queries start at 0.54).
 */
export const MIN_SEMANTIC_SIMILARITY = 0.52;

/** How long the phrase must stay unchanged before a moment is asked for (429 guard). */
export const MOMENT_SETTLE_MS = 1200;
export const MIN_MOMENT_QUERY = 3;
/** Only the first rows ask for their moment: a cold episode costs the worker seconds. */
export const MOMENT_ROWS = 3;

export const keepSemanticHits = (hits: SemanticHit[] | undefined): SemanticHit[] =>
  (hits ?? []).filter((h) => (h.similarity ?? 0) >= MIN_SEMANTIC_SIMILARITY);

/**
 * Which lanes run for a search. Semantic runs for EVERY search (it answers a different question: what
 * is SAID inside episodes) but stays silent when a topic is set (it has no topic), for a browse
 * request (no words to embed), a length-only ask, or a browse category.
 */
export function planSearchLanes(q: string, eff: EffectiveSearch) {
  const searching = q.trim() !== '';
  return {
    /** Episodes-by-level always runs for a search. */
    episodes: searching,
    /** Shows by curated-list. */
    podcasts: searching && !eff.durationOnly && !eff.section,
    /** PodcastIndex titles: only ever an answer to a name. */
    discover: searching && !!eff.searchTerm,
    semantic: searching && !eff.topic && !eff.browsing && !eff.durationOnly && !eff.section,
  };
}

/** Lane order: a show titled exactly as searched, found only on PodcastIndex, goes first. */
export function laneOrder(exactInDiscover: boolean): ('podcasts' | 'episodes' | 'discover')[] {
  return exactInDiscover
    ? ['discover', 'podcasts', 'episodes']
    : ['podcasts', 'episodes', 'discover'];
}

/** Seconds as m:ss or h:mm:ss. */
export function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
