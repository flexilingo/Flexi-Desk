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
              Sync to FlexiLingo Cloud
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
                  {status === 'auth_required' ? 'Your session has expired' : 'Sign in required'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Cloud sync stores this episode's analysis on your FlexiLingo account so it appears
                  on your other devices. Sign in with your email to continue.
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={() => setSignInOpen(true)} className="gap-1.5">
                  <LogIn className="w-4 h-4" />
                  Sign in
                </Button>
              </div>
            </div>
          )}

          {/* Idle — show explanation + sync button */}
          {!needsSignIn && status === 'idle' && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload this episode's subtitles to the cloud. Our AI will then run a deep language
                analysis (grammar patterns, vocabulary stats, CEFR levels, collocations, exercises)
                and make everything available across your devices:
              </p>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
                  <Smartphone className="w-4.5 h-4.5 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Mobile App</p>
                    <p className="text-xs text-muted-foreground">
                      Study vocabulary and review flashcards on the go
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
                  <Globe className="w-4.5 h-4.5 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Web Dashboard</p>
                    <p className="text-xs text-muted-foreground">
                      View detailed analysis, track progress, manage your library
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50">
                  <MonitorPlay className="w-4.5 h-4.5 text-accent mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Browser Extension</p>
                    <p className="text-xs text-muted-foreground">
                      Access your learned words while browsing any website
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSync} className="gap-1.5">
                  <Cloud className="w-4 h-4" />
                  Sync Subtitles to Cloud
                </Button>
              </div>
            </div>
          )}

          {/* Syncing */}
          {status === 'syncing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading subtitles...</p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Synced Successfully!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  NLP analysis will run automatically in the background. Results will appear on your
                  other devices shortly.
                </p>
              </div>
              <Button variant="outline" onClick={handleClose} className="mt-2">
                Done
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
                <p className="text-sm font-medium text-foreground">Already Synced</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This episode has already been synced to the cloud.
                </p>
              </div>
              <Button variant="outline" onClick={handleClose} className="mt-2">
                Got it
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
                <p className="text-sm font-medium text-foreground">Sync Failed</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">{error}</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleSync}>Retry</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        description="Sign in to sync this episode to your FlexiLingo account."
        onSignedIn={() => {
          // Back to the normal flow — the user can now hit Sync.
          setStatus('idle');
          setError(null);
        }}
      />
    </>
  );
}
