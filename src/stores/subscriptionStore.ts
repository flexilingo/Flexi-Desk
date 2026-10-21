import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

/**
 * The user's FlexiLingo subscription, used to decide where AI work runs.
 *
 * Desk is local-first and works signed-out, so this is always allowed to be
 * unknown: a null subscription simply means "not Pro", which routes AI analysis
 * to the on-device model instead of FlexiLingo's.
 */

/** Mirrors front's `UserSubscription` (`GET /subscription`). */
export interface UserSubscription {
  tier: string;
  planId: string;
  status: string;
  trialEnd?: string;
  periodStart: string;
  periodEnd: string;
  hasStripeSubscription: boolean;
}

/** Exactly the tiers front treats as paid — keep in lockstep. */
export const PAID_TIERS = ['pro', 'lifetime', 'pro_max', 'trial'] as const;

interface SubscriptionState {
  subscription: UserSubscription | null;
  isLoading: boolean;
  /** True once we've asked, whatever the answer. Lets the UI stop guessing. */
  hasResolved: boolean;
  error: string | null;

  fetchSubscription: () => Promise<void>;
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  immer((set) => ({
    subscription: null,
    isLoading: false,
    hasResolved: false,
    error: null,

    fetchSubscription: async () => {
      if (!useAuthStore.getState().session) {
        set((s) => {
          s.subscription = null;
          s.hasResolved = true;
        });
        return;
      }

      set((s) => {
        s.isLoading = true;
      });
      try {
        const sub = await supabaseCall<UserSubscription>('GET', '/subscription');
        set((s) => {
          s.subscription = sub ?? null;
          s.isLoading = false;
          s.hasResolved = true;
          s.error = null;
        });
      } catch (err) {
        // Offline or signed out — treat as free rather than blocking the feature.
        set((s) => {
          s.subscription = null;
          s.isLoading = false;
          s.hasResolved = true;
          s.error = String(err);
        });
      }
    },

    clear: () =>
      set((s) => {
        s.subscription = null;
        s.hasResolved = false;
        s.error = null;
      }),
  })),
);

/** Whether FlexiLingo's cloud AI is available to this user. */
export function isPaidTier(tier: string | undefined | null): boolean {
  return (PAID_TIERS as readonly string[]).includes(tier ?? '');
}

/**
 * Where AI analysis should run for this user.
 *
 * `cloud` — FlexiLingo's models (Pro tiers).
 * `local` — the on-device model configured in Settings (ollama by default).
 */
export function useAiRoute(): 'cloud' | 'local' {
  const subscription = useSubscriptionStore((s) => s.subscription);
  return isPaidTier(subscription?.tier) ? 'cloud' : 'local';
}
