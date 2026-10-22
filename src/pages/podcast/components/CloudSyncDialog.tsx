import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Cloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Globe,
  MonitorPlay,
  LogIn,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { parseCloudError, isAuthError, cloudErrorText } from '@/lib/cloudError';
import { useTranslation } from 'react-i18next';

interface CloudSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  episodeId: string;
  episodeTitle: string;
}

type SyncStatus = 'idle' | 'syncing' | 'success' | 'already_synced' | 'error' | 'auth_required';

export function CloudSyncDialog({
  open,
  onOpenChange,
  episodeId,
  episodeTitle,
}: CloudSyncDialogProps) {
  const { t } = useTranslation('podcastUi');
  const session = useAuthStore((s) => s.session);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const handleSync = async () => {
    setStatus('syncing');
    setError(null);

    try {
      const result = await invoke<{ status: string; job_id?: string; segment_count?: number }>(
        'podcast_sync_to_cloud',
        { episodeId },
      );

      if (result.status === 'already_processed' || result.status === 'already_queued') {
        setStatus('already_synced');
      } else {
        setStatus('success');
      }
    } catch (err) {
      const parsed = parseCloudError(err);
      if (isAuthError(parsed)) {
        setStatus('auth_required');
      } else {
        setStatus('error');
        setError(cloudErrorText(parsed));
      }
    }
  };

  const handleClose = () => {
    if (status !== 'syncing') {
      onOpenChange(false);
      // Reset state after close animation
      setTimeout(() => {
        setStatus('idle');
        setError(null);
      }, 200);
    }
  };

  const needsSignIn = !session || status === 'auth_required';

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-primary" />
              {t('cloudSync.title')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground line-clamp-1">{episodeTitle}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Signed out (or session expired mid-sync) — offer in-place sign-in */}
          {needsSignIn && status !== 'syncing' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {status === 'auth_required'
                    ? t('cloudSync.sessionExpired')
                    : t('cloudSync.signInRequired')}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {t('cloudSync.signInExplain')}
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={handleClose}>
                  {t('shared.cancel')}
                </Button>
                <Button onClick={() => setSignInOpen(true)} className="gap-1.5">
                  <LogIn className="w-4 h-4" />
                  {t('cloudSync.signIn')}
                </Button>
              </div>
            </div>
          )}

          {/* Idle — show explanation + sync button */}
          {!needsSignIn && status === 'idle' && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('cloudSync.intro')}
              </p>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
                  <Smartphone className="w-4.5 h-4.5 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('cloudSync.mobileApp')}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('cloudSync.mobileAppHint')}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
                  <Globe className="w-4.5 h-4.5 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('cloudSync.webDashboard')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('cloudSync.webDashboardHint')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
                  <MonitorPlay className="w-4.5 h-4.5 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('cloudSync.browserExtension')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('cloudSync.browserExtensionHint')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSync} className="gap-1.5">
                  <Cloud className="w-4 h-4" />
                  {t('cloudSync.syncButton')}
                </Button>
              </div>
            </div>
          )}

          {/* Syncing */}
          {status === 'syncing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('cloudSync.uploading')}</p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t('cloudSync.successTitle')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('cloudSync.successHint')}</p>
              </div>
              <Button variant="outline" onClick={handleClose} className="mt-2">
                {t('shared.done')}
              </Button>
            </div>
          )}

          {/* Already synced */}
          {status === 'already_synced' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t('cloudSync.alreadyTitle')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('cloudSync.alreadyHint')}</p>
              </div>
              <Button variant="outline" onClick={handleClose} className="mt-2">
                {t('cloudSync.gotIt')}
              </Button>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t('cloudSync.failedTitle')}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">{error}</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={handleClose}>
                  {t('shared.cancel')}
                </Button>
                <Button onClick={handleSync}>{t('shared.retry')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description={t('cloudSync.signInDescription')}
        onSignedIn={() => {
          // Back to the normal flow — the user can now hit Sync.
          setStatus('idle');
          setError(null);
        }}
      />
    </>
  );
}
