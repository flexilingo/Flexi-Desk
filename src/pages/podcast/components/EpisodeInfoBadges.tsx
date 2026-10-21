import { BookOpen, Gauge, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NlpAnalysis, PodcastEpisode } from '../types';

const CEFR_STYLE: Record<string, string> = {
  A1: 'bg-cefr-a1 text-primary-foreground',
  A2: 'bg-cefr-a2 text-primary-foreground',
  B1: 'bg-cefr-b1 text-primary-foreground',
  B2: 'bg-cefr-b2 text-primary-foreground',
  C1: 'bg-cefr-c1 text-primary-foreground',
  C2: 'bg-cefr-c2 text-primary-foreground',
};

const CHIP =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium';

/** How many of the analyzed words sit at C1/C2 — the "hard words" count. */
function advancedWordCount(distribution: string | undefined): number {
  if (!distribution) return 0;
  try {
    const parsed = JSON.parse(distribution) as Record<string, number>;
    return (parsed.C1 ?? 0) + (parsed.C2 ?? 0);
  } catch {
    return 0;
  }
}

interface EpisodeInfoBadgesProps {
  /** Local NLP result from the offline transcript. */
  analysis: NlpAnalysis | null | undefined;
  /** Cloud v2 metadata, when the episode came from the FlexiLingo catalog. */
  episode?: PodcastEpisode | null;
}

export function EpisodeInfoBadges({ analysis, episode }: EpisodeInfoBadgesProps) {
  const { t } = useTranslation('common');

  // The v2 band is only trustworthy at high confidence; otherwise show whatever
  // the transcript's own analysis concluded.
  const hasDifficulty = !!episode?.difficultyBand && episode.difficultyConfidence === 'high';
  const band = hasDifficulty ? episode!.difficultyBand : analysis?.cefrLevel;
  const score = hasDifficulty ? episode!.difficultyScore : undefined;

  const uniqueWords = analysis?.uniqueWords;
  const advanced = advancedWordCount(analysis?.cefrDistribution);

  if (!band && !uniqueWords && score == null && advanced === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
      {band && (
        <span
          className={`${CEFR_STYLE[band] ?? 'bg-muted text-foreground'} rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide`}
        >
          {band}
        </span>
      )}

      {score != null && (
        <span className={`${CHIP} border-border bg-muted text-muted-foreground tabular-nums`}>
          <Gauge className="h-3 w-3" strokeWidth={2} />
          {score}/100
        </span>
      )}

      {uniqueWords != null && uniqueWords > 0 && (
        <span className={`${CHIP} border-success/30 bg-success/10 text-success`}>
          <BookOpen className="h-3 w-3" strokeWidth={2} />
          {t('podcast.uniqueWordsLabel', { count: uniqueWords })}
        </span>
      )}

      {advanced > 0 && (
        <span className={`${CHIP} border-accent/30 bg-accent/10 text-accent`}>
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          {t('podcast.advancedWordsLabel', { count: advanced })}
        </span>
      )}
    </div>
  );
}
