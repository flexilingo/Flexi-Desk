import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Inbox, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { CardError, LoadingButton, OverviewCard } from './parts';
import { useStartStudy } from './useStartStudy';
import type { OverviewData } from './useOverviewData';

/** The decks with cards due, most due first (top three), each one tap from its review. */
export function PendingReviewsWidget({ data }: { data: OverviewData }) {
  const { t, i18n } = useTranslation('dashboard', { keyPrefix: 'pendingReviews' });
  const { startStudy, starting, startError } = useStartStudy();
  const decks = data.review.dueDecks;
  const shown = decks.slice(0, 3);
  const more = decks.length - shown.length;

  if (data.errors.review) {
    return (
      <OverviewCard className="p-4">
        <CardError onRetry={data.reviewReload} />
      </OverviewCard>
    );
  }

  if (decks.length === 0) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
          <div>
            <p className="text-sm font-bold text-foreground">{t('allCaughtUp')}</p>
            <p className="text-xs text-muted-foreground">{t('allCaughtUpDesc')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <OverviewCard labelledBy="pending-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2
          id="pending-title"
          className="flex items-center gap-2 text-sm font-bold text-foreground"
        >
          <Inbox className="h-4 w-4 text-primary" />
          {t('title')}
        </h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
          {t('totalDue', { count: data.review.due.toLocaleString(i18n.language) })}
        </span>
      </div>
      <ul className="px-4">
        {shown.map((deck) => (
          <li
            key={deck.deck_id}
            className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                <bdi>{deck.deck_title}</bdi>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t('dueOf', { due: deck.due_count, total: deck.total_cards })}
              </p>
            </div>
            <LoadingButton
              size="sm"
              loading={starting === deck.deck_id}
              disabled={starting !== null}
              onClick={() => startStudy(deck.deck_id)}
            >
              {starting !== deck.deck_id && <Play className="h-3.5 w-3.5" />}
              {t('startReview')}
            </LoadingButton>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <div className="px-4 pb-3">
          <Button variant="link" size="sm" asChild className="h-auto p-0 text-[11.5px]">
            <Link to="/study">{t('moreDecks', { count: more })}</Link>
          </Button>
        </div>
      )}
      {startError && (
        <div className="px-4 pb-4">
          <InlineError message={startError} />
        </div>
      )}
    </OverviewCard>
  );
}
