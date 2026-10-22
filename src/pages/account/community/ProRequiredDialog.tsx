import { Crown, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAccountT } from '../components/AccountBits';

/** "This needs Pro": what Pro adds, and the way to the plan page. */
export function ProRequiredDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAccountT();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Crown className="h-7 w-7 text-accent" />
          </div>
          <DialogTitle className="text-center text-xl font-extrabold">
            {t('community.proRequired.title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('community.proRequired.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4">
          {(['feature1', 'feature2', 'feature3'] as const).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Sparkles className="h-4 w-4 text-accent" />
              </span>
              <p className="text-sm text-muted-foreground">{t(`community.proRequired.${k}`)}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 pt-1">
          <Button
            variant="accent"
            onClick={() => {
              onClose();
              navigate('/subscription');
            }}
          >
            <Crown />
            {t('community.proRequired.upgradeButton')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('community.proRequired.maybeLater')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
