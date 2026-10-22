import type { FollowTab, UserProfile } from './types';

export const FOLLOW_TABS: FollowTab[] = ['mutual', 'followers', 'following', 'pending'];

export type RowAction =
  | { kind: 'accept-reject'; followId: string }
  | { kind: 'unfollow' }
  | { kind: 'follow'; disabled: boolean; pending: boolean }
  | { kind: 'none' };

/**
 * What a row offers, per tab (as on the website):
 * pending request -> accept / reject; following and mutual -> unfollow (asks first);
 * followers -> follow back (already followed or requested shows "Pending").
 */
export function rowAction(user: UserProfile, tab: FollowTab): RowAction {
  if (tab === 'pending' && user.follow_id)
    return { kind: 'accept-reject', followId: user.follow_id };
  if (tab === 'following' || tab === 'mutual') return { kind: 'unfollow' };
  if (tab === 'followers') {
    const pending = user.follow_status === 'accepted' || user.follow_status === 'pending';
    return { kind: 'follow', disabled: pending, pending };
  }
  return { kind: 'none' };
}

/** Button state in the search dialog: follow, pending request, or unfollow. */
export type SearchAction = 'follow' | 'pending' | 'unfollow';
export function searchAction(user: UserProfile): SearchAction {
  if (user.follow_status === 'accepted') return 'unfollow';
  if (user.follow_status === 'pending') return 'pending';
  return 'follow';
}

/** The search box asks the server only from two characters on. */
export const MIN_SEARCH_CHARS = 2;
export const canSearch = (q: string) => q.trim().length >= MIN_SEARCH_CHARS;

export function initialsOf(user: Pick<UserProfile, 'display_name' | 'username'>): string {
  return (
    (user.display_name || user.username || '?')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

export function emptyKey(tab: FollowTab): 'noPendingRequests' | 'noMutualFriends' | 'noUsersFound' {
  return tab === 'pending'
    ? 'noPendingRequests'
    : tab === 'mutual'
      ? 'noMutualFriends'
      : 'noUsersFound';
}
