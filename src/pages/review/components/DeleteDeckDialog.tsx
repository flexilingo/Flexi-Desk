import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { useReviewStore } from '../stores/reviewStore';
import { isDeleteConfirmed } from '../lib/deckLogic';
import { useErrorText } from '../lib/useErrorText';

interface Props {
  deck: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/** Deleting a deck means typing the word "delete" (or its translation) first. */
export function DeleteDeckDialog({ deck, onClose, onDeleted }: Props) {
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const deleteDeck = useReviewStore((s) => s.deleteDeck);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTyped('');
    setError(null);
  }, [deck?.id]);

  const confirmed = isDeleteConfirmed(typed, t('delete.word'));

  const run = async () => {
    if (!deck || !confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDeck(deck.id);
      onDeleted?.();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!deck} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <DialogTitle>{t('delete.title')}</DialogTitle>
          </div>
          <DialogDescription>{t('delete.description')}</DialogDescription>
          {deck && (
            <p className="mt-2 truncate rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium">
              {deck.name}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label htmlFor="delete-confirm" className="block text-sm font-medium">
            {t('delete.confirmText', { word: t('delete.word') })}
          </label>
          <Input
            id="delete-confirm"
            value={typed}
            autoFocus
            disabled={busy}
            placeholder={t('delete.placeholder')}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className={typed && !confirmed ? 'border-error' : undefined}
          />
          {typed && !confirmed && (
            <p className="text-xs text-error">{t('delete.mismatch', { word: t('delete.word') })}</p>
          )}
          <InlineError message={error} onDismiss={() => setError(null)} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={run} disabled={!confirmed || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
