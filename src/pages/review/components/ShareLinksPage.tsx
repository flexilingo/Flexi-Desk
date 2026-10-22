import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  GitFork,
  Link2,
  Loader2,
  LogIn,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineError } from '@/components/common/InlineError';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import {
  isShareActive,
  listShares,
  revokeShare,
  shareUrlFor,
  type DeckShare,
} from '../lib/deckCloud';
import { useErrorText } from '../lib/useErrorText';
import { PageBack } from './parts/PageBack';

/** The links I have made: live or not, expiry, views, saves; copy, revoke after a confirm. */
export function ShareLinksPage() {
  const { t, i18n } = useTranslation('decks');
  const errorText = useErrorText();
  const signedIn = useAuthStore((s) => !!s.session);
  const [shares, setShares] = useState<DeckShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [target, setTarget] = useState<DeckShare | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setShares(await listShares());
    } catch (e) {
      setError(errorText(e));
      setShares([]);
    }
  }, [errorText]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  const copy = async (s: DeckShare) => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(s.share_code, 'en'));
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError(t('share.copyFailed'));
    }
  };

  const confirmRevoke = async () => {
    if (!target) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await revokeShare(target.id);
      setTarget(null);
      await load();
    } catch (e) {
      setRevokeError(errorText(e));
    } finally {
      setRevoking(false);
    }
  };

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageBack to="/review" label={t('backToDecks')} />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Link2 className="h-6 w-6 text-accent" />
          {t('shareLinks.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('shareLinks.description')}</p>
      </div>

      {!signedIn ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 text-sm">
          <p>{t('share.signInNeeded')}</p>
          <Button size="sm" asChild>
            <Link to="/settings">
              <LogIn className="h-4 w-4" />
              {t('share.goToSettings')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <InlineError message={error} onDismiss={() => setError(null)} />
          {shares === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </div>
          ) : shares.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border bg-card px-8 py-12 text-center">
              <Link2 className="mx-auto mb-3 h-8 w-8 text-accent" />
              <h3 className="mb-1 text-base font-bold">{t('shareLinks.none')}</h3>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                {t('shareLinks.noneHint')}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {shares.map((s) => {
                const active = isShareActive(s);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'rounded-xl border border-border bg-card p-4',
                      !active && 'opacity-70',
                    )}
                  >
                    <div className="mb-2.5 flex flex-wrap items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-bold" dir="auto">
                        {s.deck?.title ?? t('shareLinks.deckFallback')}
                      </h3>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
                          active ? 'bg-success/15 text-success' : 'bg-accent/10 text-accent',
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            active ? 'bg-success' : 'bg-accent',
                          )}
                        />
                        {active ? t('shareLinks.active') : t('shareLinks.inactive')}
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                        {s.expires_at
                          ? t('shareLinks.expiresAt', { date: date(s.expires_at) })
                          : t('shareLinks.neverExpires')}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-accent">
                        <Eye className="h-3 w-3" />
                        {t('shareLinks.views', { count: s.view_count })}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary-light/10 px-2 py-0.5 text-primary-light">
                        <GitFork className="h-3 w-3" />
                        {t('shareLinks.clones', { count: s.clone_count })}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        readOnly
                        value={shareUrlFor(s.share_code, 'en')}
                        className="min-w-[12rem] flex-1 font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button size="sm" variant="outline" onClick={() => copy(s)}>
                        {copiedId === s.id ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copiedId === s.id ? t('share.copied') : t('share.copy')}
                      </Button>
                      {active && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setRevokeError(null);
                            setTarget(s);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t('shareLinks.revoke')}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && !revoking && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-error" />
              {t('shareLinks.revoke')}
            </DialogTitle>
            <DialogDescription>
              {t('shareLinks.revokeConfirm')}{' '}
              <b className="text-foreground" dir="auto">
                {target?.deck?.title}
              </b>
            </DialogDescription>
          </DialogHeader>
          <InlineError message={revokeError} onDismiss={() => setRevokeError(null)} />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={revoking}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmRevoke} disabled={revoking}>
              {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
              {revoking ? t('shareLinks.revoking') : t('shareLinks.revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
