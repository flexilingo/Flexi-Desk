import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crown,
  Gauge,
  Gift,
  HeartHandshake,
  Languages,
  Layers,
  MessageCircleQuestion,
  MessageSquare,
  Minus,
  Receipt,
  Rocket,
  ScanText,
  Sparkles,
  ThumbsUp,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  activateProGift,
  createPortalSession,
  createSubscriptionCheckout,
  createTopupCheckout,
  getPlanFeatures,
  getTopupPackages,
  getUsageBalance,
  startTrial,
  upgradeSubscription,
} from '@/lib/account/api';
import {
  LIFETIME_PLAN_ID,
  PRO_PLAN_ID,
  formatPrice,
  limitText,
  meterRows,
  numberFormatter,
  parseGiftToken,
  planView,
  sameLimit,
  shouldRefreshOnFocus,
  tierRefresh,
} from '@/lib/account/subscription';
import type { PlanFeaturesResponse, UserSubscription } from '@/lib/account/types';
import { useRemote } from '@/hooks/useRemote';
import { cn } from '@/lib/utils';
import {
  ErrorLine,
  SignedOutPrompt,
  Spinner,
  useAccountT,
} from '@/pages/account/components/AccountBits';

const BAR = { ok: 'bg-primary', near: 'bg-warning', spent: 'bg-error' } as const;

