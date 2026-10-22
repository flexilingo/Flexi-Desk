import { describe, expect, it } from 'vitest';
import {
  dayLabelOf,
  deckRows,
  factsOf,
  forecastBars,
  formatClock,
  headlineOf,
  levelBars,
  pct,
  recallRates,
} from '../src/pages/study/lib/studyReport';
import type { SessionInsights } from '../src/pages/study/types';

const insights = (over: Partial<SessionInsights> = {}): SessionInsights => ({
  unique_cards: 20,
  attempts: 31,
  first_try_correct: 9,
  ended_correct: 17,
  active_seconds: 4_000,
  struggles: [],
  by_level: [],
  forecast: [],
  ...over,
});

describe('report panel maths', () => {
  it('the headline states what moved, never an accuracy percentage', () => {
    expect(headlineOf(insights(), 4)).toEqual({ key: 'headlineMastered', count: 4 });
    expect(headlineOf(insights(), 0)).toEqual({ key: 'headlineRecalled', count: 17 });
    expect(headlineOf(insights({ ended_correct: 0 }), 0)).toEqual({ key: 'headlinePlain', count: 20 });
  });

  it('recall: first try vs the end of the session — the distance between them is the work', () => {
    const r = recallRates(insights());
    expect(r.firstTry).toEqual({ value: 9, pct: 45 });
    expect(r.byTheEnd).toEqual({ value: 17, pct: 85 });
    expect(r.gained).toBe(8);
    expect(r.avgAttempts).toBe('1.6');
    expect(recallRates(insights({ unique_cards: 0, attempts: 0 })).avgAttempts).toBe('0.0');
    expect(pct(1, 0)).toBe(0);
  });

  it('facts: words seen, first-try share, active time in hours and minutes', () => {
    expect(factsOf(insights())).toEqual({ seen: 20, firstTryPercent: 45, hours: 1, minutes: 7 });
    expect(factsOf(insights({ active_seconds: 600 }))).toMatchObject({ hours: 0, minutes: 10 });
  });

  it('forecast: bars scale to the heaviest day, and only that day takes the accent', () => {
    const bars = forecastBars([
      { day_offset: 2, count: 10 },
      { day_offset: 0, count: 5 },
      { day_offset: 1, count: 10 },
      { day_offset: -1, count: 99 }, // before today: not a forecast
    ]);
    expect(bars?.map((b) => b.offset)).toEqual([0, 1, 2]);
    expect(bars?.map((b) => b.width)).toEqual([50, 100, 100]);
    expect(bars?.filter((b) => b.isPeak).length).toBe(2); // a tie is a tie
    expect(forecastBars([{ day_offset: 0, count: 0 }, { day_offset: 1, count: 0 }])).toBeNull();
    expect(dayLabelOf(0)).toEqual({ key: 'today' });
    expect(dayLabelOf(1)).toEqual({ key: 'tomorrow' });
    expect(dayLabelOf(4)).toEqual({ key: 'inDays', count: 4 });
  });

  it('misses by level: the bar is the seen count, the cut inside it is the share missed', () => {
    const bars = levelBars([
      { level: 'A1', seen: 8, missed: 0 },
      { level: 'B1', seen: 4, missed: 1 },
      { level: 'C1', seen: 0, missed: 0 },
    ]);
    expect(bars).toEqual([
      { level: 'A1', seen: 8, missed: 0, width: 100, missedPct: 0 },
      { level: 'B1', seen: 4, missed: 1, width: 50, missedPct: 25 },
    ]);
    expect(levelBars([])).toBeNull();
  });

  it('decks: biggest first, each with its share; empty decks drop out', () => {
    const rows = deckRows([
      { deck_id: 'a', deck_title: 'A', count: 3 },
      { deck_id: 'b', deck_title: 'B', count: 9 },
      { deck_id: 'c', deck_title: 'C', count: 0 },
    ]);
    expect(rows.map((r) => [r.deck_id, r.share])).toEqual([['b', 75], ['a', 25]]);
  });

  it('clock: m:ss, growing to h:mm:ss only once it has to', () => {
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(3_725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});
