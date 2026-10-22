import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, X } from 'lucide-react';
import type { Achievement } from '../types';

const SEEN_KEY = 'flexi-desk-seen-achievements';
const CELEBRATED_KEY = 'flexi-desk-streak-celebrated';
export const STREAK_MILESTONES = [7, 30, 100, 365];

const read = (key: string): string[] | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the toast may show again next time */
  }
};

/** The unlocked achievement (key) not announced yet; the first ever look just records what is already unlocked. */
export function nextUnannounced(list: Achievement[], seen: string[] | null): Achievement | null {
  if (seen === null) return null;
  return list.find((a) => a.isUnlocked && !seen.includes(a.achievementKey)) ?? null;
}

export function AchievementToast({ list, ready }: { list: Achievement[]; ready: boolean }) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'achievements' });
  const { t: td } = useTranslation('dashboard', { keyPrefix: 'desk' });
  const [current, setCurrent] = useState<Achievement | null>(null);

  useEffect(() => {
    if (!ready) return;
    const seen = read(SEEN_KEY);
    if (seen === null) {
      write(
        SEEN_KEY,
        list.filter((a) => a.isUnlocked).map((a) => a.achievementKey),
      );
      return;
    }
    const next = nextUnannounced(list, seen);
    if (next && next.achievementKey !== current?.achievementKey) setCurrent(next);
  }, [list, ready, current]);

  const close = () => {
    if (current) write(SEEN_KEY, [...(read(SEEN_KEY) ?? []), current.achievementKey]);
    setCurrent(null);
  };
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(close, 5000);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  const group = current.achievementKey.replace(/_\d+$/, '');
  return (
    <div
      role="status"
      className="fixed end-4 top-4 z-50 flex max-w-sm items-center gap-4 rounded-xl border border-primary/30 bg-card p-4 shadow-xl"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Trophy className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{td('unlockedToast')}</p>
        <p className="truncate text-sm font-bold text-foreground">
          {t(`groups.${group}.name`, { defaultValue: current.title })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(`tier.${group}`, { n: current.threshold, defaultValue: current.description ?? '' })}
        </p>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={td('close')}
        className="self-start rounded-md p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** A quiet message when the streak reaches a milestone, once per milestone. */
export function StreakCelebration({ streak, ready }: { streak: number; ready: boolean }) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'desk' });
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !STREAK_MILESTONES.includes(streak)) return;
    const done = read(CELEBRATED_KEY) ?? [];
    if (done.includes(String(streak))) return;
    write(CELEBRATED_KEY, [...done, String(streak)]);
    setShown(streak);
    const timer = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(timer);
  }, [streak, ready]);

  if (shown === null) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 end-6 z-50 flex items-center gap-3 rounded-xl border border-success/40 bg-card px-4 py-3 shadow-lg"
    >
      <Trophy className="h-5 w-5 text-success" />
      <div>
        <p className="text-sm font-bold text-foreground">{t('streakMilestone', { n: shown })}</p>
        <p className="text-xs text-muted-foreground">{t('streakMilestoneBody')}</p>
      </div>
      <button
        type="button"
        onClick={() => setShown(null)}
        aria-label={t('close')}
        className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
