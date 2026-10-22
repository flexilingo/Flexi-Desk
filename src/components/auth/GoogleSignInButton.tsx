import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { googleErrorKey } from './authError';

/**
 * "Continue with Google": the browser opens Google's page, and this window waits until
 * the browser sends the person back (up to three minutes). Hidden when this build has no
 * Google client configured. Email sign-in stays available beside it.
 */
export function GoogleSignInButton({ onSignedIn }: { onSignedIn?: () => void }) {
  const { t } = useTranslation('account');
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    invoke<boolean>('auth_google_available')
      .then((v) => live && setAvailable(v))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, []);

  if (!available) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      onSignedIn?.();
    } catch (e) {
      const key = googleErrorKey(e);
      // Pressing "Cancel" in the browser is not an error worth shouting about.
      setError(key === 'GOOGLE_CANCELLED' ? null : t(`desk.oauth.errors.${key}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => void run()}
        loading={busy}
        className="w-fit"
      >
        {!busy && (
          <span className="font-bold text-accent" aria-hidden>
            G
          </span>
        )}
        {busy ? t('desk.oauth.waiting') : t('desk.oauth.google')}
      </Button>
      {busy && <p className="text-xs text-muted-foreground">{t('desk.oauth.hint')}</p>}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <p className="text-xs text-caption">{t('desk.oauth.or')}</p>
    </div>
  );
}
