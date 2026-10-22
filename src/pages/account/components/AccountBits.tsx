import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2, LogIn, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useAuthStore } from '@/stores/authStore';
import { accountErrorText } from '@/lib/account/errors';
import { cn } from '@/lib/utils';

/** The `account` namespace with a helper that turns a backend error into a sentence. */
export function useAccountT() {
  const { t, i18n } = useTranslation('account');
  const errorText = (err: unknown) =>
    accountErrorText(
      err,
      (k) => t(k),
      (k) => i18n.exists(`account:${k}`),
    );
  return { t, i18n, errorText };
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)} role="status">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorLine({
  message,
  onDismiss,
  onRetry,
  retryLabel,
}: {
  message: string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="outline" size="xs" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-sm p-0.5 hover:bg-error/20"
          aria-label="close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** What every account page shows when nobody is signed in. */
export function SignedOutPrompt({ icon, title }: { icon?: typeof LogIn; title?: string }) {
  const { t } = useAccountT();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <EmptyState
        icon={icon ?? LogIn}
        title={title ?? t('desk.signedOut.title')}
        body={t('desk.signedOut.body')}
        action={
          <>
            <Button variant="accent" onClick={() => setOpen(true)}>
              <LogIn />
              {t('desk.signedOut.button')}
            </Button>
            <SignInDialog open={open} onOpenChange={setOpen} />
          </>
        }
      />
    </Card>
  );
}

/** Wraps an account page: signed-out prompt, or the content once there is a session. */
export function RequireSession({ children, icon }: { children: ReactNode; icon?: typeof LogIn }) {
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.isLoading);
  if (loading) return <Spinner />;
  if (!session) return <SignedOutPrompt icon={icon} />;
  return <>{children}</>;
}

/** A small "which numbers are these" label. */
export function SourceBadge({ source }: { source: 'account' | 'local' }) {
  const { t } = useAccountT();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        source === 'account'
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {t(source === 'account' ? 'desk.source.account' : 'desk.source.local')}
    </span>
  );
}

export function CardTitleRow({
  icon: Icon,
  title,
  right,
}: {
  icon: typeof LogIn;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-accent/10">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold text-foreground">{title}</span>
      <span className="ms-auto flex items-center gap-2">{right}</span>
    </div>
  );
}
