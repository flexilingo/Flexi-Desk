// ── Mapped types (camelCase) ────────────────────────────

export interface DailyStats {
  date: string;
  studyMinutes: number;
  wordsLearned: number;
  reviewsCompleted: number;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: string;
  freezeDaysRemaining: number;
  freezeDaysPerWeek: number;
  freezeLastReset?: string;
  dailyXpTarget: number;
}

export interface XPProgress {
  xpToday: number;
  xpTarget: number;
  percentage: number;
  streakCount: number;
  freezeDaysRemaining: number;
}

export interface Goal {
  id: string;
  goalType: GoalType;
  targetValue: number;
  currentValue: number;
  period: GoalPeriod;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Achievement {
  id: string;
  achievementKey: string;
  title: string;
  description?: string;
  icon?: string;
  category: AchievementCategory;
  threshold: number;
  currentValue: number;
  isUnlocked: boolean;
  unlockedAt?: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  activityType: string;
  module: string;
  description?: string;
  metadataJson: string;
  createdAt: string;
}

export interface DashboardSummary {
  today: DailyStats;
  streak: StreakInfo;
  totalVocabulary: number;
  totalStudyMinutes: number;
  totalReviews: number;
  activeGoals: Goal[];
  recentAchievements: Achievement[];
}

export type GoalType =
  | 'daily_minutes'
  | 'daily_words'
  | 'daily_reviews'
  | 'weekly_sessions'
  | 'custom';
export type GoalPeriod = 'daily' | 'weekly' | 'monthly';
export type AchievementCategory =
  | 'general'
  | 'streak'
  | 'vocabulary'
  | 'review'
  | 'writing'
  | 'exam'
  | 'reading'
  | 'pronunciation';

// ── Raw IPC types (snake_case) ──────────────────────────

export interface RawDailyStats {
  date: string;
  study_minutes: number;
  words_learned: number;
  reviews_completed: number;
}

export interface RawStreakInfo {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  freeze_days_remaining: number;
  freeze_days_per_week: number;
  freeze_last_reset: string | null;
  daily_xp_target: number;
}

export interface RawXPProgress {
  xp_today: number;
  xp_target: number;
  percentage: number;
  streak_count: number;
  freeze_days_remaining: number;
}

export interface RawGoal {
  id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RawAchievement {
  id: string;
  achievement_key: string;
  title: string;
  description: string | null;
  icon: string | null;
  category: string;
  threshold: number;
  current_value: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
}

export interface RawActivityEntry {
  id: string;
  activity_type: string;
  module: string;
  description: string | null;
  metadata_json: string;
  created_at: string;
}

export interface RawDashboardSummary {
  today: RawDailyStats;
  streak: RawStreakInfo;
  total_vocabulary: number;
  total_study_minutes: number;
  total_reviews: number;
  active_goals: RawGoal[];
  recent_achievements: RawAchievement[];
}

// ── Mappers ─────────────────────────────────────────────

export function mapDailyStats(raw: RawDailyStats): DailyStats {
  return {
    date: raw.date,
    studyMinutes: raw.study_minutes,
    wordsLearned: raw.words_learned,
    reviewsCompleted: raw.reviews_completed,
  };
}

export function mapStreak(raw: RawStreakInfo): StreakInfo {
  return {
    currentStreak: raw.current_streak,
    longestStreak: raw.longest_streak,
    lastActivityDate: raw.last_activity_date ?? undefined,
    freezeDaysRemaining: raw.freeze_days_remaining ?? 1,
    freezeDaysPerWeek: raw.freeze_days_per_week ?? 1,
    freezeLastReset: raw.freeze_last_reset ?? undefined,
    dailyXpTarget: raw.daily_xp_target ?? 50,
  };
}

export function mapXPProgress(raw: RawXPProgress): XPProgress {
  return {
    xpToday: raw.xp_today,
    xpTarget: raw.xp_target,
    percentage: raw.percentage,
    streakCount: raw.streak_count,
    freezeDaysRemaining: raw.freeze_days_remaining,
  };
}

export function mapGoal(raw: RawGoal): Goal {
  return {
    id: raw.id,
    goalType: raw.goal_type as GoalType,
    targetValue: raw.target_value,
    currentValue: raw.current_value,
    period: raw.period as GoalPeriod,
    isActive: raw.is_active,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function mapAchievement(raw: RawAchievement): Achievement {
  return {
    id: raw.id,
    achievementKey: raw.achievement_key,
    title: raw.title,
    description: raw.description ?? undefined,
    icon: raw.icon ?? undefined,
    category: raw.category as AchievementCategory,
    threshold: raw.threshold,
    currentValue: raw.current_value,
    isUnlocked: raw.is_unlocked,
    unlockedAt: raw.unlocked_at ?? undefined,
    createdAt: raw.created_at,
  };
}

export function mapActivity(raw: RawActivityEntry): ActivityEntry {
  return {
    id: raw.id,
    activityType: raw.activity_type,
    module: raw.module,
    description: raw.description ?? undefined,
    metadataJson: raw.metadata_json,
    createdAt: raw.created_at,
  };
}

export function mapSummary(raw: RawDashboardSummary): DashboardSummary {
  return {
    today: mapDailyStats(raw.today),
    streak: mapStreak(raw.streak),
    totalVocabulary: raw.total_vocabulary,
    totalStudyMinutes: raw.total_study_minutes,
    totalReviews: raw.total_reviews,
    activeGoals: raw.active_goals.map(mapGoal),
    recentAchievements: raw.recent_achievements.map(mapAchievement),
  };
}

// ── Analytics Types ─────────────────────────────────────

export interface DailyXP {
  date: string;
  totalXp: number;
  breakdown: ModuleXP[];
}

export interface ModuleXP {
  module: string;
  xp: number;
}

export interface CEFRSkillScore {
  skill: string;
  score: number;
  cefrLevel: string;
}

export interface StudyHeatmapEntry {
  dayOfWeek: number;
  hour: number;
  minutes: number;
}

export interface VocabGrowthPoint {
  date: string;
  cumulativeCount: number;
}

export interface StreakDay {
  date: string;
  activityCount: number;
  xpEarned: number;
}

export interface AnalyticsSummary {
  xpToday: number;
  streakCount: number;
  wordsLearnedToday: number;
  studyMinutesToday: number;
  reviewsToday: number;
}

// Raw IPC analytics types
export interface RawDailyXP {
  date: string;
  total_xp: number;
  breakdown: { module: string; xp: number }[];
}

export interface RawCEFRSkillScore {
  skill: string;
  score: number;
  cefr_level: string;
}

export interface RawStudyHeatmapEntry {
  day_of_week: number;
  hour: number;
  minutes: number;
}

export interface RawVocabGrowthPoint {
  date: string;
  cumulative_count: number;
}

export interface RawStreakDay {
  date: string;
  activity_count: number;
  xp_earned: number;
}

export interface RawAnalyticsSummary {
  xp_today: number;
  streak_count: number;
  words_learned_today: number;
  study_minutes_today: number;
  reviews_today: number;
}

// Analytics mappers
export function mapDailyXP(raw: RawDailyXP): DailyXP {
  return { date: raw.date, totalXp: raw.total_xp, breakdown: raw.breakdown };
}

export function mapCEFRScore(raw: RawCEFRSkillScore): CEFRSkillScore {
  return { skill: raw.skill, score: raw.score, cefrLevel: raw.cefr_level };
}

export function mapStudyHeatmap(raw: RawStudyHeatmapEntry): StudyHeatmapEntry {
  return { dayOfWeek: raw.day_of_week, hour: raw.hour, minutes: raw.minutes };
}

export function mapVocabGrowth(raw: RawVocabGrowthPoint): VocabGrowthPoint {
  return { date: raw.date, cumulativeCount: raw.cumulative_count };
}

export function mapStreakDay(raw: RawStreakDay): StreakDay {
  return { date: raw.date, activityCount: raw.activity_count, xpEarned: raw.xp_earned };
}

export function mapAnalyticsSummary(raw: RawAnalyticsSummary): AnalyticsSummary {
  return {
    xpToday: raw.xp_today,
    streakCount: raw.streak_count,
    wordsLearnedToday: raw.words_learned_today,
    studyMinutesToday: raw.study_minutes_today,
    reviewsToday: raw.reviews_today,
  };
}

// ── Utilities ───────────────────────────────────────────

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  daily_minutes: 'Daily Study Time',
  daily_words: 'Daily Words',
  daily_reviews: 'Daily Reviews',
  weekly_sessions: 'Weekly Sessions',
  custom: 'Custom Goal',
};

export const GOAL_TYPE_UNITS: Record<GoalType, string> = {
  daily_minutes: 'min',
  daily_words: 'words',
  daily_reviews: 'reviews',
  weekly_sessions: 'sessions',
  custom: '',
};

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  general: 'General',
  streak: 'Streaks',
  vocabulary: 'Vocabulary',
  review: 'Reviews',
  writing: 'Writing',
  exam: 'Exams',
  reading: 'Reading',
  pronunciation: 'Pronunciation',
};

export function formatStudyTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
