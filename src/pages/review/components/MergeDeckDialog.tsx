import { useState } from 'react';
import { AlertTriangle, Loader2, Merge } from 'lucide-react';
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
import { InlineError } from '@/components/common/InlineError';
import { useReviewStore } from '../stores/reviewStore';
import type { DeckWithStats } from '../types';
import { useErrorText } from '../lib/useErrorText';

interface MergeDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckWithStats[];
  onMerged: () => void;
}

const SELECT =
  'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

export function MergeDeckDialog({ open, onOpenChange, decks, onMerged }: MergeDeckDialogProps) {
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const mergeDecks = useReviewStore((s) => s.mergeDecks);
  const [sourceDeckId, setSourceDeckId] = useState('');
  const [targetDeckId, setTargetDeckId] = useState('');
  const [deleteSource, setDeleteSource] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceDeck = decks.find((d) => d.id === sourceDeckId);
  const targetDeck = decks.find((d) => d.id === targetDeckId);
  const canMerge = !!sourceDeckId && !!targetDeckId && sourceDeckId !== targetDeckId;

  const handleMerge = async () => {
    if (!canMerge) return;
    setBusy(true);
    setError(null);
    try {
      await mergeDecks(sourceDeckId, targetDeckId, deleteSource);
      setSourceDeckId('');
      setTargetDeckId('');
      onMerged();
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            {t('merge.title')}
          </DialogTitle>
          <DialogDescription>{t('merge.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="merge-source" className="text-sm font-medium">
              {t('merge.source')}
            </label>
            <select
              id="merge-source"
              value={sourceDeckId}
              disabled={busy}
              onChange={(e) => setSourceDeckId(e.target.value)}
              className={SELECT}
            >
              <option value="">{t('merge.selectSource')}</option>
              {decks
                .filter((d) => d.id !== targetDeckId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({t('cardsCount', { count: d.cardCount })})
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="merge-target" className="text-sm font-medium">
              {t('merge.target')}
            </label>
            <select
              id="merge-target"
              value={targetDeckId}
              disabled={busy}
              onChange={(e) => setTargetDeckId(e.target.value)}
              className={SELECT}
            >
              <option value="">{t('merge.selectTarget')}</option>
              {decks
                .filter((d) => d.id !== sourceDeckId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({t('cardsCount', { count: d.cardCount })})
                  </option>
                ))}
            </select>
          </div>

          {sourceDeck && targetDeck && sourceDeck.algorithm !== targetDeck.algorithm && (
            <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t('merge.algorithmSwitch', {
                  from: sourceDeck.algorithm.toUpperCase(),
                  to: targetDeck.algorithm.toUpperCase(),
                })}
              </span>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={deleteSource}
              disabled={busy}
              onChange={(e) => setDeleteSource(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">{t('merge.deleteSource')}</span>
          </label>
          <InlineError message={error} onDismiss={() => setError(null)} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button onClick={handleMerge} disabled={!canMerge || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t('merge.merging') : t('merge.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
