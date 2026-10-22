/** Shapes of the FlexiLingo account API — mirrors flexi-lingo-front `src/store/*Api.ts`. */

export type ExamGoal = 'celpip' | 'tcf' | 'tcf_quebec' | 'none';

/** The part of `user_settings` the desk reads and writes. */
export interface AccountSettings {
  learning_language?: string | null;
  native_language?: string | null;
  exam_goal?: ExamGoal | null;
  exam_date?: string | null;
  tts_engine?: 'microsoft' | 'google' | 'flexilingo' | 'device' | null;
  tts_voice?: string | null;
  tts_voice_gender?: 'female' | 'male' | null;
  tts_google_voices?: Record<string, string> | null;
}

export interface Profile {
  id?: string;
  username?: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export type SubscriptionTier = 'anonymous' | 'free' | 'pro' | 'lifetime' | 'trial' | 'pro_max';
export type SubscriptionStatus = 'active' | 'trialing' | 'expired' | 'cancelled';

export interface UserSubscription {
  tier: SubscriptionTier;
  planId: string;
  status: SubscriptionStatus;
  trialEnd?: string;
  periodStart: string;
  periodEnd: string;
  hasStripeSubscription: boolean;
  trialUsed?: boolean;
}

export interface FeatureUsage {
  used: number;
  usedToday: number;
  monthlyLimit: number | null;
  dailyLimit: number | null;
  isUnlimited: boolean;
  monthlyRemaining: number | null;
  dailyRemaining: number | null;
}

export interface UsageBalance {
  tier: SubscriptionTier;
  transcription?: FeatureUsage;
  translation?: FeatureUsage;
  smartAdd?: FeatureUsage;
  examVocab?: FeatureUsage;
  examInsight?: FeatureUsage;
  examScoring?: FeatureUsage;
  lena?: FeatureUsage;
  canBuyTopup: boolean;
  isTrial: boolean;
  resetsAt: string;
  dailyResetsAt: string;
}

export interface TopupPackage {
  id: string;
  name: string;
  type: 'transcription' | 'video';
  amount: number;
  amountUnit: string;
  price: number;
  currency: string;
  isPopular?: boolean;
}

export interface PaymentTransaction {
  id: string;
  packageId: string | null;
  packageName: string | null;
  amountPaid: number;
  currency: string;
  creditsAdded: number;
  creditType: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: string;
  completedAt: string | null;
}

export interface PlanLimit {
  monthly: number | null;
  daily: number | null;
}

export type MeteredFeature =
  | 'transcription'
  | 'translation'
  | 'smart_add'
  | 'lena'
  | 'exam_vocab'
  | 'exam_insight'
  | 'exam_scoring'
  | string;

export interface PlanFeaturesResponse {
  pricing: { pro_monthly: number; pro_yearly: number; lifetime_onetime: number };
  limits?: Record<'free' | 'pro' | 'lifetime', Record<MeteredFeature, PlanLimit>>;
  fixed?: {
    readerOcrPagesPaid: number;
    readerPreviewPages: number;
    communityVoteWeight: { free: number; paid: number };
  };
}

export interface CheckoutResult {
  url: string;
  sessionId?: string;
}

export type XPSource =
  | 'words_reviewed'
  | 'correct_answers'
  | 'streak_bonus'
  | 'daily_goal_bonus'
  | 'time_bonus'
  | 'achievement'
  | 'content_complete';

export interface XPLogItem {
  id: string;
  source: XPSource;
  xp_amount: number;
  source_detail?: { count?: number; streak?: number; seconds?: number; estimated?: boolean } | null;
}

export interface XPDailySummary {
  activity_date: string;
  total_xp: number;
  logs: XPLogItem[];
}

export interface XPHistoryResponse {
  items: XPDailySummary[];
  total: number;
  total_xp: number;
  level: number;
}

export interface DailyStat {
  date: string;
  cards_reviewed: number;
  correct_answers: number;
  incorrect_answers: number;
}

export interface UserStatistics {
  total_cards_reviewed: number;
  total_mastered: number;
  accuracy_rate: number;
  streak_days: number;
  box_distribution?: { box: number; count: number }[];
}

export type TopicStatus = 'pending' | 'open' | 'in-progress' | 'completed' | 'rejected';
export type VoteType = 'upvote' | 'downvote';

export interface Author {
  id?: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CommunityTopic {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string | null;
  status: TopicStatus;
  upvote_count: number;
  downvote_count: number;
  comment_count: number;
  score: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  user_vote?: VoteType | null;
  profiles?: Author;
}

export interface CommunityComment {
  id: string;
  user_id: string;
  topic_id: string;
  content: string;
  created_at: string;
  profiles?: Author;
}

export interface TopicsListResponse {
  topics: CommunityTopic[];
  total: number;
  limit: number;
  offset: number;
}

export interface LeaderboardUser {
  rank: number;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  level: number;
  current_streak: number;
  is_me: boolean;
}

export interface LeaderboardResponse {
  users: LeaderboardUser[];
  my_rank: number | null;
  my_stats: { rank: number | null; total_xp: number; level: number; current_streak: number } | null;
}

export type FollowStatus = 'pending' | 'accepted' | 'blocked' | 'not_following';
export type FollowTab = 'followers' | 'following' | 'mutual' | 'pending';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  follow_status?: FollowStatus;
  follow_id?: string;
}

export interface PublicAnnouncement {
  id: string;
  slot: string;
  title: string | null;
  message: string;
  button_text: string | null;
  dismiss_type: 'button' | 'tap_anywhere' | 'auto' | 'none';
  auto_dismiss_seconds: number;
}
