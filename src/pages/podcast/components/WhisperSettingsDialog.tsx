import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WhisperSetup } from '@/pages/caption/components/WhisperSetup';
import { useTranslation } from 'react-i18next';

interface WhisperSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WhisperSettingsDialog({ open, onClose }: WhisperSettingsDialogProps) {
  const { t } = useTranslation('podcastUi');
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('whisperDialog.title')}</DialogTitle>
        </DialogHeader>
        <WhisperSetup />
      </DialogContent>
    </Dialog>
  );
}
