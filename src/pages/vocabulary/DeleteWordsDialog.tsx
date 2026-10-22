import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineError } from '@/components/common/InlineError';
import { errorCode } from '@/pages/notes/notesApi';
import { deleteWords } from './vocabApi';
import type { VocabItem } from './vocabLogic';
import { splitByStore } from './vocabLogic';

interface Props {
  words: VocabItem[] | null;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}

/**
 * Delete words from this computer's store. A word that only the account knows is not
 * touched (the account's history has no delete), and the dialog says so.
 */
export function DeleteWordsDialog({ words, onClose, onDeleted }: Props) {
  const { t } = useTranslation('vocabulary');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { local, accountOnly } = splitByStore(words ?? []);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteWords(local.map((w) => w.local!.id));
      await onDeleted();
      onClose();
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={words !== null} onOpenChange={(o) => !o && !deleting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteTitle', { count: local.length })}</DialogTitle>
          <DialogDescription>{t('deleteDescription')}</DialogDescription>
        </DialogHeader>
        {accountOnly.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('deleteAccountOnly', { count: accountOnly.length })}
          </p>
        )}
        {error && <InlineError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            loading={deleting}
            disabled={local.length === 0}
          >
            {deleting ? t('deleting') : t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
