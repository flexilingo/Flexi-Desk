// Search that understands a sentence and finds episodes by meaning — the website's three lanes
// beyond the title search: `find&interpret`, `/search?action=semantic|moments|similar`.

import { supabaseCall } from '@/lib/supabase';

/** How the product reads a search sentence (core's shared reading). */
export interface PodcastReading {
  /** `name`: search titles. `filters`: the words WERE the request. `browse`: a plain ask for podcasts. */
  as: 'name' | 'filters' | 'browse';
  understood: {
    language: string | null;
    level: string | null;
    topic: string | null;
    section: string | null;
    duration: 's' | 'm' | 'l' | null;
  };
  matched: string[];
  unknown: string[];
}

export interface PodcastFindResponse {
  query: string;
  interpreted: PodcastReading;
}

export interface SemanticHitEpisode {
  id: string;
  feed_id: number | null;
  video_id: string | null;
  podcast_id: string | null;
  podcast_title: string | null;
  image_url: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  publish_date: string | null;
}

export interface SemanticHit {
  content_type: 'podcast_episode' | 'video_analysis' | string;
  content_id: string;
  scope: 'document' | 'passage';
  passage_index: number;
  start_time: number | null;
  end_time: number | null;
  title: string | null;
  excerpt: string | null;
  language: string | null;
  cefr_level: string | null;
  difficulty_band: string | null;
  similarity: number;
  episode?: SemanticHitEpisode;
}

export interface SearchMoment {
  start_time: number | null;
  end_time: number | null;
  text: string;
  similarity: number;
}

/** Read the sentence, search nothing (`find&interpret=1`). */
export const readPodcastQuery = (q: string) =>
  supabaseCall<PodcastFindResponse>(
    'GET',
    `/podcast?${new URLSearchParams({ action: 'find', interpret: '1', q })}`,
  );

export const semanticSearch = (p: {
  q: string;
  languages?: string[];
  levels?: string[];
  types?: string[];
  limit?: number;
  min?: number;
}) => {
  const sp = new URLSearchParams({ action: 'semantic', q: p.q, limit: String(p.limit ?? 12) });
  if (p.languages?.length) sp.set('languages', p.languages.join(','));
  if (p.levels?.length) sp.set('levels', p.levels.join(','));
  if (p.types?.length) sp.set('types', p.types.join(','));
  if (p.min !== undefined) sp.set('min', String(p.min));
  return supabaseCall<{ query: string; count: number; results: SemanticHit[] }>(
    'GET',
    `/search?${sp}`,
  );
};

/** Where inside one episode the match sits (a ~90 s window with the second to jump to). */
export const episodeMoments = (contentId: string, q: string, limit = 1) =>
  supabaseCall<{ content_id: string; moments: SearchMoment[] }>(
    'GET',
    `/search?${new URLSearchParams({
      action: 'moments',
      content_id: contentId,
      q,
      limit: String(limit),
    })}`,
  );

/** "More episodes like this one" — reads the item's own vector, needs no query. */
export const similarEpisodes = (id: string, languages?: string[], limit = 6) => {
  const sp = new URLSearchParams({
    action: 'similar',
    type: 'podcast_episode',
    id,
    limit: String(limit),
  });
  if (languages?.length) sp.set('languages', languages.join(','));
  return supabaseCall<{ count: number; results: SemanticHit[] }>('GET', `/search?${sp}`);
};
