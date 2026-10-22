import { describe, it, expect } from 'vitest';
import type { ReadingItem } from '@/pages/reader/lib/queue';
import {
  buildExamState,
  buildListening,
  buildReview,
  buildSteps,
  buildWeek,
  levelFromXp,
  stationOf,
  xpForLevel,
  ymd,
  type ActivityDay,
  type InProgressEpisode,
  type NextStep,
} from '@/pages/dashboard/overview/model';
import { nextSkill, resolveExamGoalPanelMode, startOfWeek, SNOOZE_MS, type ExamSessionLike } from '@/pages/dashboard/overview/exam';
import { groupAchievements } from '@/pages/dashboard/overview/AchievementsCard';
import { nextUnannounced } from '@/pages/dashboard/overview/toasts';
import type { Achievement } from '@/pages/dashboard/types';

const session = (over: Partial<ExamSessionLike> = {}): ExamSessionLike => ({
  id: 's1',
  status: 'completed',
  exam_type: 'celpip',
  mode: 'practice',
  listening_score: null,
  reading_score: null,
  writing_score: null,
  speaking_score: null,
  created_at: new Date().toISOString(),
  ...over,
});
const episode = (at: number): InProgressEpisode => ({
  episode: { id: `e${at}`, feed_id: 'f', title: 'Ep', image_url: null, position_seconds: 100, duration_seconds: 700, last_played_at: new Date(at).toISOString() },
  href: `/podcast/player/e${at}`,
  minutesLeft: 10,
  at,
});
const book = (at: number): ReadingItem => ({ id: `b${at}`, title: 'Book', activityAt: at, href: '/reader/book/b', started: true, finished: false, status: 'ready', page: 3, pageCount: 10 }) as ReadingItem;
const base = { hasExam: false, practiceAvailable: false, review: { due: 0, minutes: 1 }, inProgress: [], readingInProgress: [] };
const kinds = (steps: NextStep[]) => steps.map((s) => s.kind);

describe('next step priority', () => {
  it('leads with exam practice while this week is under the target, then reviews, then the newest thing to continue', () => {
    const exam = buildExamState('celpip', [], null)!;
    const steps = buildSteps({
      ...base,
      exam,
      hasExam: true,
      practiceAvailable: true,
      review: { due: 12, minutes: 3 },
      inProgress: [episode(1000)],
      readingInProgress: [book(2000)],
    });
    expect(kinds(steps)).toEqual(['practice', 'review', 'book']);
  });

  it('puts reviews first once the weekly target is met, and keeps practice after the continue items', () => {
    const sessions = [session({ id: 'a' }), session({ id: 'b' }), session({ id: 'c' })];
    const exam = buildExamState('celpip', sessions, null)!;
    expect(exam.thisWeek).toBe(3);
    const steps = buildSteps({ ...base, exam, hasExam: true, practiceAvailable: true, review: { due: 5, minutes: 2 }, inProgress: [episode(1000)] });
    expect(kinds(steps)).toEqual(['review', 'episode', 'practice']);
  });

  it('offers no practice for an exam the desk cannot run, and asks about an exam when there is none', () => {
    const exam = buildExamState('tcf', [], null)!;
    expect(kinds(buildSteps({ ...base, exam, hasExam: true, practiceAvailable: false, review: { due: 1, minutes: 1 } }))).toEqual(['review']);
    expect(kinds(buildSteps({ ...base, exam: null, review: { due: 1, minutes: 1 } }))).toEqual(['review', 'examHub']);
  });

  it('starts from nothing with the first step and the library', () => {
    expect(kinds(buildSteps({ ...base, exam: null, hasExam: true }))).toEqual(['start', 'library']);
    expect(kinds(buildSteps({ ...base, exam: null }))).toEqual(['start', 'library', 'examHub']);
  });

  it('keeps at most three and only the two most recent continue items', () => {
    const steps = buildSteps({ ...base, exam: null, hasExam: true, inProgress: [episode(1), episode(5)], readingInProgress: [book(3)] });
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => (s.kind === 'episode' ? s.episode.id : s.kind === 'book' ? s.item.id : ''))).toEqual(['e5', 'b3']);
  });

  it('maps the first step to its learning-path station', () => {
    expect(stationOf({ kind: 'practice', exam: 'celpip', skill: 'reading', tried: false })).toBe('exam');
    expect(stationOf({ kind: 'review', due: 1, minutes: 1 })).toBe('review');
    expect(stationOf({ kind: 'start' })).toBe('listen');
    expect(stationOf(undefined)).toBe('listen');
  });
});

