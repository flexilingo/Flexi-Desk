import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Saved podcasts and history live on the FlexiLingo account. Everything else in
 * this app works signed-out and offline — only these two tabs need a session.
 */
export function SignedOutNotice({ message }: { message: string }) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <LogIn className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{t('podcast.signInRequired')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
