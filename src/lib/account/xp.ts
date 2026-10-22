import type { XPDailySummary, XPLogItem, XPSource } from './types';

export const XP_PAGE_SIZE = 20;

export interface GroupedLog {
  source: XPSource;
  count: number;
  totalXp: number;
}

export function groupLogs(logs: XPLogItem[]): GroupedLog[] {
  const map = new Map<XPSource, GroupedLog>();
  for (const l of logs) {
    const g = map.get(l.source) ?? { source: l.source, count: 0, totalXp: 0 };
    g.count += 1;
    g.totalXp += l.xp_amount;
    map.set(l.source, g);
  }
  return [...map.values()];
}

export const hasGoalBonus = (d: XPDailySummary) =>
  d.logs.some((l) => l.source === 'daily_goal_bonus');

export function xpSummary(items: XPDailySummary[]) {
  const goalMetDays = items.filter(hasGoalBonus).length;
  const bestDay =
    items.length > 1
      ? items.reduce((b, i) => (i.total_xp > b.total_xp ? i : b), items[0]).activity_date
      : null;
  const maxXp = Math.max(1, ...items.map((i) => i.total_xp));
  const chart = [...items].reverse().map((i) => ({ date: i.activity_date, xp: i.total_xp }));
  return { goalMetDays, bestDay, maxXp, chart };
}

/**
 * XP of this computer, shaped like the account's history so one page draws both.
 * `days` come from `dashboard_get_xp_history`: newest last, each with a per-module
 * breakdown that has no per-event rows, so each module is one event.
 */
export function localXpToSummaries(
  days: { date: string; total_xp: number; breakdown?: { module: string; xp: number }[] }[],
): XPDailySummary[] {
  return [...days]
    .filter((d) => d.total_xp > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      activity_date: d.date,
      total_xp: d.total_xp,
      logs: (d.breakdown?.length ? d.breakdown : [{ module: 'words', xp: d.total_xp }]).map(
        (b, i) => ({
          id: `${d.date}-${i}`,
          source: 'words_reviewed' as XPSource,
          xp_amount: b.xp,
          source_detail: { estimated: true },
        }),
      ),
    }));
}

export function dailyAccuracy(correct: number, incorrect: number): number {
  const total = correct + incorrect;
  return total > 0 ? (correct / total) * 100 : 0;
}

/** Local `daily_stats` rows (no right/wrong split) as the account's chart rows. */
export function localDailyToStats(
  rows: { date: string; study_minutes: number; words_learned: number; reviews_completed: number }[],
) {
  return rows.map((r) => ({
    date: r.date,
    cards_reviewed: r.reviews_completed,
    correct_answers: 0,
    incorrect_answers: 0,
    minutes: r.study_minutes,
    words: r.words_learned,
  }));
}