describe('exam state', () => {
  it('picks an untried skill first, then the lowest average, ignoring short TCF slices', () => {
    expect(nextSkill([]).skill).toBe('listening');
    const all = session({ listening_score: 9, reading_score: 5, writing_score: 8, speaking_score: 7 });
    expect(nextSkill([all])).toMatchObject({ skill: 'reading', tried: true });
    // a ten-item TCF slice stores the floor score and must not make Listening "lowest"
    const slice = session({ exam_type: 'tcf', listening_score: 100, practice_config: { listening: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, reading_score: 400, writing_score: 412, speaking_score: 412 });
    expect(nextSkill([slice]).skill).toBe('reading');
  });

  it('counts this week from Monday and finds the open sitting', () => {
    const monday = new Date(startOfWeek(new Date()));
    const old = new Date(monday.getTime() - 86_400_000).toISOString();
    const e = buildExamState('celpip', [session({ created_at: old }), session({ id: 'o', status: 'in_progress' })], '2999-01-01')!;
    expect(e.thisWeek).toBe(1);
    expect(e.open?.id).toBe('o');
    expect(e.taken).toBe(1);
    expect(e.daysLeft).toBeGreaterThan(0);
  });

  it('shows the goal panel in the right mode', () => {
    const now = 10 * SNOOZE_MS;
    const input = { examGoal: null, snoozedAt: 0, now, nudgeDismissed: false };
    expect(resolveExamGoalPanelMode(input)).toBe('compact');
    expect(resolveExamGoalPanelMode({ ...input, cameForExam: true })).toBe('full');
    expect(resolveExamGoalPanelMode({ ...input, nudgeDismissed: true })).toBeNull();
    expect(resolveExamGoalPanelMode({ ...input, snoozedAt: now - SNOOZE_MS + 1000 })).toBeNull();
    expect(resolveExamGoalPanelMode({ ...input, examGoal: 'celpip' })).toBeNull();
    expect(resolveExamGoalPanelMode({ ...input, examGoal: 'none' })).toBeNull();
  });
});

describe('week aggregation', () => {
  const day = (offset: number, over: Partial<ActivityDay>): ActivityDay => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return { date: ymd(d), study_minutes: 0, reviews: 0, listen_seconds: 0, read_seconds: 0, manual_minutes: 0, ...over };
  };

  it('returns seven days ending today with study, listening, reading and manual minutes added', () => {
    const week = buildWeek([day(0, { study_minutes: 10, listen_seconds: 600, read_seconds: 300, manual_minutes: 5 }), day(3, { manual_minutes: 20 })], []);
    expect(week).toHaveLength(7);
    expect(ymd(week[6].date)).toBe(ymd(new Date()));
    expect(week[6].minutes).toBe(10 + 10 + 5 + 5);
    expect(week[3].minutes).toBe(20);
    expect(week[0].minutes).toBe(0);
  });

  it('takes the larger of this computer and the account for a day, never the sum', () => {
    const cloudDay = { date: ymd(new Date()), time_spent_seconds: 3000, manual_study_minutes: 5 };
    expect(buildWeek([day(0, { study_minutes: 20 })], [cloudDay])[6].minutes).toBe(55);
    expect(buildWeek([day(0, { study_minutes: 90 })], [cloudDay])[6].minutes).toBe(90);
  });
});

describe('review, listening, level', () => {
  it('sums decks, sorts the due ones and estimates minutes', () => {
    const r = buildReview(
      [
        { deck_id: 'a', deck_title: 'A', total_cards: 50, mature_count: 10, untouched_count: 20, due_count: 4 },
        { deck_id: 'b', deck_title: 'B', total_cards: 10, mature_count: 0, untouched_count: 0, due_count: 9 },
      ],
      null,
    );
    expect(r).toMatchObject({ total: 60, mature: 10, unseen: 20, reviewing: 30, due: 13, minutes: 2 });
    expect(r.dueDecks.map((d) => d.deck_id)).toEqual(['b', 'a']);
  });

  it('keeps only episodes with 30 s or more played and at least one minute left', () => {
    const l = buildListening({
      minutes_30: 12,
      episodes_started: 3,
      followed: 1,
      artwork: [],
      in_progress: [
        { id: 'x', feed_id: 'f', title: 'X', image_url: null, position_seconds: 10, duration_seconds: 600, last_played_at: '2026-10-01T00:00:00Z' },
        { id: 'y', feed_id: 'f', title: 'Y', image_url: null, position_seconds: 595, duration_seconds: 600, last_played_at: '2026-10-01T00:00:00Z' },
      ],
    });
    expect(l.inProgress.map((e) => e.episode.id)).toEqual(['y']);
    expect(l.inProgress[0].minutesLeft).toBe(1);
  });

  it('derives the level from XP with thresholds that match', () => {
    expect([0, 49, 50, 199, 200].map(levelFromXp)).toEqual([1, 1, 2, 2, 3]);
    expect(xpForLevel(levelFromXp(450))).toBe(450);
  });
});

describe('achievements', () => {
  const a = (key: string, threshold: number, value: number, unlocked: boolean): Achievement => ({
    id: key, achievementKey: key, title: key, category: 'general', threshold, currentValue: value, isUnlocked: unlocked, createdAt: '', description: undefined, icon: undefined, unlockedAt: undefined,
  });
  it('groups tiers, finds the next one and its progress', () => {
    const [g] = groupAchievements([a('word_scholar_50', 50, 12, false), a('word_scholar_10', 10, 12, true)]);
    expect(g.key).toBe('word_scholar');
    expect(g.current?.threshold).toBe(10);
    expect(g.next?.threshold).toBe(50);
    expect(g.ratio).toBeCloseTo(0.24);
  });
  it('announces only newly unlocked ones, and nothing on the very first look', () => {
    const list = [a('x_1', 1, 1, true), a('y_1', 1, 1, true)];
    expect(nextUnannounced(list, null)).toBeNull();
    expect(nextUnannounced(list, ['x_1'])?.achievementKey).toBe('y_1');
    expect(nextUnannounced(list, ['x_1', 'y_1'])).toBeNull();
  });
});
