import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, LogIn, Share2, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { useAuthStore } from '@/stores/authStore';
import { listSharedReviews, type SharedReview } from '../lib/deckCloud';
import { useErrorText } from '../lib/useErrorText';
import { PageBack } from './parts/PageBack';

/** Review results friends have shared with me. */
export function SharedReviewsPage() {
  const { t, i18n } = useTranslation('decks');
  const errorText = useErrorText();
  const signedIn = useAuthStore((s) => !!s.session);
  const [reviews, setReviews] = useState<SharedReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    listSharedReviews()
      .then(setReviews)
      .catch((e) => {
        setError(errorText(e));
        setReviews([]);
      });
  }, [signedIn, errorText]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageBack to="/review" label={t('backToDecks')} />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Share2 className="h-6 w-6 text-accent" />
          {t('sharedReviews.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('sharedReviews.description')}</p>
      </div>

      {!signedIn ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 text-sm">
          <p>{t('share.signInNeeded')}</p>
          <Button size="sm" asChild>
            <Link to="/settings">
              <LogIn className="h-4 w-4" />
              {t('share.goToSettings')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <InlineError message={error} onDismiss={() => setError(null)} />
          {reviews === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
              <Share2 className="mx-auto mb-3 h-8 w-8 text-accent" />
              <h3 className="mb-1.5 text-base font-bold">{t('sharedReviews.none')}</h3>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                {t('sharedReviews.noneHint')}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => {
                const s = r.session;
                const acc =
                  s.completed_cards > 0
                    ? Math.round((s.correct_count / s.completed_cards) * 100)
                    : 0;
                const by = r.shared_by.display_name || r.shared_by.username;
                return (
                  <li
                    key={r.share_id}
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent/10">
                          {r.shared_by.avatar_url ? (
                            <img
                              src={r.shared_by.avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <User className="h-4 w-4 text-accent" />
                          )}
                        </span>
                        <div className="min-w-0 text-xs text-muted-foreground">
                          <p>
                            {t('sharedReviews.sharedBy')} <b className="text-foreground">{by}</b>
                          </p>
                          <p>{when(r.shared_at)}</p>
                        </div>
                      </div>
                      <h3 className="mb-2 truncate text-sm font-bold" dir="auto">
                        {s.session_name ||
                          t('sharedReviews.session', {
                            date: new Date(s.started_at).toLocaleDateString(i18n.language),
                          })}
                      </h3>
                      <div className="flex flex-wrap gap-2 text-[11.5px] font-semibold">
                        <span className="rounded-lg bg-accent/10 px-2 py-1 text-accent">
                          {s.completed_cards}/{s.total_cards} {t('history.cards')}
                        </span>
                        <span className="rounded-lg bg-success/10 px-2 py-1 text-success">
                          {acc}% {t('history.accuracy')}
                        </span>
                        <span className="rounded-lg bg-muted px-2 py-1 text-muted-foreground">
                          {t('sharedReviews.correctIncorrect', {
                            correct: s.correct_count,
                            incorrect: s.incorrect_count,
                          })}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" asChild className="self-start sm:self-auto">
                      <Link to={`/review/shared-reviews/${s.id}`}>
                        {t('sharedReviews.viewDetails')}
                        <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
