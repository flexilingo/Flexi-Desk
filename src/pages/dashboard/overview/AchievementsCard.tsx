import { useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookA,
  BookOpen,
  CalendarCheck,
  Check,
  Clock,
  Flame,
  Headphones,
  Layers,
  Lock,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Achievement } from '../types';
import { CardError, OverviewCard } from './parts';
import type { OverviewData } from './useOverviewData';

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  streak_master: Flame,
  word_scholar: BookA,
  card_master: Layers,
  time_investor: Clock,
  episode_explorer: Headphones,
  bookworm: BookOpen,
  steady_learner: CalendarCheck,
};

/**
 * Where each achievement's button goes. Covers the desk's own seven groups and
 * the website's twenty keys (the server catalogue), so a key from either side
 * never lands on a blank `/`. The website's `dictation_master` points at
 * `/dashboard/daily-study`, which is excluded on desk (it is backed by the
 * admin-only learning path); dictation lives in the listening practice program
 * inside the podcast player, so it opens the podcast library.
 */
export const ACTION_ROUTES: Record<string, string> = {
  // desk's own catalogue
  streak_master: '/study',
  word_scholar: '/podcast',
  card_master: '/study',
  time_investor: '/',
  episode_explorer: '/podcast',
  bookworm: '/reader',
  steady_learner: '/study',
  // website keys
  precision_expert: '/study',
  goal_crusher: '/',
  perfect_session: '/study',
  flashcard_pro: '/review',
  cloze_champion: '/vocabulary',
  dictation_master: '/podcast',
  quiz_conqueror: '/study',
  video_explorer: '/videos',
  xp_champion: '/account/xp',
  level_legend: '/account/xp',
  deck_creator: '/review/create',
  knowledge_sharer: '/review/share-links',
  early_bird: '/study',
  night_owl: '/study',
  weekend_warrior: '/study',
  multi_mode: '/study',
};

export interface AchievementGroup {
  key: string;
  tiers: Achievement[];
  /** Highest unlocked tier, or null. */
  current: Achievement | null;
  next: Achievement | null;
  progress: number;
  /** 0–1 toward the next tier. */
  ratio: number;
}

export function groupAchievements(list: Achievement[]): AchievementGroup[] {
  const by = new Map<string, Achievement[]>();
  for (const a of list) {
    const key = a.achievementKey.replace(/_\d+$/, '');
    by.set(key, [...(by.get(key) ?? []), a]);
  }
  return [...by.entries()].map(([key, rows]) => {
    const tiers = [...rows].sort((a, b) => a.threshold - b.threshold);
    const unlocked = tiers.filter((a) => a.isUnlocked);
    const next = tiers.find((a) => !a.isUnlocked) ?? null;
    const progress = tiers[0]?.currentValue ?? 0;
    return {
      key,
      tiers,
      current: unlocked[unlocked.length - 1] ?? null,
      next,
      progress,
      ratio: next ? Math.min(1, progress / next.threshold) : 1,
    };
  });
}

/** The achievements, one card per group with its tiers; tap one for its details and the way to earn the next. */
export function AchievementsCard({ data }: { data: OverviewData }) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'achievements' });
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => groupAchievements(data.achievementList), [data.achievementList]);
  const nextUp = useMemo(
    () => [...groups].filter((g) => g.next).sort((a, b) => b.ratio - a.ratio)[0] ?? null,
    [groups],
  );
  const shown = all ? groups : groups.slice(0, 4);
  const unlocked = data.achievementList.filter((a) => a.isUnlocked).length;

  return (
    <OverviewCard labelledBy="ach-title" className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Trophy className="h-3.5 w-3.5" />
          </span>
          <h2 id="ach-title" className="text-sm font-bold text-foreground">
            {t('title')}
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {unlocked} {t('unlocked')}
        </span>
      </div>

      {data.errors.achievements && groups.length === 0 ? (
        <CardError className="mt-4" onRetry={data.achievementsReload} />
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{t('noAchievements')}</span>{' '}
          {t('startLearning')}
        </p>
      ) : (
        <>
          {nextUp?.next && (
            <button
              type="button"
              onClick={() => setOpen(nextUp.key)}
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2.5 text-start"
            >
              <GroupIcon g={nextUp.key} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-muted-foreground">
                  {t('nextUnlock')}
                </span>
                <span className="block truncate text-sm font-bold text-foreground">
                  {t(`groups.${nextUp.key}.name`, {
                    defaultValue: nextUp.tiers[0]?.title ?? nextUp.key,
                  })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('nextUnlockProgress', {
                    current: nextUp.progress.toLocaleString(),
                    total: nextUp.next.threshold.toLocaleString(),
                    pct: Math.round(nextUp.ratio * 100),
                  })}
                </span>
                <Bar ratio={nextUp.ratio} />
              </span>
            </button>
          )}
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shown.map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setOpen(g.key)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-start transition-colors hover:border-primary/40"
                >
                  <GroupIcon g={g.key} locked={!g.current} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-foreground">
                      {t(`groups.${g.key}.name`, { defaultValue: g.tiers[0]?.title ?? g.key })}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {g.current
                        ? t(`tier.${g.key}`, {
                            n: g.current.threshold,
                            defaultValue: '{{n, number}}',
                          })
                        : t('locked')}
                    </span>
                    <Bar ratio={g.ratio} />
                  </span>
                  {!g.next && (
                    <span className="shrink-0 text-[11px] font-bold text-success">
                      {t('maxed')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {groups.length > 4 && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAll(!all)}
                className="inline-flex"
              >
                {all ? t('showLess') : t('showAll', { count: groups.length })}
              </Button>
            </div>
          )}
        </>
      )}
      <AchievementDetailDialog
        group={groups.find((g) => g.key === open) ?? null}
        onClose={() => setOpen(null)}
      />
    </OverviewCard>
  );
}

function GroupIcon({ g, locked }: { g: string; locked?: boolean }) {
  const Icon = ICONS[g] ?? Trophy;
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${locked ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}
    >
      {locked ? <Lock className="h-4 w-4" /> : <Icon className="h-[18px] w-[18px]" />}
    </span>
  );
}

function Bar({ ratio }: { ratio: number }) {
  return (
    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border">
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </span>
  );
}

export function AchievementDetailDialog({
  group,
  onClose,
}: {
  group: AchievementGroup | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'achievements' });
  const navigate = useNavigate();
  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {group && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <GroupIcon g={group.key} locked={!group.current} />
                <span>
                  {t(`groups.${group.key}.name`, {
                    defaultValue: group.tiers[0]?.title ?? group.key,
                  })}
                </span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t(`groups.${group.key}.hint`, { defaultValue: group.tiers[0]?.description ?? '' })}
            </p>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {t('currentProgress')}
              </p>
              <p className="text-sm font-bold text-foreground">
                {group.progress.toLocaleString()}
                {group.next ? ` / ${group.next.threshold.toLocaleString()}` : ` · ${t('maxed')}`}
              </p>
              <Bar ratio={group.ratio} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('levelsList')}</p>
              <ul className="space-y-1.5">
                {group.tiers.map((tier) => (
                  <li key={tier.id} className="flex items-center gap-2 text-sm">
                    {tier.isUnlocked ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={tier.isUnlocked ? 'text-foreground' : 'text-muted-foreground'}>
                      {t(`tier.${group.key}`, { n: tier.threshold, defaultValue: '{{n, number}}' })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  onClose();
                  navigate(ACTION_ROUTES[group.key] ?? '/');
                }}
                className="inline-flex"
              >
                {t(`groups.${group.key}.action`, { defaultValue: t('goAction') })}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
