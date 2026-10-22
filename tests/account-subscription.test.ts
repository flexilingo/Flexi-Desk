import { describe, it, expect } from 'vitest';
import {
  formatAmountAdded,
  formatPrice,
  limitText,
  meterRows,
  parseGiftToken,
  planView,
  sameLimit,
  shouldRefreshOnFocus,
  tierRefresh,
} from '@/lib/account/subscription';
import type { UserSubscription, UsageBalance } from '@/lib/account/types';

const sub = (o: Partial<UserSubscription>): UserSubscription => ({
  tier: 'free',
  planId: 'free',
  status: 'active',
  periodStart: '',
  periodEnd: '',
  hasStripeSubscription: false,
  ...o,
});

describe('plan view', () => {
  it('free can start a trial unless it was used', () => {
    expect(planView(sub({})).canStartTrial).toBe(true);
    expect(planView(sub({ trialUsed: true })).canStartTrial).toBe(false);
  });
  it('a legacy trial counts as not bought', () => {
    const v = planView(sub({ tier: 'trial', status: 'trialing' }));
    expect(v.isPaid).toBe(false);
    expect(v.canStartTrial).toBe(false);
  });
  it('pro, lifetime and pro_max are bought; no subscription is free', () => {
    expect(planView(sub({ tier: 'pro' })).isPaid).toBe(true);
    expect(planView(sub({ tier: 'lifetime' })).isLifetime).toBe(true);
    expect(planView(sub({ tier: 'pro_max' })).isPaid).toBe(true);
    expect(planView(null).tier).toBe('free');
  });
});

describe('tier refresh after paying in the browser', () => {
  it('says changed when the tier moves to paid', () => {
    expect(tierRefresh(sub({}), sub({ tier: 'pro', hasStripeSubscription: true }))).toEqual({
      changed: true,
      nowPaid: true,
    });
  });
  it('says unchanged while still free', () => {
    expect(tierRefresh(sub({}), sub({}))).toEqual({ changed: false, nowPaid: false });
  });
  it('notices a new Stripe subscription on the same tier', () => {
    expect(
      tierRefresh(sub({ tier: 'pro' }), sub({ tier: 'pro', hasStripeSubscription: true })).changed,
    ).toBe(true);
  });
  it('refreshes on focus only while a payment window is open and signed in', () => {
    expect(shouldRefreshOnFocus(true, true)).toBe(true);
    expect(shouldRefreshOnFocus(false, true)).toBe(false);
    expect(shouldRefreshOnFocus(true, false)).toBe(false);
  });
});

describe('gift token parsing', () => {
  it('takes a bare token', () => expect(parseGiftToken('  abc123DEF456  ')).toBe('abc123DEF456'));
  it('takes the website link', () =>
    expect(parseGiftToken('https://flexilingo.com/en/activate-pro?token=tok_12345678')).toBe(
      'tok_12345678',
    ));
  it('takes the desk deep link', () =>
    expect(parseGiftToken('flexidesk://activate-pro?token=gift-9876543210')).toBe(
      'gift-9876543210',
    ));
  it('rejects empty, short, other schemes and links without a token', () => {
    expect(parseGiftToken('')).toBeNull();
    expect(parseGiftToken('abc')).toBeNull();
    expect(parseGiftToken('javascript:alert(1)')).toBeNull();
    expect(parseGiftToken('https://flexilingo.com/en/activate-pro')).toBeNull();
    expect(parseGiftToken('https://flexilingo.com/?token=x')).toBeNull();
  });
});

describe('usage meters and limits', () => {
  const f = (used: number, limit: number | null, extra = {}) => ({
    used,
    usedToday: 0,
    monthlyLimit: limit,
    dailyLimit: null,
    isUnlimited: limit === null,
    monthlyRemaining: null,
    dailyRemaining: null,
    ...extra,
  });
  const usage = {
    tier: 'free',
    canBuyTopup: false,
    isTrial: false,
    resetsAt: '',
    dailyResetsAt: '',
    translation: f(10, 40),
    lena: f(40, 40, { dailyRemaining: 5 }),
    smartAdd: f(34, 40),
    transcription: f(1, null),
  } as UsageBalance;
  it('lists only capped meters with tones', () => {
    const rows = meterRows(usage);
    expect(rows.map((r) => r.key)).toEqual(['translation', 'lena', 'smartAdd']);
    expect(Object.fromEntries(rows.map((r) => [r.key, r.tone]))).toEqual({
      translation: 'ok',
      lena: 'spent',
      smartAdd: 'near',
    });
    expect(rows[1].monthSpent).toBe(true);
    expect(rows[1].dailyLeft).toBe(5);
  });
  const t = (k: string, v?: Record<string, unknown>) => `${k}|${JSON.stringify(v ?? {})}`;
  const num = (n: number) => String(n);
  it('words a limit', () => {
    expect(limitText(undefined, t, num)).toBeNull();
    expect(limitText({ monthly: null, daily: null }, t, num)).toContain('unlimited');
    expect(limitText({ monthly: 40, daily: null }, t, num)).toContain('perMonth|{"n":"40"}');
    expect(limitText({ monthly: 100, daily: 10 }, t, num)).toContain('perMonthThenDay');
    expect(limitText({ monthly: 60, daily: null }, t, num, 'minutes')).toContain('minutesPerMonth');
  });
  it('sameLimit compares both numbers', () => {
    expect(sameLimit({ monthly: 1, daily: 2 }, { monthly: 1, daily: 2 })).toBe(true);
    expect(sameLimit({ monthly: 1, daily: 2 }, { monthly: 1, daily: null })).toBe(false);
    expect(sameLimit(undefined, undefined)).toBe(false);
  });
  it('formats prices and top-up amounts', () => {
    expect(formatPrice(249, 'en')).toBe('$249');
    expect(formatPrice(6.99, 'en')).toBe('$6.99');
    expect(formatAmountAdded(150, 'topup')).toBe('2h 30m');
    expect(formatAmountAdded(30, 'transcription_minutes')).toBe('30m');
    expect(formatAmountAdded(5, 'content_analysis')).toBe('5');
  });
});
