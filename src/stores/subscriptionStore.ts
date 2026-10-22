import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { CLOUD_AI_TIERS } from '@/lib/aiSource';

/**
 * The user's FlexiLingo subscription.
 *
 * A paid plan does NOT decide where AI runs: desk always uses the user's own AI
 * unless they switch FlexiLingo's cloud AI on (see `src/lib/aiSource.ts`). The plan
 * only decides whether that switch is available.
 *
 * Desk is local-first and works signed-out, so this is always allowed to be unknown.
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
  /** Free trial already consumed: never offer "start free trial" again. */
  trialUsed?: boolean;
}

/** Exactly the tiers front treats as paid — one list, shared with the AI policy. */
export const PAID_TIERS = CLOUD_AI_TIERS;

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

/** Whether this tier is a paid plan. */
export function isPaidTier(tier: string | undefined | null): boolean {
  return (PAID_TIERS as readonly string[]).includes(tier ?? '');
}
