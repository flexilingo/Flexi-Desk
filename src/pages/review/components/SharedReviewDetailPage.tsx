import { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { InlineError } from '@/components/common/InlineError';
import { useAuthStore } from '@/stores/authStore';
import { getSharedReview, type SharedReviewDetail } from '../lib/deckCloud';
import { useErrorText } from '../lib/useErrorText';
import { PageBack } from './parts/PageBack';

export function SharedReviewDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { t, i18n } = useTranslation('decks');
  const errorText = useErrorText();
  const signedIn = useAuthStore((s) => !!s.session);
  const [data, setData] = useState<SharedReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !signedIn) {
      setLoading(false);
      return;
    }
    getSharedReview(sessionId)
      .then(setData)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [sessionId, signedIn, errorText]);

  const back = <PageBack to="/review/shared-reviews" label={t('sharedReviews.backToList')} />;

  if (loading) {
    return (
      <div className="space-y-4">
        {back}
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {back}
        <InlineError message={error ?? t('sharedReviews.notFound')} />
      </div>
    );
  }

  const { session: s, shared_by: by, shared_at, cards } = data;
  const acc = s.completed_cards > 0 ? Math.round((s.correct_count / s.completed_cards) * 100) : 0;
  const name = by.display_name || by.username;
  const tiles = [
    { label: t('sharedReviews.totalCards'), value: s.total_cards, cls: 'text-foreground' },
    { label: t('sharedReviews.completed'), value: s.completed_cards, cls: 'text-accent' },
    { label: t('sharedReviews.correct'), value: s.correct_count, cls: 'text-success' },
    { label: t('sharedReviews.incorrect'), value: s.incorrect_count, cls: 'text-error' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}
      <div>
        <h1 className="text-xl font-bold" dir="auto">
          {s.session_name || t('sharedReviews.defaultName')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('sharedReviews.sharedBy')} {name} ·{' '}
          {new Date(shared_at).toLocaleDateString(i18n.language, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{x.label}</p>
            <p className={`mt-1 text-2xl font-extrabold tabular-nums ${x.cls}`}>{x.value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {t('sharedReviews.accuracyRate')}
        </p>
        <p className="text-2xl font-extrabold tabular-nums">{acc}%</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-bold">{t('sharedReviews.cardsHeading')}</h2>
        {cards.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('sharedReviews.noCards')}
          </p>
        ) : (
          <ul className="space-y-3">
            {cards.map((c, i) => (
              <li key={c.id} className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t('sharedReviews.cardN', { n: i + 1 })}
                  </span>
                  {c.session_result &&
                    (c.session_result.was_correct ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <Check className="h-3 w-3" /> {t('sharedReviews.correct')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-error/40 bg-error/10 px-2.5 py-0.5 text-xs font-semibold text-error">
                        <X className="h-3 w-3" /> {t('sharedReviews.incorrect')}
                      </span>
                    ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                      {t('card.front')}
                    </p>
                    <p className="text-sm font-semibold" dir="auto">
                      {c.front_text}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                      {t('card.back')}
                    </p>
                    <p className="text-sm font-semibold" dir="auto">
                      {c.back_text}
                    </p>
                  </div>
                </div>
                {c.session_result && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('sharedReviews.responseTime', { ms: c.session_result.response_time_ms })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
