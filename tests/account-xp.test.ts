import { describe, it, expect } from 'vitest';
import {
  dailyAccuracy,
  groupLogs,
  localDailyToStats,
  localXpToSummaries,
  xpSummary,
} from '@/lib/account/xp';
import type { XPDailySummary } from '@/lib/account/types';

const day = (date: string, xp: number, sources: string[] = ['words_reviewed']): XPDailySummary => ({
  activity_date: date,
  total_xp: xp,
  logs: sources.map((s, i) => ({
    id: `${date}${i}`,
    source: s as never,
    xp_amount: xp / sources.length,
  })),
});

describe('xp history', () => {
  it('groups events by source', () => {
    const g = groupLogs([
      { id: '1', source: 'words_reviewed', xp_amount: 5 },
      { id: '2', source: 'words_reviewed', xp_amount: 7 },
      { id: '3', source: 'streak_bonus', xp_amount: 10 },
    ]);
    expect(g).toEqual([
      { source: 'words_reviewed', count: 2, totalXp: 12 },
      { source: 'streak_bonus', count: 1, totalXp: 10 },
    ]);
  });
  it('summarises a page: goals met, best day, chart oldest first', () => {
    const s = xpSummary([
      day('2026-10-21', 40, ['words_reviewed', 'daily_goal_bonus']),
      day('2026-10-20', 90),
      day('2026-10-19', 10),
    ]);
    expect(s.goalMetDays).toBe(1);
    expect(s.bestDay).toBe('2026-10-20');
    expect(s.maxXp).toBe(90);
    expect(s.chart.map((c) => c.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });
  it('no best day for a single day', () => {
    expect(xpSummary([day('2026-10-21', 5)]).bestDay).toBeNull();
  });
  it("turns this computer's XP into the same shape, newest first, skipping empty days", () => {
    const r = localXpToSummaries([
      { date: '2026-10-19', total_xp: 0 },
      {
        date: '2026-10-20',
        total_xp: 30,
        breakdown: [
          { module: 'review', xp: 20 },
          { module: 'podcast', xp: 10 },
        ],
      },
      { date: '2026-10-21', total_xp: 8 },
    ]);
    expect(r.map((d) => d.activity_date)).toEqual(['2026-10-21', '2026-10-20']);
    expect(r[1].logs).toHaveLength(2);
    expect(r[0].logs[0].xp_amount).toBe(8);
  });
  it('accuracy and local daily rows', () => {
    expect(dailyAccuracy(3, 1)).toBe(75);
    expect(dailyAccuracy(0, 0)).toBe(0);
    expect(
      localDailyToStats([
        { date: 'd', study_minutes: 5, words_learned: 2, reviews_completed: 9 },
      ])[0].cards_reviewed,
    ).toBe(9);
  });
});
