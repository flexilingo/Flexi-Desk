import type { NlpAnalysis } from '../types';

const CEFR_STYLE: Record<string, string> = {
  A1: 'bg-cefr-a1 text-primary-foreground',
  A2: 'bg-cefr-a2 text-primary-foreground',
  B1: 'bg-cefr-b1 text-primary-foreground',
  B2: 'bg-cefr-b2 text-primary-foreground',
  C1: 'bg-cefr-c1 text-primary-foreground',
  C2: 'bg-cefr-c2 text-primary-foreground',
};

interface EpisodeInfoBadgesProps {
  analysis: NlpAnalysis | null | undefined;
}

export function EpisodeInfoBadges({ analysis }: EpisodeInfoBadgesProps) {
  if (!analysis) return null;

  const overallCefr = analysis.cefrLevel;
  const uniqueWords = analysis.uniqueWords;

  if (!overallCefr && !uniqueWords) return null;

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
      {overallCefr && (
        <span
          className={`${CEFR_STYLE[overallCefr] ?? 'bg-muted text-foreground'} px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide`}
        >
          {overallCefr}
        </span>
      )}
      {uniqueWords != null && uniqueWords > 0 && (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
          {uniqueWords} unique words
        </span>
      )}
    </div>
  );
}
