import { supabaseCall } from '@/lib/supabase';
import type {
  AccountSettings,
  CheckoutResult,
  CommunityComment,
  CommunityTopic,
  DailyStat,
  FollowTab,
  LeaderboardResponse,
  PaymentTransaction,
  PlanFeaturesResponse,
  Profile,
  PublicAnnouncement,
  TopicsListResponse,
  TopupPackage,
  UsageBalance,
  UserProfile,
  UserStatistics,
  UserSubscription,
  VoteType,
  XPHistoryResponse,
} from './types';

/**
 * Every account call the website makes, through `supabaseCall` (never fetch from the
 * webview). Paths are the same ones flexi-lingo-front's RTK slices use.
 */

// ── user-settings ─────────────────────────────────────────
export const getAccountSettings = () => supabaseCall<AccountSettings>('GET', '/user-settings');
export const updateAccountSettings = (patch: AccountSettings) =>
  supabaseCall<AccountSettings>('PATCH', '/user-settings', patch as Record<string, unknown>);

// ── profile ───────────────────────────────────────────────
export const getProfile = () => supabaseCall<Profile>('GET', '/profile');
export const updateProfile = (patch: Pick<Profile, 'display_name' | 'bio'>) =>
  supabaseCall<Profile>('PATCH', '/profile', patch);
/** `file` is a data URL, as the website sends it. */
export const uploadAvatar = (file: string, fileName: string) =>
  supabaseCall<Profile>('POST', '/profile?action=upload-avatar', { file, fileName });

// ── subscription ──────────────────────────────────────────
export const getSubscription = () => supabaseCall<UserSubscription>('GET', '/subscription');
export const getUsageBalance = () => supabaseCall<UsageBalance>('GET', '/usage-balance');
export const getPlanFeatures = () => supabaseCall<PlanFeaturesResponse>('GET', '/plan-features');
export const getTopupPackages = () =>
  supabaseCall<{ packages: TopupPackage[] }>('GET', '/topup-packages');
export const getPaymentHistory = () =>
  supabaseCall<{ transactions: PaymentTransaction[] }>('GET', '/payment-history');
export const startTrial = () =>
  supabaseCall<{ success: boolean; trialEnd?: string }>('POST', '/subscription', {
    action: 'trial',
  });
export const createSubscriptionCheckout = (planId: string) =>
  supabaseCall<CheckoutResult>('POST', '/stripe-create-checkout', { planId });
export const createTopupCheckout = (packageId: string) =>
  supabaseCall<CheckoutResult>('POST', '/stripe-create-checkout', { packageId, type: 'topup' });
/** Existing Stripe subscription: a Checkout session that prorates the change. */
export const upgradeSubscription = (planId: string) =>
  supabaseCall<CheckoutResult>('POST', '/stripe-upgrade-subscription', { planId });
export const createPortalSession = (returnUrl?: string) =>
  supabaseCall<{ url: string }>('POST', '/stripe-create-portal', { returnUrl });
export const activateProGift = (token: string) =>
  supabaseCall<{
    success: boolean;
    message: string;
    subscription?: { tier: string; periodEnd: string };
  }>('POST', '/activate-pro-gift', { token });

// ── progress ──────────────────────────────────────────────
export const getXpHistory = (limit: number, offset: number) =>
  supabaseCall<XPHistoryResponse>('GET', `/get-xp-history?limit=${limit}&offset=${offset}`);
export const getUserStatistics = () =>
  supabaseCall<UserStatistics>('POST', '/stats?action=user-statistics', {});
export const getDailyStats = (dateFrom: string) =>
  supabaseCall<DailyStat[]>('GET', `/stats?action=daily&date_from=${dateFrom}&date_to=`);

// ── community ─────────────────────────────────────────────
export interface TopicQuery {
  status?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
  mine?: boolean;
}
export function topicsPath(q: TopicQuery): string {
  const p = new URLSearchParams();
  p.set('resource', 'topics');
  if (q.mine) p.set('mine', 'true');
  if (q.status) p.set('status', q.status);
  if (q.sortBy) p.set('sortBy', q.sortBy);
  if (q.limit) p.set('limit', String(q.limit));
  if (q.offset) p.set('offset', String(q.offset));
  return `/community?${p.toString()}`;
}
export const getTopics = (q: TopicQuery) => supabaseCall<TopicsListResponse>('GET', topicsPath(q));
export const getTopic = (id: string) =>
  supabaseCall<CommunityTopic>('GET', `/community?resource=topics&id=${encodeURIComponent(id)}`);
export const createTopic = (body: {
  title: string;
  description: string;
  category?: string;
  is_anonymous?: boolean;
}) => supabaseCall<CommunityTopic>('POST', '/community?resource=topics', body);
export const updateTopic = (
  id: string,
  updates: { title?: string; description?: string; category?: string },
) =>
  supabaseCall<CommunityTopic>(
    'PATCH',
    `/community?resource=topics&id=${encodeURIComponent(id)}`,
    updates,
  );
export const deleteTopic = (id: string) =>
  supabaseCall<void>('DELETE', `/community?resource=topics&id=${encodeURIComponent(id)}`);
export const getComments = (topicId: string) =>
  supabaseCall<{ comments: CommunityComment[] }>(
    'GET',
    `/community?resource=comments&topic_id=${encodeURIComponent(topicId)}`,
  );
export const createComment = (topicId: string, content: string) =>
  supabaseCall<CommunityComment>('POST', '/community?resource=comments', {
    topic_id: topicId,
    content,
  });
export const deleteComment = (id: string) =>
  supabaseCall<void>('DELETE', `/community?resource=comments&id=${encodeURIComponent(id)}`);
export const voteTopic = (topicId: string, voteType: VoteType) =>
  supabaseCall<{
    vote_type: VoteType | null;
    action: 'created' | 'updated' | 'removed';
    upvote_count?: number;
    downvote_count?: number;
    score?: number;
  }>('POST', '/community?resource=votes', { topic_id: topicId, vote_type: voteType });
export const getLeaderboard = (limit = 10) =>
  supabaseCall<LeaderboardResponse>('GET', `/community?resource=leaderboard&limit=${limit}`);

// ── friends ───────────────────────────────────────────────
export const searchUsers = (q: string, limit = 20) =>
  supabaseCall<{ users: UserProfile[] }>(
    'GET',
    `/search-users?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
export const followUser = (id: string) =>
  supabaseCall('POST', '/follow-user', { following_id: id });
export const unfollowUser = (id: string) =>
  supabaseCall('POST', '/unfollow-user', { following_id: id });
export const manageFollowRequest = (followId: string, action: 'accept' | 'reject') =>
  supabaseCall('POST', '/manage-follow-request', { follow_id: followId, action });
export const listFollows = (type: FollowTab) =>
  supabaseCall<{ users: UserProfile[] }>('GET', `/list-follows?type=${type}`);

// ── announcements ─────────────────────────────────────────
export const getAnnouncements = (locale: string, slot: string) =>
  supabaseCall<{ announcements: PublicAnnouncement[] }>(
    'GET',
    `/app-config?action=announcements&locale=${encodeURIComponent(locale)}&slot=${encodeURIComponent(slot)}&platform=web`,
  );
