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
  XPProgress,
  RawDashboardSummary,
  RawDailyStats,
  RawGoal,
  RawAchievement,
  RawActivityEntry,
  RawXPProgress,
  DailyXP,
  CEFRSkillScore,
  StudyHeatmapEntry,
  VocabGrowthPoint,
  StreakDay,
  AnalyticsSummary,
  RawDailyXP,
  RawCEFRSkillScore,
  RawStudyHeatmapEntry,
  RawVocabGrowthPoint,
  RawStreakDay,
  RawAnalyticsSummary,
} from '../types';
import {
  mapSummary,
  mapDailyStats,
  mapGoal,
  mapAchievement,
  mapActivity,
  mapDailyXP,
  mapCEFRScore,
  mapStudyHeatmap,
  mapVocabGrowth,
  mapStreakDay,
  mapAnalyticsSummary,
  mapXPProgress,
} from '../types';

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

  // Analytics
  xpHistory: DailyXP[];
  cefrRadar: CEFRSkillScore[];
  studyHeatmap: StudyHeatmapEntry[];
  vocabGrowth: VocabGrowthPoint[];
  streakCalendar: StreakDay[];
  analyticsSummary: AnalyticsSummary | null;
  isLoadingAnalytics: boolean;

  // XP Progress
  xpProgress: XPProgress | null;

  // Error
  error: string | null;

  // Actions
  fetchAnalytics: () => Promise<void>;
  fetchXPProgress: () => Promise<void>;
  useFreeze: () => Promise<void>;
  setFreezeConfig: (freezesPerWeek: number) => Promise<void>;
  setXPTarget: (target: number) => Promise<void>;
  setGoalNotification: (goalId: string, notifyAt: string | null, enabled: boolean) => Promise<void>;
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
    xpHistory: [],
    cefrRadar: [],
    studyHeatmap: [],
    vocabGrowth: [],
    streakCalendar: [],
    analyticsSummary: null,
    isLoadingAnalytics: false,
    xpProgress: null,
    error: null,

    fetchAnalytics: async () => {
      set((s) => { s.isLoadingAnalytics = true; });
      try {
        const [xpRaw, cefrRaw, heatmapRaw, vocabRaw, calendarRaw, summaryRaw] =
          await Promise.all([
            invoke<RawDailyXP[]>('dashboard_get_xp_history', { days: 30 }),
            invoke<RawCEFRSkillScore[]>('dashboard_get_cefr_radar'),
            invoke<RawStudyHeatmapEntry[]>('dashboard_get_study_heatmap', { days: 90 }),
            invoke<RawVocabGrowthPoint[]>('dashboard_get_vocab_growth', { days: 90 }),
            invoke<RawStreakDay[]>('dashboard_get_streak_calendar', { days: 365 }),
            invoke<RawAnalyticsSummary>('dashboard_get_analytics_summary'),
          ]);
        set((s) => {
          s.xpHistory = xpRaw.map(mapDailyXP);
          s.cefrRadar = cefrRaw.map(mapCEFRScore);
          s.studyHeatmap = heatmapRaw.map(mapStudyHeatmap);
          s.vocabGrowth = vocabRaw.map(mapVocabGrowth);
          s.streakCalendar = calendarRaw.map(mapStreakDay);
          s.analyticsSummary = mapAnalyticsSummary(summaryRaw);
          s.isLoadingAnalytics = false;
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
          s.isLoadingAnalytics = false;
        });
      }
    },

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

    fetchXPProgress: async () => {
      try {
        const raw = await invoke<RawXPProgress>('dashboard_get_xp_progress');
        set((s) => {
          s.xpProgress = mapXPProgress(raw);
        });
      } catch {
        /* best-effort */
      }
    },

    useFreeze: async () => {
      try {
        await invoke('dashboard_use_freeze');
        const raw = await invoke<RawXPProgress>('dashboard_get_xp_progress');
        set((s) => {
          s.xpProgress = mapXPProgress(raw);
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    setFreezeConfig: async (freezesPerWeek) => {
      try {
        await invoke('dashboard_set_freeze_config', { freezesPerWeek });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    setXPTarget: async (target) => {
      try {
        await invoke('dashboard_set_xp_target', { target });
        const raw = await invoke<RawXPProgress>('dashboard_get_xp_progress');
        set((s) => {
          s.xpProgress = mapXPProgress(raw);
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    setGoalNotification: async (goalId, notifyAt, enabled) => {
      try {
        await invoke('dashboard_set_goal_notification', {
          goalId,
          notifyAt,
          enabled,
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),
  })),
);
