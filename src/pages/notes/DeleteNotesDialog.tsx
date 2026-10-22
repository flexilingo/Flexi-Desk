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

interface Props {
  open: boolean;
  /** How many of the notes to delete live in each place. */
  device: number;
  account: number;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

/** Names exactly where the notes will be deleted from; stays open until the delete has succeeded. */
export function DeleteNotesDialog({
  open,
  device,
  account,
  deleting,
  error,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation('notes');
  const total = device + account;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !deleting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{total > 1 ? t('bulkDelete') : t('deleteTitle')}</DialogTitle>
          <DialogDescription>
            {total > 1 ? t('bulkDeleteConfirm', { count: total }) : t('deleteDescription')}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm text-foreground">
          {device > 0 && <li>{t('deleteFromDevice', { count: device })}</li>}
          {account > 0 && <li>{t('deleteFromAccount', { count: account })}</li>}
        </ul>
        {error && <InlineError message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            {t('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={deleting}>
            {deleting ? t('deleting') : total > 1 ? t('bulkDelete') : t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
