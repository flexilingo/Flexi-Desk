import { useEffect, useState } from 'react';
import { Check, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/stores/authStore';
import {
  followUser,
  listFollows,
  manageFollowRequest,
  searchUsers,
  unfollowUser,
} from '@/lib/account/api';
import {
  FOLLOW_TABS,
  canSearch,
  emptyKey,
  initialsOf,
  rowAction,
  searchAction,
} from '@/lib/account/friends';
import type { FollowTab, UserProfile } from '@/lib/account/types';
import { useRemote } from '@/hooks/useRemote';
import { cn } from '@/lib/utils';
import { ErrorLine, RequireSession, Spinner, useAccountT } from './components/AccountBits';

function Avatar({ user, size = 'h-14 w-14' }: { user: UserProfile; size?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-full border-2 border-border', size)}>
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary text-sm font-extrabold text-primary-foreground">
          {initialsOf(user)}
        </div>
      )}
    </div>
  );
}

export function FriendsTab() {
  return (
    <RequireSession icon={Users}>
      <Friends />
    </RequireSession>
  );
}

function Friends() {
  const { t, errorText } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const [tab, setTab] = useState<FollowTab>('mutual');
  const [searchOpen, setSearchOpen] = useState(false);
  const [unfollowTarget, setUnfollowTarget] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = useRemote(() => listFollows(tab), [tab, session?.user_id]);
  const users = list.data?.users ?? [];

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await list.reload();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmUnfollow = async () => {
    if (!unfollowTarget) return;
    const ok = await act(unfollowTarget.id, () => unfollowUser(unfollowTarget.id));
    if (ok) setUnfollowTarget(null);
  };

  const searchBtn = (
    <Button variant="accent" onClick={() => setSearchOpen(true)}>
      <Search />
      {t('friends.searchUsers')}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Users}
        title={t('friends.title')}
        subtitle={t('friends.mutualFollowDescription')}
        action={searchBtn}
      />
      <ErrorLine message={error} onDismiss={() => setError(null)} />
      <div className="flex overflow-x-auto border-b border-border">
        {FOLLOW_TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => id !== tab && setTab(id)}
            disabled={list.loading}
            aria-pressed={tab === id}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50',
              tab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-caption hover:text-muted-foreground',
            )}
          >
            {t(
              `friends.${id === 'mutual' ? 'mutualFriends' : id === 'pending' ? 'pendingRequests' : id}`,
            )}
          </button>
        ))}
      </div>

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorLine
          message={errorText(list.error)}
          onRetry={() => void list.reload()}
          retryLabel={t('subscription.retry')}
        />
      ) : users.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t(`friends.${emptyKey(tab)}`)}
            body={
              tab === 'mutual' ? t('friends.mutualFollowDescription') : t('friends.useSearchButton')
            }
            action={searchBtn}
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {users.map((u) => {
            const a = rowAction(u, tab);
            const busy = busyId === (a.kind === 'accept-reject' ? a.followId : u.id);
            return (
              <li key={u.id}>
                <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar user={u} />
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-bold text-foreground">
                        {u.display_name || u.username}
                      </h3>
                      <p className="truncate text-xs text-caption">@{u.username}</p>
                      {u.bio && (
                        <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">
                          {u.bio}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    {a.kind === 'accept-reject' && (
                      <>
                        <Button
                          variant="success"
                          loading={busy}
                          onClick={() =>
                            void act(a.followId, () => manageFollowRequest(a.followId, 'accept'))
                          }
                        >
                          {!busy && <Check />}
                          {t('friends.accept')}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void act(a.followId, () => manageFollowRequest(a.followId, 'reject'))
                          }
                          className="border-error/40 text-error hover:text-error"
                        >
                          <X />
                          {t('friends.reject')}
                        </Button>
                      </>
                    )}
                    {a.kind === 'unfollow' && (
                      <Button variant="outline" onClick={() => setUnfollowTarget(u)}>
                        <UserMinus />
                        {t('friends.unfollow')}
                      </Button>
                    )}
                    {a.kind === 'follow' && (
                      <Button
                        variant="accent"
                        loading={busy}
                        disabled={a.disabled}
                        onClick={() => void act(u.id, () => followUser(u.id))}
                      >
                        {!busy && <UserPlus />}
                        {a.pending ? t('friends.pending') : t('friends.follow')}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <UserSearchDialog
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          void list.reload();
        }}
      />

      <Dialog
        open={unfollowTarget !== null}
        onOpenChange={(o) => busyId === null && !o && setUnfollowTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('friends.unfollow')}</DialogTitle>
            <DialogDescription>
              {t('friends.unfollowConfirm')}{' '}
              {unfollowTarget && (
                <span className="font-semibold text-foreground">@{unfollowTarget.username}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ErrorLine message={error} />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setUnfollowTarget(null)}
              disabled={busyId !== null}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={busyId !== null}
              onClick={() => void confirmUnfollow()}
            >
              {t('friends.unfollow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, errorText } = useAccountT();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !canSearch(q)) {
      setUsers([]);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await searchUsers(q.trim(), 20);
        if (live) setUsers(r.users ?? []);
      } catch (e) {
        if (live) setError(errorText(e));
      } finally {
        if (live) setLoading(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  const toggle = async (u: UserProfile) => {
    const next = searchAction(u);
    if (next === 'pending') return;
    setBusyId(u.id);
    setError(null);
    try {
      if (next === 'follow') await followUser(u.id);
      else await unfollowUser(u.id);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? { ...x, follow_status: next === 'follow' ? 'pending' : 'not_following' }
            : x,
        ),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{t('userSearch.title')}</DialogTitle>
          <DialogDescription>{t('userSearch.description')}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('userSearch.placeholder')}
        />
        <ErrorLine message={error} onDismiss={() => setError(null)} />
        <div className="min-h-[8rem] flex-1 overflow-y-auto">
          {loading ? (
            <Spinner className="py-8" />
          ) : !canSearch(q) ? (
            <p className="py-8 text-center text-sm text-caption">{t('userSearch.minChars')}</p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-caption">{t('userSearch.noUsers')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {users.map((u) => {
                const a = searchAction(u);
                return (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar user={u} size="h-11 w-11" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {u.display_name || u.username}
                        </p>
                        <p className="truncate text-xs text-caption">@{u.username}</p>
                      </div>
                    </div>
                    {a === 'pending' ? (
                      <span className="rounded-md bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning">
                        {t('userSearch.pending')}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant={a === 'follow' ? 'accent' : 'outline'}
                        loading={busyId === u.id}
                        onClick={() => void toggle(u)}
                      >
                        {a === 'follow' ? t('userSearch.follow') : t('userSearch.unfollow')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('userSearch.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
