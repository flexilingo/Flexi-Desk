/**
 * What the overview shows, as pure functions over the data each source returns.
 * Port of the website's `useOverviewData` (priority of the next step, the seven
 * days, the exam state) with the desk's local sources.
 */
import type { ReadingItem } from '@/pages/reader/lib/queue';
import {
  daysUntil,
  examName,
  getExamProfile,
  nextSkill,
  skillStats,
  startOfWeek,
  WEEKLY_TARGET,
  type ExamKey,
  type ExamProfile,
  type ExamSessionLike,
  type Skill,
} from './exam';

// ── Source shapes (what Rust and the edge functions return) ─────────────────

export interface ActivityDay {
  date: string;
  study_minutes: number;
  reviews: number;
  listen_seconds: number;
  read_seconds: number;
  manual_minutes: number;
}

export interface ActivitySnapshot {
  today: string;
  days: ActivityDay[];
  current_streak: number;
  longest_streak: number;
  active_days: number;
  xp_total: number;
  xp_today: number;
}

export interface ListeningEpisode {
  id: string;
  feed_id: string;
  title: string;
  image_url: string | null;
  position_seconds: number;
  duration_seconds: number;
  last_played_at: string;
}

export interface ListeningSnapshot {
  minutes_30: number;
  episodes_started: number;
  followed: number;
  in_progress: ListeningEpisode[];
  artwork: string[];
}

export interface WordsSnapshot {
  total: number;
  new_this_week: number;
  cefr: Record<string, number>;
  notes: number;
}

export interface DeckRow {
  deck_id: string;
  deck_title: string;
  total_cards: number;
  mature_count: number;
  untouched_count: number;
  due_count: number;
}

export interface DailyPlanLike {
  total_cards: number;
  estimated_minutes: number;
}

/** One day of the account's daily stats (`/stats?action=daily`). */
export interface CloudDay {
  date: string;
  time_spent_seconds?: number | null;
  manual_study_minutes?: number | null;
  cards_reviewed?: number | null;
}

// ── Review ──────────────────────────────────────────────────────────────────

export interface ReviewSummary {
  deckCount: number;
  total: number;
  mature: number;
  unseen: number;
  reviewing: number;
  due: number;
  dueDecks: DeckRow[];
  minutes: number;
}

export function buildReview(decks: DeckRow[], plan: DailyPlanLike | null): ReviewSummary {
  const total = decks.reduce((s, d) => s + d.total_cards, 0);
  const mature = decks.reduce((s, d) => s + d.mature_count, 0);
  const unseen = decks.reduce((s, d) => s + d.untouched_count, 0);
  const due = decks.reduce((s, d) => s + d.due_count, 0);
  const dueDecks = decks.filter((d) => d.due_count > 0).sort((a, b) => b.due_count - a.due_count);
  const sessionCards = plan?.total_cards ?? Math.min(due, 50);
  return {
    deckCount: decks.length,
    total,
    mature,
    unseen,
    reviewing: Math.max(0, total - mature - unseen),
    due,
    dueDecks,
    minutes: plan?.estimated_minutes ?? Math.max(1, Math.round(sessionCards / 8)),
  };
}

// ── Listening ───────────────────────────────────────────────────────────────

export interface InProgressEpisode {
  episode: ListeningEpisode;
  href: string;
  minutesLeft: number;
  at: number;
}

export const episodeHref = (episodeId: string) =>
  `/podcast/player/${encodeURIComponent(episodeId)}`;

export function buildListening(snap: ListeningSnapshot | null) {
  const inProgress: InProgressEpisode[] = (snap?.in_progress ?? [])
    .filter((e) => e.position_seconds >= 30)
    .map((episode) => ({
      episode,
      href: episodeHref(episode.id),
      minutesLeft: Math.max(
        1,
        Math.round(Math.max(0, episode.duration_seconds - episode.position_seconds) / 60),
      ),
      at: Date.parse(episode.last_played_at) || 0,
    }));
  return {
    minutes30: snap?.minutes_30 ?? 0,
    episodes: snap?.episodes_started ?? 0,
    followed: snap?.followed ?? 0,
    inProgress,
    artwork: snap?.artwork ?? [],
  };
}
export type ListeningSummary = ReturnType<typeof buildListening>;

// ── Exam ────────────────────────────────────────────────────────────────────

export interface SkillScore {
  skill: Skill;
  /** Mean band of the last five scored sittings, rounded; null = never scored, or only short slices. */
  band: number | null;
  tried: boolean;
}

export interface ExamState {
  exam: ExamKey;
  name: string;
  profile: ExamProfile;
  skills: SkillScore[];
  weakest: Skill | null;
  next: { skill: Skill; tried: boolean; avg: number | null };
  thisWeek: number;
  target: number;
  daysLeft: number | null;
  taken: number;
  open: ExamSessionLike | undefined;
}

