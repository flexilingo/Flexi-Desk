import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WhisperSetup } from '@/pages/caption/components/WhisperSetup';

interface WhisperSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WhisperSettingsDialog({ open, onClose }: WhisperSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Whisper Model Settings</DialogTitle>
        </DialogHeader>
        <WhisperSetup />
      </DialogContent>
    </Dialog>
  );
}
