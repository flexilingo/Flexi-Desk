import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * A scanned page clicked before its words have arrived.
 *
 * The page looks finished — it is the whole picture of the print — so a click
 * that does nothing reads as broken. This says the page is being read, and the
 * owner closes it the moment the page's words land (`open` goes false), so the
 * reader is left looking at a page that now answers.
 */
export function PdfPageWorkingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('reader');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-sm">
        <div className="mb-3 flex items-center gap-3 pr-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </span>
          <DialogTitle className="text-[15px] leading-snug">{t('pdf.ocr.pageWorking')}</DialogTitle>
        </div>
        <DialogDescription className="mb-5 leading-relaxed">
          {t('pdf.ocr.pageWorkingBody')}
        </DialogDescription>
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button variant="outline" size="md">
              {t('pdf.ocr.dismiss')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
