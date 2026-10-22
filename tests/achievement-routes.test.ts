import { describe, expect, it } from 'vitest';
import { ACTION_ROUTES } from '@/pages/dashboard/overview/AchievementsCard';

// The website's achievement catalogue (AchievementDetailDialog) plus desk's own groups.
const WEB_KEYS = [
  'streak_master', 'word_scholar', 'precision_expert', 'goal_crusher', 'card_master',
  'perfect_session', 'flashcard_pro', 'cloze_champion', 'dictation_master', 'quiz_conqueror',
  'video_explorer', 'time_investor', 'xp_champion', 'level_legend', 'deck_creator',
  'knowledge_sharer', 'early_bird', 'night_owl', 'weekend_warrior', 'multi_mode',
];
const DESK_KEYS = ['episode_explorer', 'bookworm', 'steady_learner'];
// Top-level desk routes that exist in App.tsx
const ROUTES = ['/', '/podcast', '/videos', '/reader', '/study', '/review', '/explore', '/vocabulary', '/account'];

describe('achievement action routes', () => {
  it('maps every website key and every desk key', () => {
    for (const k of [...WEB_KEYS, ...DESK_KEYS]) expect(ACTION_ROUTES[k], k).toBeTruthy();
  });
  it('only points at real desk routes', () => {
    for (const [k, r] of Object.entries(ACTION_ROUTES)) {
      expect(ROUTES.some((p) => r === p || (p !== '/' && r.startsWith(`${p}/`))), `${k} -> ${r}`).toBe(true);
    }
  });
  it('sends dictation_master to the podcast library, never the excluded daily-study path', () => {
    expect(ACTION_ROUTES.dictation_master).toBe('/podcast');
    expect(Object.values(ACTION_ROUTES).some((r) => r.includes('daily-study'))).toBe(false);
  });
});
