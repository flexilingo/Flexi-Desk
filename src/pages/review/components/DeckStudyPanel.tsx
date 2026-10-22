import { Loader2, PartyPopper, Play, Shuffle, Flame, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import type { DeckProgress } from '../lib/deckLocal';
import { useStartDeckStudy } from '../lib/useStartDeckStudy';

/** Today's study and the deck's progress, as the website's side panel shows them. */
export function DeckStudyPanel({
  deckId,
  progress,
}: {
  deckId: string;
  progress: DeckProgress | null;
}) {
  const { t } = useTranslation('decks');
  const { start, starting, error, clearError } = useStartDeckStudy();

  if (!progress) {
    return (
      <div className="animate-pulse space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-2 w-full rounded-full bg-muted" />
        <div className="h-9 w-32 rounded-md bg-muted" />
      </div>
    );
  }

  const { deck_progress: p, today_study: today } = progress;
  const complete = p.total_cards > 0 && p.mastered_count === p.total_cards;
  const total = p.total_cards || 1;
  const pct = Math.round((p.mastered_count / total) * 100);
  const segments = [
    { n: p.mastered_count, color: 'bg-success', label: t('progress.mastered') },
    { n: p.familiar_count, color: 'bg-primary-light', label: t('progress.familiar') },
    { n: p.learning_count, color: 'bg-accent/70', label: t('progress.learning') },
    { n: p.new_count, color: 'bg-muted-foreground/30', label: t('progress.new') },
  ];
  const hasWork = today.due_count > 0 || today.new_available > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="space-y-3.5 p-5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
          <Flame className="h-3.5 w-3.5" />
          {t('progress.todayStudy')}
        </div>

        {complete ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/10 p-3">
            <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              <p className="text-sm font-bold text-success">{t('progress.deckComplete')}</p>
              <p className="mt-0.5 text-xs text-success/80">{t('progress.deckCompleteDesc')}</p>
            </div>
          </div>
        ) : hasWork ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold tabular-nums leading-none">
                {today.total_session_size}
              </span>
              <span className="text-xs text-muted-foreground">{t('cards')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {today.due_count > 0 && (
                <span className="rounded-md bg-primary-light/10 px-2 py-0.5 font-semibold text-primary-light">
                  {t('dueCount', { count: today.due_count })}
                </span>
              )}
              {today.new_available > 0 && (
                <span className="rounded-md bg-success/15 px-2 py-0.5 font-semibold text-success">
                  {t('progress.newCount', { count: today.new_available })}
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm italic text-muted-foreground">{t('progress.reviewEarly')}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {complete ? (
            <Button size="sm" disabled={starting !== null} onClick={() => start(deckId, 'early')}>
              {starting === `${deckId}:early` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shuffle className="h-4 w-4" />
              )}
              {t('progress.randomReview')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={starting !== null || !hasWork}
                onClick={() => start(deckId, 'due')}
              >
                {starting === `${deckId}:due` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {t('progress.studyNow')}
              </Button>
              {!hasWork && p.total_cards > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={starting !== null}
                  onClick={() => start(deckId, 'early')}
                >
                  {starting === `${deckId}:early` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shuffle className="h-4 w-4" />
                  )}
                  {t('progress.reviewAhead')}
                </Button>
              )}
            </>
          )}
        </div>
        <Link
          to={`/study?deck=${deckId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-light hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('progress.moreOptions')}
        </Link>
        <InlineError message={error} onDismiss={clearError} />
      </div>

      <div className="border-t border-border bg-muted/40 p-5">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-accent">
            {t('progress.deckProgress')}
          </h3>
          <span className="text-sm font-bold tabular-nums">{pct}%</span>
        </div>
        <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-muted">
          {segments.map((s) =>
            s.n > 0 ? (
              <div
                key={s.label}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.n / total) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <p className="mb-2.5 text-xs tabular-nums text-muted-foreground">
          {t('progress.masteredOf', { mastered: p.mastered_count, total: p.total_cards })}
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {segments.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
              <span className="font-semibold tabular-nums text-foreground">{s.n}</span>
              {s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
