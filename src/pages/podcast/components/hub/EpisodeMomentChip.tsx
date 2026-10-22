import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { episodeMoments, type SearchMoment } from '../../services/podcastSearch';
import { MIN_MOMENT_QUERY, MOMENT_SETTLE_MS, stamp } from '../../utils/semantic';

interface Props {
  contentId: string;
  query: string;
  /** Opens the episode at the second the matching line starts. */
  onJump: (second: number) => void;
  /** Off-screen rows should not each start an episode build on the worker. */
  enabled?: boolean;
}

/**
 * "4:32 - the line inside an episode that made it match", with a jump to that second. It shows WHY an
 * episode is in the results, and playback starts at zero by default: only tapping this says
 * "take me there". No spinner and no empty state: its absence is invisible.
 */
export function EpisodeMomentChip({ contentId, query, onJump, enabled = true }: Props) {
  const [moment, setMoment] = useState<SearchMoment | null>(null);
  // Ask only once the phrase has stopped changing (typing a long title word by word hit the rate limit).
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(query), MOMENT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);
  const ready = settled === query && query.trim().length >= MIN_MOMENT_QUERY;

  useEffect(() => {
    if (!enabled || !ready || !contentId) return;
    let cancelled = false;
    episodeMoments(contentId, query, 1)
      .then((res) => {
        if (!cancelled) setMoment(res.moments?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setMoment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, ready, contentId, query]);

  if (!moment || moment.start_time == null) return null;
  const start = moment.start_time;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(start);
      }}
      className="mt-2 inline-flex items-start gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-left transition-colors hover:bg-primary/20"
    >
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-primary">
        <Play className="h-3 w-3 fill-current" />
        {stamp(start)}
      </span>
      <span className="line-clamp-2 text-xs text-muted-foreground">{moment.text}</span>
    </button>
  );
}
