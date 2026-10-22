import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { cn } from '@/lib/utils';

/**
 * What a signed-out viewer sees where music would be. A song's interactive subtitle is its lyrics, so
 * music stays behind sign-in — the backend does not return those rows to an anonymous caller at all,
 * so there is nothing behind this card to show. Signing in happens in place; the lists refetch after.
 */
export function SignInForMusic({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('videos');
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-border bg-card text-center',
        compact ? 'px-6 py-8' : 'px-6 py-14',
      )}
    >
      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Music className="h-6 w-6 text-primary" />
        <Lock className="absolute -bottom-0.5 -end-0.5 h-4 w-4 rounded-full bg-card p-0.5 text-accent" />
      </span>
      <p className="text-base font-bold text-foreground">{t('music.signInTitle')}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{t('music.signInBody')}</p>
      <Button variant="accent" onClick={() => setOpen(true)}>
        {t('music.signIn')}
      </Button>
      <SignInDialog open={open} onOpenChange={setOpen} description={t('music.signInBody')} />
    </div>
  );
}
