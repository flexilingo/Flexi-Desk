import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  Headphones,
  Play,
  Plus,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEpisodesByLevel } from '../services/podcastCloud';
import { useImportAndPlay } from '../hooks/useImportAndPlay';
import type { CefrLevel, EpisodeByLevel, NlpAnalysis } from '../types';
import { cn } from '@/lib/utils';

const CEFR_STYLE: Record<string, string> = {
  A1: 'bg-cefr-a1 text-white',
  A2: 'bg-cefr-a2 text-white',
  B1: 'bg-cefr-b1 text-white',
  B2: 'bg-cefr-b2 text-white',
  C1: 'bg-cefr-c1 text-white',
  C2: 'bg-cefr-c2 text-white',
};

function formatStudyTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function durationLabel(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${Math.round(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

/** A host-supplied "up next" list (a video brings other videos). */
export interface PlayerRecommendations {
  heading: string;
  sub: string;
  render: (dismiss: () => void) => ReactNode;
}

/** C1/C2 words among the episode's words (the "advanced words" pill). */
function countAdvanced(topWords: string | undefined): number {
  try {
    const top: { cefr?: string }[] = topWords ? JSON.parse(topWords) : [];
    return top.filter((w) => w.cefr === 'C1' || w.cefr === 'C2').length;
  } catch {
    return 0;
  }
}

function HeroStat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-1 py-3.5">
      {icon}
      <span className="text-lg font-bold leading-none tabular-nums text-ink">{value}</span>
      <span className="text-center text-[10px] leading-tight text-caption">{label}</span>
    </div>
  );
}

/** Same-level episodes from the catalogue, in a grid (website: `RecommendedPanel`). */
function RecommendedPanel({
  level,
  excludeVideoId,
  onDismiss,
}: {
  level: CefrLevel;
  excludeVideoId?: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('podcastUi');
  const [episodes, setEpisodes] = useState<EpisodeByLevel[] | null>(null);
  const { playEpisodeByLevel, importingId } = useImportAndPlay();

  useEffect(() => {
    let live = true;
    setEpisodes(null);
    getEpisodesByLevel({ level, sort: 'newest', page: 1, limit: 24 })
      .then((res) => {
        if (live)
          setEpisodes(
            (res.episodes ?? [])
              .filter((e) => e.video_id && e.video_id !== excludeVideoId)
              .slice(0, 12),
          );
      })
      .catch(() => live && setEpisodes([]));
    return () => {
      live = false;
    };
  }, [level, excludeVideoId]);

  const grid = 'grid grid-cols-1 gap-2.5 2xl:grid-cols-2';
  if (episodes === null) {
    return (
      <div className={grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
          >
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (episodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <Headphones className="h-8 w-8 text-caption/40" />
        <p className="text-sm">{t('np.noResults')}</p>
      </div>
    );
  }
  return (
    <div className={grid}>
      {episodes.map((ep) => {
        const dur = durationLabel(ep.duration_seconds);
        return (
          <button
            key={ep.id}
            type="button"
            disabled={importingId === ep.id}
            onClick={() => {
              onDismiss();
              void playEpisodeByLevel(ep);
            }}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md disabled:opacity-60"
          >
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {ep.image_url ? (
                <img
                  src={ep.image_url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Headphones className="h-5 w-5 text-caption/40" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-olive-900/35 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="h-4 w-4 translate-x-px fill-current text-white" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h4
                dir="auto"
                className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-accent"
              >
                {ep.title}
              </h4>
              {ep.podcast_title && (
                <p dir="auto" className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                  {ep.podcast_title}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                {ep.difficulty_band && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                      CEFR_STYLE[ep.difficulty_band] ?? 'bg-muted text-foreground',
                    )}
                  >
                    {ep.difficulty_band}
                  </span>
                )}
                {dur && (
                  <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-caption">
                    <Clock className="h-3 w-3" /> {dur}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * When an episode or a video ends (website: `EpisodeCompleteOverlay`): a celebration panel with the
 * session's numbers, and "up next" — same-level episodes, or the host's own list for a video.
 */
export function EpisodeCompleteOverlay({
  analysis,
  level,
  wordsClicked,
  wordsAddedToDeck,
  activeTimeSpent,
  xpEarned = 0,
  currentVideoId,
  recommendations,
  onDismiss,
}: {
  analysis: NlpAnalysis | null | undefined;
  /** CEFR level of the finished episode — drives the same-level recommendations. */
  level?: string | null;
  wordsClicked: number;
  wordsAddedToDeck: number;
  activeTimeSpent: number; // ms
  xpEarned?: number;
  currentVideoId?: string;
  recommendations?: PlayerRecommendations;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('podcastUi');
  const advancedCount = countAdvanced(analysis?.topWords);
  const overallCefr = level ?? analysis?.cefrLevel ?? null;
  const recommendLevel = (overallCefr ?? undefined) as CefrLevel | undefined;
  const hasRecommendations = !!recommendations || !!recommendLevel;

  return (
    <div
      className="absolute inset-0 z-[105] flex items-center justify-center bg-olive-950/70 p-6"
      onClick={onDismiss}
    >
      <div
        className="relative flex h-[clamp(460px,80vh,840px)] max-h-full w-[clamp(340px,72vw,1180px)] max-w-full flex-col overflow-hidden rounded-3xl bg-card shadow-2xl xl:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          onClick={onDismiss}
          variant="ghost"
          size="icon-sm"
          aria-label={t('shared.close')}
          className="absolute end-3.5 top-3.5 z-30 rounded-full bg-white/85 text-ink shadow-xs backdrop-blur-sm hover:bg-white"
        >
          <X className="h-4 w-4" />
        </Button>

        <aside
          className={cn(
            'relative flex shrink-0 flex-col items-center justify-center gap-4 overflow-hidden bg-olive-450 px-6 py-7 text-center text-cream-50',
            hasRecommendations && 'xl:w-[392px]',
          )}
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-terra-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-sage/15 blur-3xl" />
          <div className="relative flex flex-col items-center gap-2.5">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-terra-500 text-white shadow-md ring-1 ring-white/15">
              <CheckCircle2 className="h-7 w-7" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">{t('np.episodeComplete')}</h2>
              <p className="mt-0.5 text-[13px] text-cream-200/70">{t('np.greatSession')}</p>
            </div>
          </div>
          <div className="relative flex flex-wrap justify-center gap-2">
            {xpEarned > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cefr-b1 px-3 py-1.5 text-[13px] font-bold text-olive-950">
                <Trophy className="h-3.5 w-3.5" strokeWidth={2.5} />+{xpEarned} XP
              </span>
            )}
            {overallCefr && (
              <span className="inline-flex items-center rounded-full bg-cream-100 px-3 py-1.5 text-[13px] font-bold text-olive-800">
                {overallCefr} {t('np.level')}
              </span>
            )}
            {advancedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-terra-500 px-3 py-1.5 text-[13px] font-semibold text-white">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                {advancedCount} {t('np.c1c2Words')}
              </span>
            )}
          </div>
          <div className="relative grid w-full max-w-[330px] grid-cols-3 divide-x divide-cream-300/70 overflow-hidden rounded-2xl bg-cream-50 shadow-md">
            <HeroStat
              icon={
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-olive-500/[0.12] text-olive-600">
                  <Search className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
              }
              value={wordsClicked}
              label={t('np.wordsExplored')}
            />
            <HeroStat
              icon={
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-terra-500/[0.12] text-terra-600">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              }
              value={wordsAddedToDeck}
              label={t('np.addedToDeckStat')}
            />
            <HeroStat
              icon={
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sage/[0.18] text-olive-600">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
              }
              value={formatStudyTime(activeTimeSpent)}
              label={t('np.studyTimeStat')}
            />
          </div>
        </aside>

        {(recommendations || recommendLevel) && (
          <section className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="shrink-0 px-5 pb-3 pt-5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent/12 text-accent">
                  {recommendations ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Headphones className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <h3 className="text-sm font-bold leading-tight text-foreground">
                    {recommendations
                      ? recommendations.heading
                      : t('np.recommendedHeading', { level: recommendLevel })}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {recommendations ? recommendations.sub : t('np.recommendedSub')}
                  </p>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">
              {recommendations ? (
                recommendations.render(onDismiss)
              ) : (
                <RecommendedPanel
                  level={recommendLevel as CefrLevel}
                  excludeVideoId={currentVideoId}
                  onDismiss={onDismiss}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
