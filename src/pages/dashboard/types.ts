export type AchievementCategory =
  | 'general'
  | 'streak'
  | 'vocabulary'
  | 'review'
  | 'writing'
  | 'exam'
  | 'reading'
  | 'pronunciation';

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

// ── Raw IPC types (snake_case, as the Rust commands send them) ──

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
