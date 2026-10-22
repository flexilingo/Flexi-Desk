import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Globe, Link2, Loader2, Lock, LogIn, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useReviewStore } from '../stores/reviewStore';
import type { DeckWithStats } from '../types';
import { createShareLink, publishDeck, type PublishStep, type ShareLink } from '../lib/deckCloud';
import { SHARE_EXPIRY_DAYS, shareAvailability } from '../lib/deckLogic';
import { useErrorText } from '../lib/useErrorText';
import { Toggle } from './parts/Toggle';

interface Props {
  deck: DeckWithStats;
  open: boolean;
  onClose: () => void;
}

/**
 * Publish / Share. A link points at the website's copy of the deck, so opening this dialog
 * first pushes the local deck there (creating it, or topping it up), then asks for a link.
 */
export function SharePublishDialog({ deck, open, onClose }: Props) {
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const signedIn = useAuthStore((s) => !!s.session);
  const applyDeck = useReviewStore((s) => s.applyDeck);

  const availability = shareAvailability({
    signedIn,
    cardCount: deck.cardCount,
    cloudDeckId: deck.cloudDeckId,
  });

  const [cloudId, setCloudId] = useState<string | null>(deck.cloudDeckId ?? null);
  const [isPublic, setIsPublic] = useState(deck.isPublic);
  const [sourcePublic, setSourcePublic] = useState(deck.sourcePublic);
  const [clones, setClones] = useState(deck.totalClones);
  const [includeSource, setIncludeSource] = useState(false);
  const [expiry, setExpiry] = useState<number | null>(null);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [step, setStep] = useState<PublishStep | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const makeLink = useCallback(
    async (id: string, source: boolean, days: number | null) => {
      setLinkBusy(true);
      setError(null);
      try {
        setLink(await createShareLink(id, { includeSource: source, expiresInDays: days }));
        setCopied(false);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLinkBusy(false);
      }
    },
    [errorText],
  );

  const pushThenLink = useCallback(async () => {
    setError(null);
    setLinkBusy(true);
    try {
      const res = await publishDeck(deck.id, { onStep: setStep });
      applyDeck(res.deck);
      setCloudId(res.cloudDeckId);
      setClones(res.totalClones);
      setStep(null);
      await makeLink(res.cloudDeckId, includeSource, expiry);
    } catch (e) {
      setStep(null);
      setLinkBusy(false);
      setError(errorText(e));
    }
  }, [deck.id, applyDeck, makeLink, includeSource, expiry, errorText]);

  // Opening the dialog pushes the deck and asks for a link, once.
  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    setIsPublic(deck.isPublic);
    setSourcePublic(deck.sourcePublic);
    setLink(null);
    setPublished(false);
    setError(null);
    if (availability !== 'sign-in' && availability !== 'empty' && !started.current) {
      started.current = true;
      void pushThenLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const togglePublic = async (checked: boolean) => {
    setToggleBusy(true);
    setError(null);
    setPublished(false);
    try {
      const res = await publishDeck(deck.id, { visibility: { isPublic: checked, sourcePublic } });
      applyDeck(res.deck);
      setCloudId(res.cloudDeckId);
      setIsPublic(checked);
      setPublished(checked);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setToggleBusy(false);
    }
  };

  const toggleSourcePublic = async (checked: boolean) => {
    setToggleBusy(true);
    setError(null);
    try {
      const res = await publishDeck(deck.id, { visibility: { isPublic, sourcePublic: checked } });
      applyDeck(res.deck);
      setSourcePublic(checked);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setToggleBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('share.copyFailed'));
    }
  };

  const hasSource = !!deck.sourceUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !linkBusy && !toggleBusy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            {t('share.title')}
          </DialogTitle>
          <DialogDescription>{t('share.description')}</DialogDescription>
        </DialogHeader>

        {availability === 'sign-in' && (
          <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">
            <p>{t('share.signInNeeded')}</p>
            <Button
              size="sm"
              onClick={() => {
                onClose();
                navigate('/settings');
              }}
            >
              <LogIn className="h-4 w-4" />
              {t('share.goToSettings')}
            </Button>
          </div>
        )}
        {availability === 'empty' && (
          <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm">
            {t('share.needsCards')}
          </p>
        )}

        {availability !== 'sign-in' && availability !== 'empty' && (
          <div className="space-y-5 py-1">
            {/* Publish to Explore */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {isPublic ? (
                    <Globe className="h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <label
                      htmlFor="publish-toggle"
                      className="cursor-pointer text-sm font-semibold"
                    >
                      {t('share.publishToExplore')}
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('share.publishToExploreDesc')}
                    </p>
                  </div>
                </div>
                <Toggle
                  id="publish-toggle"
                  checked={isPublic}
                  onCheckedChange={togglePublic}
                  disabled={toggleBusy || linkBusy || !cloudId}
                  label={t('share.publishToExplore')}
                />
              </div>
              {published && (
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                  <Check className="h-4 w-4 shrink-0" />
                  {t('share.publishedSuccess')}
                </div>
              )}
              {isPublic && clones > 0 && !published && (
                <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/10 p-3 text-sm text-accent">
                  <Users className="h-4 w-4 shrink-0" />
                  {t('share.clonedBy', { count: clones })}
                </div>
              )}
              {hasSource && isPublic && (
                <SwitchRow
                  id="source-public"
                  title={t('share.sourcePublic')}
                  desc={t('share.sourcePublicDesc')}
                  checked={sourcePublic}
                  onChange={toggleSourcePublic}
                  disabled={toggleBusy || linkBusy}
                />
              )}
            </div>

            <div className="border-t border-border" />

            {/* Share a link */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                {t('share.aLink')}
              </div>
              <p className="text-xs text-muted-foreground">{t('share.linkDesc')}</p>

              {hasSource && (
                <SwitchRow
                  id="include-source"
                  title={t('share.includeSource')}
                  desc={t('share.includeSourceDesc')}
                  checked={includeSource}
                  onChange={(v) => {
                    setIncludeSource(v);
                    if (cloudId) void makeLink(cloudId, v, expiry);
                  }}
                  disabled={linkBusy || !cloudId}
                />
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('share.expiry')}
                </label>
                <Select
                  value={expiry === null ? 'never' : String(expiry)}
                  onValueChange={(v) => {
                    const days = v === 'never' ? null : Number(v);
                    setExpiry(days);
                    if (cloudId) void makeLink(cloudId, includeSource, days);
                  }}
                  disabled={linkBusy || !cloudId}
                >
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHARE_EXPIRY_DAYS.map((d) => (
                      <SelectItem key={String(d)} value={d === null ? 'never' : String(d)}>
                        {d === null ? t('share.never') : t('share.days', { count: d })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {linkBusy ? (
                <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  {step ? t(`share.step.${step}`) : t('share.creating')}
                </div>
              ) : link ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={link.share_url}
                      className="flex-1 font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button size="sm" variant={copied ? 'outline' : 'default'} onClick={copy}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? t('share.copied') : t('share.copy')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openUrl(link.share_url)}
                    >
                      {t('share.open')}
                    </Button>
                  </div>
                  {link.expires_at && (
                    <p className="text-xs text-muted-foreground">
                      {t('share.validUntil', {
                        date: new Date(link.expires_at).toLocaleDateString(),
                      })}
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <InlineError message={error} onDismiss={() => setError(null)} />
            {error && !linkBusy && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  cloudId ? void makeLink(cloudId, includeSource, expiry) : void pushThenLink()
                }
              >
                {t('retry')}
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={linkBusy || toggleBusy}>
            {t('share.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({
  id,
  title,
  desc,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {title}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Toggle
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        label={title}
      />
    </div>
  );
}
