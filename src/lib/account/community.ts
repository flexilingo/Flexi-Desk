import type { Author, CommunityTopic, TopicStatus, VoteType } from './types';

export const STATUS_TABS = ['all', 'open', 'in-progress', 'completed'] as const;
/** Newest first: a topic posted a minute ago scores 0 and would sink under score order. */
export const DEFAULT_SORT = 'date';
export const PAGE_SIZE = 20;

// ── votes ─────────────────────────────────────────────────

export interface VoteState {
  vote: VoteType | null;
  score: number;
  up: number;
  down: number;
}

export function voteStateOf(
  topic: Pick<CommunityTopic, 'user_vote' | 'score' | 'upvote_count' | 'downvote_count'>,
): VoteState {
  return {
    vote: topic.user_vote ?? null,
    score: topic.score,
    up: topic.upvote_count,
    down: topic.downvote_count,
  };
}

/**
 * The optimistic result of pressing a vote button: pressing the vote you already cast
 * takes it back. Counts and score wait for the server's answer (`applyVoteResult`).
 */
export function optimisticVote(state: VoteState, pressed: VoteType): VoteState {
  return { ...state, vote: state.vote === pressed ? null : pressed };
}

export function applyVoteResult(
  state: VoteState,
  result: {
    score?: number;
    upvote_count?: number;
    downvote_count?: number;
    vote_type?: VoteType | null;
  },
): VoteState {
  return {
    vote: result.vote_type === undefined ? state.vote : result.vote_type,
    score: result.score ?? state.score,
    up: result.upvote_count ?? state.up,
    down: result.downvote_count ?? state.down,
  };
}

// ── what the person may do with a topic ───────────────────

export interface TopicRights {
  isPending: boolean;
  isOwner: boolean;
  /** The author answers a completed topic: their comment reopens it. */
  canReopen: boolean;
  canComment: boolean;
  /** Edit/delete: only the author, only until the work starts. */
  canManage: boolean;
  /** "We started building it" (author only). */
  isBeingBuilt: boolean;
  showVotes: boolean;
}

export function topicRights(
  topic: Pick<CommunityTopic, 'status' | 'user_id'>,
  userId: string | null | undefined,
): TopicRights {
  const isPending = topic.status === 'pending';
  const isOwner = !!userId && topic.user_id === userId;
  const canReopen = isOwner && topic.status === 'completed';
  return {
    isPending,
    isOwner,
    canReopen,
    canComment:
      topic.status === 'open' ||
      topic.status === 'in-progress' ||
      canReopen ||
      (isPending && isOwner),
    canManage: isOwner && (topic.status === 'pending' || topic.status === 'open'),
    isBeingBuilt: isOwner && (topic.status === 'in-progress' || topic.status === 'completed'),
    showVotes: !isPending,
  };
}

/** The author's own pending topics, pinned above the board on the unfiltered first page. */
export function pinnedTopics(
  mine: CommunityTopic[] | undefined,
  page: number,
  statusFilter: string,
): CommunityTopic[] {
  if (page !== 0 || statusFilter !== 'all') return [];
  return (mine ?? []).filter((t) => t.status === 'pending');
}

export function visibleTopics(
  pinned: CommunityTopic[],
  topics: CommunityTopic[],
): CommunityTopic[] {
  const ids = new Set(pinned.map((t) => t.id));
  return [...pinned, ...topics.filter((t) => !ids.has(t.id))];
}

export function validateTopic(
  title: string,
  description: string,
): 'titleTooShort' | 'descriptionTooShort' | null {
  if (title.trim().length < 3) return 'titleTooShort';
  if (description.trim().length < 10) return 'descriptionTooShort';
  return null;
}

/** Community topics need their own words in the status chip. */
export function statusKey(
  s: TopicStatus,
): 'pending' | 'open' | 'inProgress' | 'completed' | 'rejected' {
  return s === 'in-progress' ? 'inProgress' : s;
}

// ── names ─────────────────────────────────────────────────

const ASCII_HANDLE = /^[a-z0-9][a-z0-9._-]*$/i;
const EDGE_DIGITS = /^[0-9]+|[0-9]+$/g;

/**
 * An email handle must never be shown as a person's name (it hands over the address).
 * "f.fakharan.69" reads "F. Fakharan"; "a93010965" reads nothing (callers show
 * "Anonymous"). A name written in any script, or with spaces, is kept as typed.
 */
export function formatAuthorName(name?: string | null): string | null {
  const raw = (name ?? '').trim();
  if (!raw) return null;
  if (!ASCII_HANDLE.test(raw)) return raw;
  const parts = raw
    .split(/[._-]+/)
    .map((p) => p.replace(EDGE_DIGITS, ''))
    .filter(Boolean);
  if (parts.length === 0 || parts.some((p) => /[0-9]/.test(p))) return null;
  if (!parts.some((p) => p.length > 1)) return null;
  return parts
    .map((p) => (p.length === 1 ? `${p.toUpperCase()}.` : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export function authorLabel(p: Author | undefined | null): string | null {
  return formatAuthorName(p?.display_name) || formatAuthorName(p?.username);
}

/** The first line of a description without Markdown marks (topic cards). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*\d.\s]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "3 days ago" in the learner's language. */
export function timeAgo(iso: string, locale: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff), 'second');
}
