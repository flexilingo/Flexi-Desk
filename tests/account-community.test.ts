import { describe, it, expect } from 'vitest';
import {
  applyVoteResult,
  formatAuthorName,
  optimisticVote,
  pinnedTopics,
  statusKey,
  stripMarkdown,
  timeAgo,
  topicRights,
  validateTopic,
  visibleTopics,
  voteStateOf,
} from '@/lib/account/community';
import { topicsPath } from '@/lib/account/api';
import type { CommunityTopic } from '@/lib/account/types';

const topic = (o: Partial<CommunityTopic> = {}): CommunityTopic => ({
  id: 't1',
  user_id: 'u1',
  title: 'x',
  description: 'y',
  category: null,
  status: 'open',
  upvote_count: 3,
  downvote_count: 1,
  comment_count: 0,
  score: 2,
  view_count: 0,
  created_at: '',
  updated_at: '',
  ...o,
});

describe('votes', () => {
  const s = voteStateOf(topic({ user_vote: null }));
  it('pressing selects, pressing the same again takes it back', () => {
    const up = optimisticVote(s, 'upvote');
    expect(up.vote).toBe('upvote');
    expect(optimisticVote(up, 'upvote').vote).toBeNull();
    expect(optimisticVote(up, 'downvote').vote).toBe('downvote');
  });
  it('the server answer sets counts, score and the final vote', () => {
    const r = applyVoteResult(optimisticVote(s, 'upvote'), {
      score: 5,
      upvote_count: 4,
      downvote_count: 1,
      vote_type: 'upvote',
    });
    expect(r).toEqual({ vote: 'upvote', score: 5, up: 4, down: 1 });
    expect(applyVoteResult(r, { vote_type: null, score: 4 }).vote).toBeNull();
  });
  it('keeps what the server did not send', () => {
    expect(applyVoteResult(s, {}).score).toBe(2);
  });
});

describe('what a person may do with a topic', () => {
  it('open topic: anyone comments and votes, only the author manages', () => {
    const r = topicRights(topic(), 'u2');
    expect(r).toMatchObject({
      canComment: true,
      canManage: false,
      showVotes: true,
      isOwner: false,
    });
    expect(topicRights(topic(), 'u1').canManage).toBe(true);
  });
  it('pending: private thread with the author, no votes', () => {
    const p = topic({ status: 'pending' });
    expect(topicRights(p, 'u1')).toMatchObject({
      canComment: true,
      canManage: true,
      showVotes: false,
      isPending: true,
    });
    expect(topicRights(p, 'u2').canComment).toBe(false);
  });
  it('completed: only the author can answer, and that reopens it', () => {
    const c = topic({ status: 'completed' });
    expect(topicRights(c, 'u1')).toMatchObject({
      canReopen: true,
      canComment: true,
      isBeingBuilt: true,
      canManage: false,
    });
    expect(topicRights(c, 'u2').canComment).toBe(false);
  });
  it('in progress: comments stay open, the author can no longer edit', () => {
    const p = topic({ status: 'in-progress' });
    expect(topicRights(p, 'u2').canComment).toBe(true);
    expect(topicRights(p, 'u1')).toMatchObject({ canManage: false, isBeingBuilt: true });
  });
  it('rejected is closed; signed out can do nothing', () => {
    expect(topicRights(topic({ status: 'rejected' }), 'u1').canComment).toBe(false);
    expect(topicRights(topic(), null).isOwner).toBe(false);
  });
});

describe('board', () => {
  const pending = topic({ id: 'p', status: 'pending' });
  it('pins own pending topics only on the unfiltered first page', () => {
    expect(pinnedTopics([pending, topic()], 0, 'all')).toEqual([pending]);
    expect(pinnedTopics([pending], 1, 'all')).toEqual([]);
    expect(pinnedTopics([pending], 0, 'open')).toEqual([]);
  });
  it('does not list a pinned topic twice', () => {
    expect(visibleTopics([pending], [pending, topic({ id: 'b' })]).map((t) => t.id)).toEqual([
      'p',
      'b',
    ]);
  });
  it('builds the same query the website sends', () => {
    expect(topicsPath({ status: 'open', sortBy: 'date', limit: 20, offset: 40 })).toBe(
      '/community?resource=topics&status=open&sortBy=date&limit=20&offset=40',
    );
    expect(topicsPath({ mine: true })).toBe('/community?resource=topics&mine=true');
  });
  it('validates a new topic', () => {
    expect(validateTopic('ab', 'long enough text')).toBe('titleTooShort');
    expect(validateTopic('abc', 'short')).toBe('descriptionTooShort');
    expect(validateTopic('abc', 'long enough text')).toBeNull();
  });
  it('names status chips', () => {
    expect(statusKey('in-progress')).toBe('inProgress');
    expect(statusKey('open')).toBe('open');
  });
});

describe('author names never leak an email handle', () => {
  it('cleans handles', () => {
    expect(formatAuthorName('f.fakharan.69')).toBe('F. Fakharan');
    expect(formatAuthorName('a93010965')).toBeNull();
    expect(formatAuthorName('69s94t77jw')).toBeNull();
    expect(formatAuthorName('')).toBeNull();
  });
  it('keeps real names in any script', () => {
    expect(formatAuthorName('Marie Curie')).toBe('Marie Curie');
    expect(formatAuthorName('李雷')).toBe('李雷');
  });
});

describe('text helpers', () => {
  it('strips markdown for card previews', () => {
    expect(stripMarkdown('## Hi **there** [link](https://x.y)\n- one')).toBe('Hi there link one');
  });
  it('says how long ago', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    expect(timeAgo('2026-10-19T12:00:00Z', 'en', now)).toBe('2 days ago');
  });
});
