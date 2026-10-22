import type { PlanLimit, SubscriptionTier, UsageBalance, UserSubscription } from './types';

/** Plan ids the backend maps to Stripe prices. */
export const PRO_PLAN_ID = 'pro_monthly';
export const LIFETIME_PLAN_ID = 'lifetime_onetime';

export function normalizeTier(tier: SubscriptionTier | 'unlimited'): SubscriptionTier {
  return tier === 'unlimited' ? 'pro' : tier;
}

export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier === 'pro' || tier === 'lifetime' || tier === 'trial' || tier === 'pro_max';
}

export interface PlanView {
  tier: SubscriptionTier;
  isTrialing: boolean;
  isTrial: boolean;
  isLifetime: boolean;
  isProMax: boolean;
  /** Bought: a legacy trial counts as NOT bought, it is offered the purchase. */
  isPaid: boolean;
  canStartTrial: boolean;
}

export function planView(sub: UserSubscription | null | undefined): PlanView {
  const tier: SubscriptionTier = sub ? normalizeTier(sub.tier) : 'free';
  const isTrialing = sub?.status === 'trialing';
  const isTrial = tier === 'trial';
  return {
    tier,
    isTrialing,
    isTrial,
    isLifetime: tier === 'lifetime',
    isProMax: tier === 'pro_max',
    isPaid: isPaidTier(tier) && !isTrial && !isTrialing,
    canStartTrial: !isTrial && !isTrialing && !sub?.trialUsed,
  };
}

/**
 * After the learner pays in the browser, the page asks again when the window gets
 * focus. This says whether that answer means "the plan changed" (so the page can
 * confirm it) and whether to keep waiting.
 */
export function tierRefresh(
  before: UserSubscription | null | undefined,
  after: UserSubscription | null | undefined,
): { changed: boolean; nowPaid: boolean } {
  const b = planView(before);
  const a = planView(after);
  const changed =
    b.tier !== a.tier ||
    b.isPaid !== a.isPaid ||
    (before?.hasStripeSubscription ?? false) !== (after?.hasStripeSubscription ?? false);
  return { changed, nowPaid: a.isPaid };
}

/** Whether the focus refresh should run: only while a payment window is open. */
export function shouldRefreshOnFocus(pendingCheckout: boolean, signedIn: boolean): boolean {
  return pendingCheckout && signedIn;
}

/**
 * A gift link or code, as the learner pastes it. Accepts the bare token, the website
 * link `https://flexilingo.com/<lang>/activate-pro?token=...`, or the deep-link
 * form `flexidesk://activate-pro?token=...`. Returns null when there is no token.
 */
export function parseGiftToken(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9._~-]{8,}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!/^(https?|flexidesk):$/.test(url.protocol)) return null;
    const token = url.searchParams.get('token')?.trim();
    return token && /^[A-Za-z0-9._~%-]{8,}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** "$6.99"; whole amounts drop the cents ("$249"). */
export function formatPrice(amount: number, locale: string, currency = 'USD'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export const numberFormatter = (locale: string) => {
  const nf = new Intl.NumberFormat(locale);
  return (n: number) => nf.format(n);
};

export function sameLimit(a: PlanLimit | undefined, b: PlanLimit | undefined): boolean {
  if (!a || !b) return false;
  return a.monthly === b.monthly && a.daily === b.daily;
}

type T = (key: string, vars?: Record<string, unknown>) => string;

/** One plan limit as words ("Unlimited", "40 a month", "100 a month, then 10 a day"). */
export function limitText(
  limit: PlanLimit | undefined,
  t: T,
  num: (n: number) => string,
  unit: 'count' | 'minutes' = 'count',
): string | null {
  if (!limit) return null;
  if (limit.monthly === null) return t('proPage.compare.unlimited');
  const minutes = unit === 'minutes';
  const n = num(limit.monthly);
  if (limit.daily === null) {
    return minutes
      ? t('proPage.compare.minutesPerMonth', { n })
      : t('proPage.compare.perMonth', { n });
  }
  const d = num(limit.daily);
  return minutes
    ? t('proPage.compare.minutesPerMonthThenDay', { n, d })
    : t('proPage.compare.perMonthThenDay', { n, d });
}

export interface MeterRow {
  key:
    | 'translation'
    | 'lena'
    | 'smartAdd'
    | 'examScoring'
    | 'examInsight'
    | 'examVocab'
    | 'transcription';
  plan: string;
  minutes: boolean;
  limit: number;
  used: number;
  ratio: number;
  tone: 'ok' | 'near' | 'spent';
  monthSpent: boolean;
  dailyLeft: number | null;
}

const METERS: { key: MeterRow['key']; plan: string; minutes?: boolean }[] = [
  { key: 'translation', plan: 'translation' },
  { key: 'lena', plan: 'lena' },
  { key: 'smartAdd', plan: 'smart_add' },
  { key: 'examScoring', plan: 'exam_scoring' },
  { key: 'examInsight', plan: 'exam_insight' },
  { key: 'examVocab', plan: 'exam_vocab' },
  { key: 'transcription', plan: 'transcription', minutes: true },
];

/** Only capped meters, with the bar tone the website uses (80% = near, spent = red). */
export function meterRows(usage: UsageBalance): MeterRow[] {
  const rows: MeterRow[] = [];
  for (const m of METERS) {
    const u = usage[m.key === 'smartAdd' ? 'smartAdd' : m.key];
    if (!u || u.isUnlimited || u.monthlyLimit === null || u.monthlyLimit <= 0) continue;
    const limit = u.monthlyLimit;
    const ratio = Math.min(1, u.used / limit);
    const monthSpent = u.used >= limit;
    rows.push({
      key: m.key,
      plan: m.plan,
      minutes: !!m.minutes,
      limit,
      used: m.minutes ? Math.round(u.used) : u.used,
      ratio,
      tone: monthSpent ? 'spent' : ratio >= 0.8 ? 'near' : 'ok',
      monthSpent,
      dailyLeft: u.dailyRemaining,
    });
  }
  return rows;
}

/** Hours/minutes added by a purchase, as shown in the payments table. */
export function formatAmountAdded(amount: number, type: string): string {
  if (type === 'topup' || type === 'transcription_minutes') {
    if (amount >= 60) {
      const hours = Math.floor(amount / 60);
      const mins = amount % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return type === 'transcription_minutes' ? `${amount}m` : `${amount}`;
  }
  return `${amount}`;
}
