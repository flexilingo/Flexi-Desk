/**
 * Every call the overview makes. Local data comes from Tauri commands, the
 * account's data through `supabaseCall` (signed in only).
 */
import { invoke } from '@tauri-apps/api/core';
import { supabaseCall } from '@/lib/supabase';
import { getMySessions, startPractice } from '@/pages/celpip/services/celpipCloud';
import type { StartPracticePayload } from '@/pages/celpip/types';
import type { RawAchievement, RawGoal } from '../types';
import type {
  ActivitySnapshot,
  CloudDay,
  DailyPlanLike,
  DeckRow,
  ListeningSnapshot,
  WordsSnapshot,
} from './model';
import type { ExamSessionLike } from './exam';

// ── Local ───────────────────────────────────────────────────────────────────

export const getActivity = () => invoke<ActivitySnapshot>('overview_get_activity');
export const getListening = () => invoke<ListeningSnapshot>('overview_get_listening');
export const getWords = () => invoke<WordsSnapshot>('overview_get_words');
export const refreshAchievements = () => invoke<RawAchievement[]>('overview_refresh_achievements');
export const setManualMinutes = (date: string, minutes: number) =>
  invoke<void>('overview_set_manual_minutes', { date, minutes });

export const getDeckStatus = () =>
  invoke<{ decks: DeckRow[] }>('study_deck_status').then((r) => r.decks ?? []);
export const getDailyPlan = () =>
  invoke<{ plan: DailyPlanLike }>('study_get_daily_plan').then((r) => r.plan ?? null);

export const getGoals = () => invoke<RawGoal[]>('dashboard_list_goals');
export const createGoal = (targetValue: number) =>
  invoke<RawGoal>('dashboard_create_goal', {
    goalType: 'daily_minutes',
    targetValue,
    period: 'daily',
  });
export const deleteGoal = (id: string) => invoke<void>('dashboard_delete_goal', { id });

// ── Account ─────────────────────────────────────────────────────────────────

export interface UserSettings {
  exam_goal: string | null;
  exam_date: string | null;
  learning_language?: string | null;
  current_cefr_level?: string | null;
  official_result?: unknown;
}

export interface GoalSuggestion {
  type: 'increase' | 'decrease';
  days_met: number;
  current_goal: number;
  suggested_goal: number;
}

export interface Gamification {
  current_streak: number;
  longest_streak: number;
  level: number | null;
  goal_suggestion?: GoalSuggestion | null;
}

export interface Announcement {
  id: string;
  slot: string;
  title: string | null;
  message: string;
  button_text: string | null;
  dismiss_type: 'button' | 'tap_anywhere' | 'auto' | 'none';
  auto_dismiss_seconds: number;
}

export const getUserSettings = () => supabaseCall<UserSettings>('GET', '/user-settings');
export const updateUserSettings = (updates: Record<string, unknown>) =>
  supabaseCall<UserSettings>('PATCH', '/user-settings', updates);
export const getGamification = () =>
  supabaseCall<Gamification>('GET', '/stats?action=gamification');
export const getAccuracy = () =>
  supabaseCall<{ accuracy_rate?: number }>('POST', '/stats?action=user-statistics', {}).then(
    (r) => r.accuracy_rate ?? null,
  );
export const getCloudDays = (from: string, to: string) =>
  supabaseCall<CloudDay[]>('GET', `/stats?action=daily&date_from=${from}&date_to=${to}`).then(
    (r) => (Array.isArray(r) ? r : []),
  );
export const getExamSessions = (exam: string) => getMySessions(exam) as Promise<ExamSessionLike[]>;
export const startExamPractice = (payload: StartPracticePayload) => startPractice(payload);
export const saveManualMinutesToAccount = (date: string, minutes: number) =>
  supabaseCall('POST', '/manual-study-time', { date, minutes });
export const getAnnouncements = (locale: string) =>
  supabaseCall<{ announcements: Announcement[] }>(
    'GET',
    `/app-config?action=announcements&locale=${encodeURIComponent(locale)}&slot=dashboard_banner&platform=web`,
  ).then((r) => r.announcements ?? []);
export const acceptGoalSuggestion = (newGoal: number) =>
  supabaseCall('POST', '/accept-goal-suggestion', { new_goal: newGoal });
export const dismissGoalSuggestion = () => supabaseCall('POST', '/dismiss-goal-suggestion', {});
