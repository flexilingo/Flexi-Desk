import type { SessionInsights } from '../types';

/**
 * The maths behind the end-of-session report panels, kept apart from the markup so
 * it can be tested. Everything here is counted per CARD (see `SessionInsights`).
 */

export const pct = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * 100) : 0;

/** States what MOVED — never an accuracy percentage, which punishes the very re-showing the scheduler is built on. */
export type HeadlineKey = 'headlineMastered' | 'headlineRecalled' | 'headlinePlain';

export function headlineOf(
  insights: Pick<SessionInsights, 'ended_correct' | 'unique_cards'>,
  newlyMastered: number,
): { key: HeadlineKey; count: number } {
  if (newlyMastered > 0) return { key: 'headlineMastered', count: newlyMastered };
  if (insights.ended_correct > 0) return { key: 'headlineRecalled', count: insights.ended_correct };
  return { key: 'headlinePlain', count: insights.unique_cards };
}

export function factsOf(insights: SessionInsights): {
  seen: number;
  firstTryPercent: number;
  hours: number;
  minutes: number;
} {
  const mins = Math.max(0, Math.round(insights.active_seconds / 60));
  return {
    seen: insights.unique_cards,
    firstTryPercent: pct(insights.first_try_correct, insights.unique_cards),
    hours: Math.floor(mins / 60),
    minutes: mins % 60,
  };
}

/** Two rates, not one: the distance between them is the work the session did. */
export function recallRates(insights: SessionInsights) {
  const {
    unique_cards: total,
    first_try_correct: first,
    ended_correct: ended,
    attempts,
  } = insights;
  return {
    total,
    firstTry: { value: first, pct: pct(first, total) },
    byTheEnd: { value: ended, pct: pct(ended, total) },
    gained: ended - first,
    attempts,
    avgAttempts: total > 0 ? (attempts / total).toFixed(1) : '0.0',
  };
}

/** The next days of due cards, as bar widths; `null` when nothing is coming back. */
export function forecastBars(forecast: SessionInsights['forecast']) {
  const days = forecast
    .filter((d) => d.day_offset >= 0)
    .sort((a, b) => a.day_offset - b.day_offset);
  if (days.every((d) => d.count === 0)) return null;
  const peak = Math.max(...days.map((d) => d.count), 1);
  return days.map((d) => ({
    offset: d.day_offset,
    count: d.count,
    width: Math.round((d.count / peak) * 100),
    // The heaviest day is the one worth noticing, so it alone takes the accent.
    isPeak: d.count === peak && d.count > 0,
  }));
}

export type DayLabel = { key: 'today' | 'tomorrow' | 'inDays'; count?: number };
export const dayLabelOf = (offset: number): DayLabel =>
  offset === 0
    ? { key: 'today' }
    : offset === 1
      ? { key: 'tomorrow' }
      : { key: 'inDays', count: offset };

/** Misses by CEFR level: each bar is drawn from the level's seen count; the miss is a cut inside it. */
export function levelBars(byLevel: SessionInsights['by_level']) {
  const levels = byLevel.filter((l) => l.seen > 0);
  if (levels.length === 0) return null;
  const peak = Math.max(...levels.map((l) => l.seen), 1);
  return levels.map((l) => ({
    level: l.level,
    seen: l.seen,
    missed: l.missed,
    width: Math.round((l.seen / peak) * 100),
    missedPct: pct(l.missed, l.seen),
  }));
}

/** The decks the session's cards came from, biggest first, with each one's share. */
export function deckRows(decks: { deck_id: string; deck_title: string; count: number }[]) {
  const rows = decks.filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, d) => sum + d.count, 0);
  return rows.map((d) => ({ ...d, share: pct(d.count, total) }));
}

/** Whole seconds -> m:ss, growing to h:mm:ss only once it has to. */
export function formatClock(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
