import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/common/InlineError';
import { cn } from '@/lib/utils';
import { deckHistory, type DeckSession } from '../lib/deckLocal';
import { useErrorText } from '../lib/useErrorText';

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-success/15 text-success',
  active: 'bg-accent/10 text-accent',
  abandoned: 'bg-muted text-muted-foreground',
};

/** Past study sessions of one deck: when, how many cards, how accurate. */
export function ReviewHistoryDialog({
  deckId,
  open,
  onClose,
}: {
  deckId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('decks');
  const errorText = useErrorText();
  const [sessions, setSessions] = useState<DeckSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSessions(null);
    setError(null);
    deckHistory(deckId)
      .then(setSessions)
      .catch((e) => setError(errorText(e)));
  }, [open, deckId, errorText]);

  const when = (iso: string) => {
    const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (days <= 0) return t('history.today');
    if (days === 1) return t('history.yesterday');
    if (days < 7) return t('history.daysAgo', { count: days });
    if (days < 30) return t('history.weeksAgo', { count: Math.floor(days / 7) });
    return date.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary-light" />
            {t('history.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="-mx-2 overflow-y-auto px-2">
          <InlineError message={error} />
          {!sessions && !error ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : sessions && sessions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mb-1 text-sm font-medium">{t('history.emptyTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('history.emptyDesc')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sessions?.map((s) => {
                const accuracy = s.completed > 0 ? Math.round((s.correct / s.completed) * 100) : 0;
                return (
                  <li key={s.id} className="flex flex-col gap-1 px-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          STATUS_STYLE[s.status] ?? STATUS_STYLE.abandoned,
                        )}
                      >
                        {t(`history.status.${s.status}`)}
                      </span>
                      <span className="text-xs text-muted-foreground">{when(s.started_at)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      <span>
                        <b className="font-semibold text-foreground">
                          {s.completed}/{s.total}
                        </b>{' '}
                        {t('history.cards')}
                      </span>
                      <span>
                        <b className="font-semibold text-foreground">{accuracy}%</b>{' '}
                        {t('history.accuracy')}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
