import { describe, it, expect } from 'vitest';
import { canSearch, emptyKey, initialsOf, rowAction, searchAction } from '@/lib/account/friends';
import type { UserProfile } from '@/lib/account/types';

const u = (o: Partial<UserProfile> = {}): UserProfile => ({
  id: '1',
  username: 'ann',
  display_name: 'Ann Lee',
  avatar_url: null,
  bio: null,
  ...o,
});

describe('friends rows per tab', () => {
  it('pending requests: accept or reject by follow id', () => {
    expect(rowAction(u({ follow_id: 'f1' }), 'pending')).toEqual({
      kind: 'accept-reject',
      followId: 'f1',
    });
    expect(rowAction(u(), 'pending')).toEqual({ kind: 'none' });
  });
  it('following and mutual: unfollow (asks first)', () => {
    expect(rowAction(u(), 'following').kind).toBe('unfollow');
    expect(rowAction(u(), 'mutual').kind).toBe('unfollow');
  });
  it('followers: follow back, or Pending when already followed or requested', () => {
    expect(rowAction(u(), 'followers')).toEqual({
      kind: 'follow',
      disabled: false,
      pending: false,
    });
    expect(rowAction(u({ follow_status: 'pending' }), 'followers')).toEqual({
      kind: 'follow',
      disabled: true,
      pending: true,
    });
    expect(rowAction(u({ follow_status: 'accepted' }), 'followers').kind).toBe('follow');
  });
});

describe('search dialog', () => {
  it('button per follow status', () => {
    expect(searchAction(u({ follow_status: 'accepted' }))).toBe('unfollow');
    expect(searchAction(u({ follow_status: 'pending' }))).toBe('pending');
    expect(searchAction(u({ follow_status: 'not_following' }))).toBe('follow');
    expect(searchAction(u())).toBe('follow');
  });
  it('searches from two characters', () => {
    expect(canSearch('a')).toBe(false);
    expect(canSearch(' a ')).toBe(false);
    expect(canSearch('an')).toBe(true);
  });
  it('initials and empty states', () => {
    expect(initialsOf(u())).toBe('AL');
    expect(initialsOf(u({ display_name: null, username: 'zed' }))).toBe('Z');
    expect(emptyKey('pending')).toBe('noPendingRequests');
    expect(emptyKey('mutual')).toBe('noMutualFriends');
    expect(emptyKey('followers')).toBe('noUsersFound');
  });
});