export function buildExamState(
  exam: ExamKey | null,
  sessions: ExamSessionLike[],
  examDate: string | null,
  now: Date = new Date(),
): ExamState | null {
  if (!exam) return null;
  const skills: SkillScore[] = skillStats(sessions).map(({ skill, avg, tried }) => ({
    skill,
    band: avg == null ? null : Math.round(avg),
    tried,
  }));
  const scored = skills.filter((s) => s.band != null);
  const weakest =
    scored.length > 1
      ? scored.reduce((low, s) => ((s.band ?? 0) < (low.band ?? 0) ? s : low)).skill
      : null;
  const weekStart = startOfWeek(now);
  return {
    exam,
    name: examName(exam),
    profile: getExamProfile(exam),
    skills,
    weakest,
    next: nextSkill(sessions),
    thisWeek: sessions.filter((s) => new Date(s.created_at).getTime() >= weekStart).length,
    target: WEEKLY_TARGET,
    daysLeft: daysUntil(examDate, now),
    taken: sessions.filter((s) => s.status === 'completed' || s.status === 'scoring').length,
    open: sessions.find((s) => s.status === 'in_progress'),
  };
}

// ── The seven days that end today ───────────────────────────────────────────

export interface WeekDay {
  date: Date;
  minutes: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Minutes of one day on this computer: study + listening + reading + logged by hand. */
export const localMinutes = (d: ActivityDay | undefined) =>
  d ? d.study_minutes + d.manual_minutes + Math.round((d.listen_seconds + d.read_seconds) / 60) : 0;

/** Minutes of one day on the account, as the website counts them. */
export const cloudMinutes = (d: CloudDay | undefined) =>
  d ? Math.round((d.time_spent_seconds ?? 0) / 60) + (d.manual_study_minutes ?? 0) : 0;

/**
 * Seven bars, oldest first, today last. A day is the larger of what this
 * computer and the account know of it: the same minutes can be in both (the
 * desk syncs), and the larger never double-counts them.
 */
export function buildWeek(
  days: ActivityDay[],
  cloud: CloudDay[],
  now: Date = new Date(),
): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - i));
    const key = ymd(date);
    return {
      date,
      minutes: Math.max(
        localMinutes(days.find((d) => d.date === key)),
        cloudMinutes(cloud.find((d) => d.date === key)),
      ),
    };
  });
}

// ── Level (local) ───────────────────────────────────────────────────────────

/** XP needed to reach a level: 50·(level−1)². Level 1 at 0 XP, 2 at 50, 3 at 200, 4 at 450. */
export const xpForLevel = (level: number) => 50 * (level - 1) * (level - 1);
export const levelFromXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;

// ── What to do next ─────────────────────────────────────────────────────────

export type NextStep =
  | { kind: 'practice'; exam: ExamKey; skill: Skill; tried: boolean }
  | { kind: 'review'; due: number; minutes: number }
  | { kind: 'episode'; episode: ListeningEpisode; minutesLeft: number; href: string }
  | { kind: 'book'; item: ReadingItem }
  | { kind: 'start' }
  | { kind: 'library' }
  | { kind: 'examHub' };

/**
 * The ranked next steps (at most three): the exam leads while this week's
 * practices are short of the target, then due reviews, then the two most
 * recent things to continue (episode / book), then the exam practice, then —
 * with nothing at all — the start and the library; and "preparing for an exam?"
 * for someone with no exam.
 *
 * `practiceAvailable` is false for an exam the desk cannot run yet (TCF): no
 * practice step is offered rather than one that cannot start.
 */
export function buildSteps(input: {
  exam: ExamState | null;
  hasExam: boolean;
  practiceAvailable: boolean;
  review: Pick<ReviewSummary, 'due' | 'minutes'>;
  inProgress: InProgressEpisode[];
  readingInProgress: ReadingItem[];
}): NextStep[] {
  const { exam, review } = input;
  const list: NextStep[] = [];
  const practice: NextStep | null =
    exam && input.practiceAvailable
      ? { kind: 'practice', exam: exam.exam, skill: exam.next.skill, tried: exam.next.tried }
      : null;

  if (practice && exam && exam.thisWeek < exam.target) list.push(practice);
  if (review.due > 0) list.push({ kind: 'review', due: review.due, minutes: review.minutes });

  const continuing: { at: number; step: NextStep }[] = [
    ...input.inProgress.map((x) => ({
      at: x.at,
      step: {
        kind: 'episode',
        episode: x.episode,
        minutesLeft: x.minutesLeft,
        href: x.href,
      } as NextStep,
    })),
    ...input.readingInProgress.map((item) => ({
      at: item.activityAt,
      step: { kind: 'book', item } as NextStep,
    })),
  ].sort((a, b) => b.at - a.at);
  list.push(...continuing.slice(0, 2).map((c) => c.step));

  if (practice && !list.includes(practice)) list.push(practice);
  if (list.length === 0) list.push({ kind: 'start' }, { kind: 'library' });
  if (!input.hasExam) list.push({ kind: 'examHub' });
  return list.slice(0, 3);
}

export type StationKey = 'listen' | 'words' | 'review' | 'exam';
export const STATION_ORDER: StationKey[] = ['listen', 'words', 'review', 'exam'];

/** Which learning-path station the page's next step belongs to. */
export function stationOf(step: NextStep | undefined): StationKey {
  if (!step) return 'listen';
  if (step.kind === 'practice') return 'exam';
  if (step.kind === 'review') return 'review';
  return 'listen';
}

/** Reading items the learner has started, not finished and can open. */
export const readingInProgress = (reading: ReadingItem[]) =>
  reading.filter((r) => r.started && !r.finished && r.status === 'ready');