export function SubscriptionPage() {
  const { t, i18n, errorText } = useAccountT();
  const ts = (k: string, v?: Record<string, unknown>) => t(`subscription.${k}`, v);
  const tp = (k: string, v?: Record<string, unknown>) => t(`subscription.proPage.${k}`, v);
  const locale = i18n.language;
  const num = numberFormatter(locale);
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;
  const sub = useSubscriptionStore((s) => s.subscription);
  const subLoading = useSubscriptionStore((s) => s.isLoading);
  const resolved = useSubscriptionStore((s) => s.hasResolved);
  const subError = useSubscriptionStore((s) => s.error);
  const fetchSub = useSubscriptionStore((s) => s.fetchSubscription);

  const usage = useRemote(() => getUsageBalance(), [session?.user_id], signedIn);
  const plan = useRemote(() => getPlanFeatures(), [], true);
  const view = planView(sub);
  const topups = useRemote(
    () => getTopupPackages(),
    [view.isPaid, usage.data?.canBuyTopup],
    signedIn && view.isPaid && !!usage.data?.canBuyTopup,
  );

  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyPkg, setBusyPkg] = useState<string | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  // A payment window was opened; the page re-asks when the app gets focus again.
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<'updated' | 'notYet' | null>(null);
  const before = useRef<UserSubscription | null>(null);

  useEffect(() => {
    if (signedIn && !resolved && !subLoading) void fetchSub();
  }, [signedIn, resolved, subLoading, fetchSub]);

  const recheck = useCallback(async () => {
    await fetchSub();
    const after = useSubscriptionStore.getState().subscription;
    const r = tierRefresh(before.current, after);
    void usage.reload();
    if (r.changed) {
      setNote('updated');
      setPending(false);
    } else setNote('notYet');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSub]);

  useEffect(() => {
    if (!shouldRefreshOnFocus(pending, signedIn)) return;
    const onFocus = () => void recheck();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [pending, signedIn, recheck]);

  const openPayment = async (url: string) => {
    before.current = useSubscriptionStore.getState().subscription;
    setNote(null);
    await openUrl(url);
    setPending(true);
  };

  const act = async (
    key: 'plan' | 'pkg' | 'manage',
    id: string | null,
    fn: () => Promise<void>,
  ) => {
    setError(null);
    if (key === 'plan') setBusyPlan(id);
    if (key === 'pkg') setBusyPkg(id);
    if (key === 'manage') setManaging(true);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyPlan(null);
      setBusyPkg(null);
      setManaging(false);
    }
  };

  const upgrade = (planId: string) => {
    if (!signedIn) return setSignIn(true);
    void act('plan', planId, async () => {
      const r = sub?.hasStripeSubscription
        ? await upgradeSubscription(planId)
        : await createSubscriptionCheckout(planId);
      if (r.url) await openPayment(r.url);
    });
  };
  const topup = (id: string) =>
    void act('pkg', id, async () => {
      const r = await createTopupCheckout(id);
      if (r.url) await openPayment(r.url);
    });
  const manage = () =>
    void act('manage', null, async () => {
      const r = await createPortalSession();
      if (r.url) await openPayment(r.url);
    });
  const trial = async () => {
    if (!signedIn) return setSignIn(true);
    setError(null);
    setStartingTrial(true);
    try {
      await startTrial();
      await fetchSub();
      void usage.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setStartingTrial(false);
    }
  };

  if (authLoading || (signedIn && !resolved && subLoading))
    return <Spinner className="min-h-[50vh]" />;

  const data = plan.data;
  const planLabel = view.isLifetime ? ts('lifetime') : view.isProMax ? ts('proMax') : ts('pro');
  const periodEnd = sub?.periodEnd;

  return (
    <div className="flex flex-col gap-6 pb-16">
      <ErrorLine message={error} onDismiss={() => setError(null)} />
      {pending && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          <Clock className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t('desk.subscription.openedInBrowser')}</span>
          <Button size="sm" variant="outline" onClick={() => void recheck()}>
            {t('desk.subscription.checkAgain')}
          </Button>
        </div>
      )}
      {note === 'updated' && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          <CheckCircle2 className="h-4 w-4" />
          {t('desk.subscription.updated', { plan: planLabel })}
        </p>
      )}
      {note === 'notYet' && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('desk.subscription.notYet')}
        </p>
      )}

      {!signedIn ? (
        <SignedOutPrompt icon={Crown} />
      ) : subError && !sub ? (
        <ErrorLine message={ts('error')} onRetry={() => void fetchSub()} retryLabel={ts('retry')} />
      ) : view.isPaid ? (
        <>
          {PaidHero()}
          <Benefits
            data={data}
            mode="unlocked"
            extra={<CommunityTile weight={data?.fixed?.communityVoteWeight.paid} />}
          />
          {usage.data?.canBuyTopup && Topups()}
        </>
      ) : (
        <>
          {SalesHero()}
          {usage.data && Meters()}
          {plan.error && !data ? (
            <ErrorLine
              message={tp('loadFailed')}
              onRetry={() => void plan.reload()}
              retryLabel={ts('retry')}
            />
          ) : (
            <>
              <Benefits data={data} mode="sales" extra={UpgradeTile()} />
              <Compare data={data} />
              {Plans()}
            </>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <StaysFree />
            <Faq />
          </div>
        </>
      )}

      <Redeem
        signedIn={signedIn}
        onNeedSignIn={() => setSignIn(true)}
        onDone={() => {
          void fetchSub();
          void usage.reload();
        }}
      />
      <SignInDialog open={signIn} onOpenChange={setSignIn} />
    </div>
  );

  // ── sections (closures over the page state) ──
  function Price({ cls = '' }: { cls?: string }) {
    return data ? (
      <p className={cn('leading-none text-foreground', cls)}>
        <span className="text-4xl font-black tabular-nums tracking-tight">
          {formatPrice(data.pricing.pro_monthly, locale)}
        </span>
        <span className="ms-1 text-sm text-muted-foreground">{tp('perMonth')}</span>
      </p>
    ) : (
      <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
    );
  }

  function SalesHero() {
    const trialEnd = view.isTrialing ? sub?.trialEnd : null;
    const daysLeft = trialEnd
      ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86400000))
      : null;
    return (
      <Card className="overflow-hidden">
        <div className="grid items-center lg:grid-cols-[1.25fr_0.75fr]">
          <div className="flex flex-col gap-4 px-6 py-8">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {tp('eyebrow')}
            </span>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-foreground">
              {tp('heroTitle')}
            </h1>
            <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {tp('heroSubtitle')}
            </p>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              {Price({})}
              {data && (
                <p className="pb-1 text-[13px] text-muted-foreground">
                  {tp('orLifetime', { price: formatPrice(data.pricing.lifetime_onetime, locale) })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="accent"
                size="lg"
                loading={busyPlan === PRO_PLAN_ID}
                disabled={busyPlan !== null}
                onClick={() => upgrade(PRO_PLAN_ID)}
              >
                {busyPlan !== PRO_PLAN_ID && <Zap />}
                {ts('upgradeToPro')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                loading={busyPlan === LIFETIME_PLAN_ID}
                disabled={busyPlan !== null}
                onClick={() => upgrade(LIFETIME_PLAN_ID)}
              >
                {busyPlan !== LIFETIME_PLAN_ID && <Crown />}
                {ts('upgradeToLifetime')}
              </Button>
            </div>
            {view.canStartTrial && (
              <div>
                <Button
                  variant="link"
                  size="sm"
                  loading={startingTrial}
                  onClick={() => void trial()}
                >
                  {ts('startFreeTrial')}
                </Button>
              </div>
            )}
            {trialEnd && (
              <p className="text-[12.5px] font-semibold text-warning">
                {tp('trialEnds', { date: new Date(trialEnd).toLocaleDateString(locale) })}
                {daysLeft !== null && ` (${t('desk.subscription.daysLeft', { count: daysLeft })})`}
              </p>
            )}
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
              {(['cancel', 'stripe', 'keep'] as const).map((k) => (
                <li
                  key={k}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
                >
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.6} />
                  {tp(`trust.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <img
            src="/pro/hero.webp"
            alt=""
            className="mx-auto max-h-[300px] w-full object-contain p-4"
          />
        </div>
      </Card>
    );
  }

  function PaidHero() {
    const upsell = sub?.tier === 'pro' && data ? data.pricing.lifetime_onetime : null;
    return (
      <Card className="overflow-hidden">
        <div className="grid items-center lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-4 px-6 py-8">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {tp('eyebrow')}
            </span>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-foreground">
              {tp('paid.title', { plan: planLabel })}
            </h1>
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              {view.isLifetime
                ? tp('paid.lifetimeForever')
                : periodEnd
                  ? tp('paid.renews', { date: new Date(periodEnd).toLocaleDateString(locale) })
                  : ts('status.active')}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {sub?.hasStripeSubscription && (
                <Button variant="outline" loading={managing} onClick={manage}>
                  {ts('manageSubscription')}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/account/payments">
                  <Receipt />
                  {tp('paid.history')}
                </Link>
              </Button>
            </div>
            {upsell !== null && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 p-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <Crown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-[13.5px] font-bold text-foreground">
                      {tp('paid.lifetimeUpsellTitle')}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground">
                      {tp('paid.lifetimeUpsellText', { price: formatPrice(upsell, locale) })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="accent"
                  loading={busyPlan === LIFETIME_PLAN_ID}
                  disabled={busyPlan !== null}
                  onClick={() => upgrade(LIFETIME_PLAN_ID)}
                >
                  {busyPlan !== LIFETIME_PLAN_ID && <Crown />}
                  {ts('upgradeToLifetime')}
                </Button>
              </div>
            )}
          </div>
          <img
            src="/pro/hero.webp"
            alt=""
            className="mx-auto max-h-[280px] w-full object-contain p-4"
          />
        </div>
      </Card>
    );
  }

  function Meters() {
    const rows = meterRows(usage.data!);
    if (rows.length === 0) return null;
    const pro = data?.limits?.pro;
    return (
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pb-3 pt-5">
          <h2 className="text-base font-bold text-foreground">{tp('usage.title')}</h2>
          <p className="text-xs text-caption">
            {tp('usage.resets', {
              date: new Date(usage.data!.resetsAt).toLocaleDateString(locale),
            })}
          </p>
        </div>
        <ul className="grid gap-x-6 gap-y-4 px-6 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const counts = { used: num(r.used), limit: num(r.limit) };
            const status = !r.monthSpent
              ? tp(r.minutes ? 'usage.minutesOf' : 'usage.of', counts)
              : r.dailyLeft !== null && r.dailyLeft > 0
                ? tp('usage.monthSpent', { left: num(Math.floor(r.dailyLeft)) })
                : tp('usage.allSpent');
            const p = pro?.[r.plan];
            return (
              <li key={r.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    {tp(`usage.${r.key}`)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{status}</span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={r.limit}
                  aria-valuenow={Math.min(r.used, r.limit)}
                  aria-label={tp(`usage.${r.key}`)}
                >
                  <div
                    className={cn('h-full rounded-full', BAR[r.tone])}
                    style={{ width: `${Math.max(r.ratio * 100, r.ratio > 0 ? 3 : 0)}%` }}
                  />
                </div>
                {p && (
                  <span className="text-[11.5px] font-semibold text-primary">
                    {p.monthly === null
                      ? tp('usage.withPro')
                      : tp(r.minutes ? 'usage.withProMinutes' : 'usage.withProCount', {
                          limit: num(p.monthly),
                        })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  function Plans() {
    const plans = [
      {
        id: PRO_PLAN_ID,
        name: tp('plans.monthly'),
        price: data ? formatPrice(data.pricing.pro_monthly, locale) : null,
        unit: tp('perMonth'),
        note: tp('plans.monthlyNote'),
        Icon: Zap,
        cta: ts('upgradeToPro'),
        variant: 'accent' as const,
      },
      {
        id: LIFETIME_PLAN_ID,
        name: tp('plans.lifetime'),
        price: data ? formatPrice(data.pricing.lifetime_onetime, locale) : null,
        unit: tp('plans.lifetimePrice'),
        note: tp('plans.lifetimeNote'),
        Icon: Crown,
        cta: ts('upgradeToLifetime'),
        variant: 'outline' as const,
      },
    ];
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">
          {tp('plans.title')}
        </h2>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {plans.map(({ id, name, price, unit, note, Icon, cta, variant }) => (
            <Card key={id} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3 className="text-[15px] font-bold text-foreground">{name}</h3>
              </div>
              <p className="leading-none text-foreground">
                {price ? (
                  <span className="text-3xl font-black tabular-nums">{price}</span>
                ) : (
                  <span className="inline-block h-8 w-24 animate-pulse rounded bg-muted align-middle" />
                )}
                <span className="ms-1 text-[13px] text-muted-foreground">{unit}</span>
              </p>
              <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground">{note}</p>
              <div>
                <Button
                  variant={variant}
                  loading={busyPlan === id}
                  disabled={busyPlan !== null}
                  onClick={() => upgrade(id)}
                >
                  {busyPlan !== id && <Icon />}
                  {cta}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  function UpgradeTile() {
    return (
      <Card className="flex flex-col justify-center gap-3 p-6 md:col-span-2 xl:col-span-1">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-extrabold leading-snug text-foreground">
          {data
            ? tp('tile.title', { price: formatPrice(data.pricing.pro_monthly, locale) })
            : tp('tile.titleNoPrice')}
        </h3>
        {data && (
          <p className="text-[13px] text-muted-foreground">
            {tp('orLifetime', { price: formatPrice(data.pricing.lifetime_onetime, locale) })}
          </p>
        )}
        <div>
          <Button
            variant="accent"
            loading={busyPlan === PRO_PLAN_ID}
            disabled={busyPlan !== null}
            onClick={() => upgrade(PRO_PLAN_ID)}
          >
            {busyPlan !== PRO_PLAN_ID && <Zap />}
            {ts('upgradeToPro')}
          </Button>
        </div>
      </Card>
    );
  }

  function Topups() {
    return (
      <Card className="p-6">
        <h2 className="mb-1 text-base font-bold text-foreground">{ts('buyExtraHours')}</h2>
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted-foreground">
          {ts('topupDescription')}
        </p>
        {topups.loading && !topups.data ? (
          <Spinner className="py-6" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topups.data?.packages.map((pkg) => {
              const Icon = pkg.type === 'transcription' ? Clock : Video;
              return (
                <li
                  key={pkg.id}
                  className="relative flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-4 text-center"
                >
                  {pkg.isPopular && (
                    <span className="absolute -top-2.5 start-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10.5px] font-bold text-primary-foreground rtl:translate-x-1/2">
                      {ts('bestValue')}
                    </span>
                  )}
                  <Icon className="h-5 w-5 text-primary" aria-hidden />
                  <p className="text-sm font-bold text-foreground">{pkg.name}</p>
                  <p className="text-2xl font-black tabular-nums leading-none text-foreground">
                    {pkg.amount}
                    <span className="ms-1 text-xs font-normal text-muted-foreground">
                      {pkg.amountUnit}
                    </span>
                  </p>
                  <p className="mb-1 text-sm font-semibold tabular-nums text-muted-foreground">
                    {formatPrice(pkg.price, locale, pkg.currency || 'USD')}
                  </p>
                  <Button
                    variant={pkg.isPopular ? 'accent' : 'outline'}
                    loading={busyPkg === pkg.id}
                    disabled={busyPkg !== null}
                    onClick={() => topup(pkg.id)}
                  >
                    {ts('purchase')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  }
}

// ── pure presentational pieces ──────────────────────────────

interface BenefitDef {
  key: string;
  image: string;
  Icon: LucideIcon;
  lines: (
    d: PlanFeaturesResponse | null,
    t: (k: string, v?: Record<string, unknown>) => string,
    num: (n: number) => string,
  ) => { free: string | null; pro: string | null } | undefined;
}

const BENEFITS: BenefitDef[] = [
  {
    key: 'translation',
    image: 'translation',
    Icon: Languages,
    lines: (d, t, num) => {
      const f = d?.limits?.free.translation,
        p = d?.limits?.pro.translation;
      return sameLimit(f, p)
        ? undefined
        : { free: limitText(f, t, num), pro: limitText(p, t, num) };
    },
  },
  {
    key: 'celpip',
    image: 'exam-analysis',
    Icon: BookOpenCheck,
    lines: (d, t, num) => {
      const s = d?.limits?.free.exam_scoring,
        i = d?.limits?.free.exam_insight;
      if (!s || !i)
        return {
          free: t('proPage.benefits.celpip.freeNoLimits'),
          pro: t('proPage.benefits.celpip.pro'),
        };
      const a = (n: number | null) => (n === null ? t('proPage.compare.unlimited') : num(n));
      return {
        free: t('proPage.benefits.celpip.free', { scoring: a(s.monthly), insight: a(i.monthly) }),
        pro: t('proPage.benefits.celpip.pro'),
      };
    },
  },
  {
    key: 'tcf',
    image: 'exam-scoring',
    Icon: Gauge,
    lines: (d, t, num) => {
      const f = d?.limits?.free.exam_scoring,
        p = d?.limits?.pro.exam_scoring;
      return sameLimit(f, p)
        ? undefined
        : { free: limitText(f, t, num), pro: limitText(p, t, num) };
    },
  },
  {
    key: 'decks',
    image: 'decks',
    Icon: Layers,
    lines: (d, t, num) => {
      const f = d?.limits?.free.smart_add;
      return {
        free:
          f && f.monthly !== null
            ? t('proPage.benefits.decks.free', { monthly: num(f.monthly) })
            : null,
        pro: t('proPage.benefits.decks.pro'),
      };
    },
  },
  {
    key: 'reader',
    image: 'reader-scan',
    Icon: ScanText,
    lines: (d, t, num) =>
      d?.fixed
        ? {
            free: t('proPage.benefits.reader.free', { pages: num(d.fixed.readerPreviewPages) }),
            pro: t('proPage.benefits.reader.pro', { pages: num(d.fixed.readerOcrPagesPaid) }),
          }
        : { free: null, pro: null },
  },
  {
    key: 'lena',
    image: 'lena',
    Icon: MessageCircleQuestion,
    lines: (d, t, num) => {
      const f = d?.limits?.free.lena,
        p = d?.limits?.pro.lena;
      return sameLimit(f, p)
        ? undefined
        : { free: limitText(f, t, num), pro: limitText(p, t, num) };
    },
  },
  {
    key: 'community',
    image: 'community',
    Icon: ThumbsUp,
    lines: (d, t, num) => {
      const w = d?.fixed?.communityVoteWeight;
      return !w || w.paid <= w.free
        ? undefined
        : {
            free: t('proPage.benefits.community.free'),
            pro: t('proPage.benefits.community.pro', { weight: num(w.paid) }),
          };
    },
  },
  {
    key: 'priority',
    image: 'priority',
    Icon: Rocket,
    lines: (d, t, num) => {
      const f = d?.limits?.free.transcription,
        p = d?.limits?.pro.transcription;
      if (!f || !p) return { free: null, pro: null };
      return {
        free:
          f.monthly === null
            ? t('proPage.compare.values.queueFree')
            : t('proPage.benefits.priority.free', { minutes: num(f.monthly) }),
        pro:
          p.monthly === null
            ? t('proPage.compare.values.queuePro')
            : t('proPage.benefits.priority.pro', { minutes: num(p.monthly) }),
      };
    },
  },
];

function Benefits({
  data,
  mode,
  extra,
}: {
  data: PlanFeaturesResponse | null;
  mode: 'sales' | 'unlocked';
  extra?: React.ReactNode;
}) {
  const { t, i18n } = useAccountT();
  const num = numberFormatter(i18n.language);
  const tt = (k: string, v?: Record<string, unknown>) => t(`subscription.${k}`, v);
  const weight = data?.fixed?.communityVoteWeight.paid ?? 0;
  const cards = BENEFITS.map((b) => ({ ...b, r: b.lines(data, tt, num) })).filter(
    (b) => b.r !== undefined,
  );
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-foreground">
          {t(
            mode === 'sales'
              ? 'subscription.proPage.benefitsTitle'
              : 'subscription.proPage.unlockedTitle',
          )}
        </h2>
        {mode === 'sales' && (
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t('subscription.proPage.benefitsSubtitle')}
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ key, image, Icon, r }) => (
          <Card key={key} className="flex flex-col overflow-hidden">
            <img src={`/pro/${image}.webp`} alt="" className="aspect-[16/10] w-full object-cover" />
            <div className="flex flex-1 flex-col gap-1.5 px-5 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <h3 className="text-[15px] font-bold leading-snug text-foreground">
                  {tt(`proPage.benefits.${key}.title`)}
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {tt(`proPage.benefits.${key}.desc`, { weight: num(weight) })}
              </p>
            </div>
            {r && (r.free || r.pro) && (
              <dl className="flex flex-col gap-1.5 border-t border-border px-5 py-3 text-[12.5px]">
                {r.pro && (
                  <div className="flex items-start gap-2.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-[13px]">
                    <dt className="w-11 shrink-0">
                      {mode === 'sales' ? (
                        <span className="inline-flex rounded-full bg-primary px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-primary-foreground">
                          {tt('proPage.proLabel')}
                        </span>
                      ) : (
                        <CheckCircle2
                          className="mt-px h-4 w-4 text-success"
                          aria-label={tt('proPage.unlocked')}
                        />
                      )}
                    </dt>
                    <dd className="font-bold leading-snug text-primary">{r.pro}</dd>
                  </div>
                )}
                {mode === 'sales' && r.free && (
                  <div className="flex items-start gap-2.5 px-2.5">
                    <dt className="w-11 shrink-0 font-semibold text-caption">
                      {tt('proPage.free')}
                    </dt>
                    <dd className="leading-snug text-muted-foreground">{r.free}</dd>
                  </div>
                )}
              </dl>
            )}
          </Card>
        ))}
        {extra}
      </div>
    </section>
  );
}

function CommunityTile({ weight }: { weight: number | undefined }) {
  const { t } = useAccountT();
  if (!weight) return null;
  return (
    <Card className="flex flex-col justify-center gap-3 p-6 md:col-span-2 xl:col-span-1">
      <MessageSquare className="h-5 w-5 text-primary" aria-hidden />
      <h3 className="text-lg font-extrabold leading-snug text-foreground">
        {t('subscription.proPage.paid.communityTitle')}
      </h3>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t('subscription.proPage.paid.communityText', { weight })}
      </p>
      <div>
        <Button asChild variant="outline">
          <Link to="/account/community">{t('subscription.proPage.paid.communityCta')}</Link>
        </Button>
      </div>
    </Card>
  );
}

function Compare({ data }: { data: PlanFeaturesResponse | null }) {
  const { t, i18n } = useAccountT();
  const num = numberFormatter(i18n.language);
  const tt = (k: string, v?: Record<string, unknown>) => t(`subscription.${k}`, v);
  const limits = data?.limits;
  const fixed = data?.fixed;
  type Cell = string | boolean | null;
  const METERED = [
    ['translation', 'translation'],
    ['lena', 'lena'],
    ['smartAdd', 'smart_add'],
    ['examScoring', 'exam_scoring'],
    ['examInsight', 'exam_insight'],
    ['examVocab', 'exam_vocab'],
    ['transcription', 'transcription'],
  ] as const;
  const metered = limits
    ? METERED.filter(([, p]) => !sameLimit(limits.free[p], limits.pro[p])).map(([key, p]) => ({
        key,
        free: limitText(
          limits.free[p],
          tt,
          num,
          key === 'transcription' ? 'minutes' : 'count',
        ) as Cell,
        pro: limitText(
          limits.pro[p],
          tt,
          num,
          key === 'transcription' ? 'minutes' : 'count',
        ) as Cell,
      }))
    : [];
  const rows: { key: string; free: Cell; pro: Cell }[] = [
    ...metered.slice(0, 3),
    { key: 'wholeListDecks', free: false, pro: true },
    ...metered.slice(3),
    {
      key: 'coach',
      free: tt('proPage.compare.values.coachFree'),
      pro: tt('proPage.compare.values.coachPro'),
    },
    { key: 'recordings', free: false, pro: true },
    {
      key: 'queue',
      free: tt('proPage.compare.values.queueFree'),
      pro: tt('proPage.compare.values.queuePro'),
    },
    ...(fixed
      ? [
          {
            key: 'reader',
            free: tt('proPage.compare.values.readerFree', { pages: num(fixed.readerPreviewPages) }),
            pro: tt('proPage.compare.values.readerPro', { pages: num(fixed.readerOcrPagesPaid) }),
          },
        ]
      : []),
    { key: 'export', free: false, pro: true },
    ...(fixed && fixed.communityVoteWeight.paid > fixed.communityVoteWeight.free
      ? [
          {
            key: 'votes',
            free: tt('proPage.compare.values.votes', { n: num(fixed.communityVoteWeight.free) }),
            pro: tt('proPage.compare.values.votes', { n: num(fixed.communityVoteWeight.paid) }),
          },
        ]
      : []),
  ];
  const cell = (v: Cell, pro: boolean) => {
    if (v === false)
      return (
        <span className="inline-flex items-center gap-1.5 text-caption">
          <Minus className="h-4 w-4" aria-hidden />
          {tt('proPage.compare.no')}
        </span>
      );
    const text = v === true ? tt('proPage.compare.yes') : (v ?? '-');
    if (!pro) return <span className="text-muted-foreground">{text}</span>;
    return (
      <span className="inline-flex items-start gap-1.5 font-bold text-primary">
        <Check className="mt-px h-4 w-4 shrink-0 text-success" strokeWidth={2.8} aria-hidden />
        {text}
      </span>
    );
  };
  return (
    <Card className="overflow-hidden">
      <h2 className="px-6 pb-3 pt-5 text-xl font-extrabold tracking-tight text-foreground">
        {tt('proPage.compare.title')}
      </h2>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-border">
            <th className="w-[38%] px-6 py-2.5 text-start text-[11px] font-bold uppercase tracking-wider text-caption">
              {tt('proPage.compare.feature')}
            </th>
            <th className="border-x border-primary/25 bg-primary/10 px-4 py-2.5 text-start">
              <span className="inline-flex rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
                {tt('proPage.proLabel')}
              </span>
            </th>
            <th className="px-3 py-2.5 text-start text-[11px] font-bold uppercase tracking-wider text-caption">
              {tt('proPage.free')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="px-6 py-3 text-start font-semibold text-foreground">
                {tt(`proPage.compare.rows.${r.key}`)}
              </th>
              <td className="border-x border-primary/25 bg-primary/10 px-4 py-3">
                {cell(r.pro, true)}
              </td>
              <td className="px-3 py-3">{cell(r.free, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function StaysFree() {
  const { t } = useAccountT();
  return (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <HeartHandshake className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-base font-bold text-foreground">
          {t('subscription.proPage.staysFree.title')}
        </h2>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {t('subscription.proPage.staysFree.subtitle')}
      </p>
      <ul className="flex flex-col gap-2">
        {(['exams', 'readingListening', 'content', 'reader', 'dictionary'] as const).map((k) => (
          <li key={k} className="flex items-start gap-2 text-[13px] text-foreground/85">
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-success" aria-hidden />
            {t(`subscription.proPage.staysFree.${k}`)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Faq() {
  const { t } = useAccountT();
  return (
    <Card className="flex flex-col gap-2 p-6">
      <h2 className="mb-1 text-base font-bold text-foreground">
        {t('subscription.proPage.faq.title')}
      </h2>
      <div className="divide-y divide-border">
        {(['cancel', 'keep', 'fairUse', 'lifetime', 'payment'] as const).map((k) => (
          <details key={k} className="group py-3 first:pt-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              {t(`subscription.proPage.faq.${k}Q`)}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-caption transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t(`subscription.proPage.faq.${k}A`)}
            </p>
          </details>
        ))}
      </div>
    </Card>
  );
}

/** Gift redemption: paste the code or the whole link from the email. */
function Redeem({
  signedIn,
  onNeedSignIn,
  onDone,
}: {
  signedIn: boolean;
  onNeedSignIn: () => void;
  onDone: () => void;
}) {
  const { t, i18n, errorText } = useAccountT();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ periodEnd?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const token = parseGiftToken(value);
    if (!token) {
      setError(t('desk.redeem.invalid'));
      return;
    }
    if (!signedIn) return onNeedSignIn();
    setBusy(true);
    try {
      const r = await activateProGift(token);
      setDone({ periodEnd: r.subscription?.periodEnd });
      setValue('');
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-base font-bold text-foreground">{t('desk.redeem.title')}</h2>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {t('desk.redeem.hint')}
      </p>
      {done ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
        >
          <CheckCircle2 className="h-4 w-4" />
          {t('activatePro.successTitle')}
          {done.periodEnd &&
            ` - ${t('desk.redeem.until', { date: new Date(done.periodEnd).toLocaleDateString(i18n.language) })}`}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <ErrorLine message={error} onDismiss={() => setError(null)} />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('desk.redeem.placeholder')}
              className="max-w-md"
              aria-label={t('desk.redeem.title')}
            />
            <Button type="submit" variant="success" loading={busy}>
              {!busy && <Gift />}
              {busy ? t('activatePro.activating') : t('activatePro.activate')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
