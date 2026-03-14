import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import type {
  DashboardSummary,
  DailyStats,
  Goal,
  Achievement,
  ActivityEntry,
  GoalType,
  GoalPeriod,
  RawDashboardSummary,
  RawDailyStats,
  RawGoal,
  RawAchievement,
  RawActivityEntry,
} from '../types';
import { mapSummary, mapDailyStats, mapGoal, mapAchievement, mapActivity } from '../types';

interface DashboardState {
  // Summary
  summary: DashboardSummary | null;
  isLoadingSummary: boolean;

  // Stats history
  statsHistory: DailyStats[];
  isLoadingStats: boolean;

  // Goals
  goals: Goal[];

  // Achievements
  achievements: Achievement[];
  isLoadingAchievements: boolean;

  // Activity
  activities: ActivityEntry[];

  // Error
  error: string | null;

  // Actions
  fetchSummary: () => Promise<void>;
  fetchDailyStats: (fromDate: string, toDate: string) => Promise<void>;
  logActivity: (minutes?: number, words?: number, reviews?: number) => Promise<void>;

  fetchGoals: () => Promise<void>;
  createGoal: (goalType: GoalType, target: number, period: GoalPeriod) => Promise<void>;
  updateGoalProgress: (id: string, value: number) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  fetchAchievements: (category?: string) => Promise<void>;
  checkAchievements: () => Promise<void>;

  fetchActivity: (limit?: number, module?: string) => Promise<void>;

  clearError: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  immer((set) => ({
    summary: null,
    isLoadingSummary: false,
    statsHistory: [],
    isLoadingStats: false,
    goals: [],
    achievements: [],
    isLoadingAchievements: false,
    activities: [],
    error: null,

    fetchSummary: async () => {
      set((s) => {
        s.isLoadingSummary = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawDashboardSummary>('dashboard_get_summary');
        set((s) => {
          s.summary = mapSummary(raw);
          s.goals = raw.active_goals.map(mapGoal);
          s.isLoadingSummary = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingSummary = false;
        });
      }
    },

    fetchDailyStats: async (fromDate, toDate) => {
      set((s) => {
        s.isLoadingStats = true;
      });
      try {
        const raw = await invoke<RawDailyStats[]>('dashboard_get_daily_stats', {
          fromDate,
          toDate,
        });
        set((s) => {
          s.statsHistory = raw.map(mapDailyStats);
          s.isLoadingStats = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingStats = false;
        });
      }
    },

    logActivity: async (minutes, words, reviews) => {
      try {
        const raw = await invoke<RawDailyStats>('dashboard_log_activity', {
          studyMinutes: minutes ?? null,
          wordsLearned: words ?? null,
          reviewsCompleted: reviews ?? null,
        });
        const updated = mapDailyStats(raw);
        set((s) => {
          if (s.summary) s.summary.today = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchGoals: async () => {
      try {
        const raw = await invoke<RawGoal[]>('dashboard_list_goals');
        set((s) => {
          s.goals = raw.map(mapGoal);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    createGoal: async (goalType, target, period) => {
      try {
        const raw = await invoke<RawGoal>('dashboard_create_goal', {
          goalType,
          targetValue: target,
          period,
        });
        set((s) => {
          s.goals.push(mapGoal(raw));
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    updateGoalProgress: async (id, value) => {
      try {
        const raw = await invoke<RawGoal>('dashboard_update_goal_progress', {
          id,
          currentValue: value,
        });
        const updated = mapGoal(raw);
        set((s) => {
          const idx = s.goals.findIndex((g) => g.id === id);
          if (idx >= 0) s.goals[idx] = updated;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    deleteGoal: async (id) => {
      try {
        await invoke('dashboard_delete_goal', { id });
        set((s) => {
          s.goals = s.goals.filter((g) => g.id !== id);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    fetchAchievements: async (category) => {
      set((s) => {
        s.isLoadingAchievements = true;
      });
      try {
        const raw = await invoke<RawAchievement[]>('dashboard_list_achievements', {
          category: category ?? null,
        });
        set((s) => {
          s.achievements = raw.map(mapAchievement);
          s.isLoadingAchievements = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingAchievements = false;
        });
      }
    },

    checkAchievements: async () => {
      try {
        const raw = await invoke<RawAchievement[]>('dashboard_check_achievements');
        if (raw.length > 0) {
          set((s) => {
            if (s.summary) {
              s.summary.recentAchievements = raw.map(mapAchievement);
            }
          });
        }
      } catch {
        /* best-effort */
      }
    },

    fetchActivity: async (limit, module) => {
      try {
        const raw = await invoke<RawActivityEntry[]>('dashboard_get_activity', {
          limit: limit ?? 50,
          module: module ?? null,
        });
        set((s) => {
          s.activities = raw.map(mapActivity);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
