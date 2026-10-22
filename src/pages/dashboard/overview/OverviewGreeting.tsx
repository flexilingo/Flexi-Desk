import { useTranslation } from 'react-i18next';
import { Flame, Moon, Sparkles, Sun, Sunrise, Trophy } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import type { OverviewData } from './useOverviewData';

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function timeOfDay(hour: number): TimeOfDay {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

const chip =
  'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground';

/** "Good morning, Alex" with the date and the three standing numbers as quiet chips. */
export function OverviewGreeting({ data }: { data: OverviewData }) {
  const { t, i18n } = useTranslation('dashboard', { keyPrefix: 'home' });
  const email = useAuthStore((s) => s.session?.email);
  const name = email ? email.split('@')[0] : '';
  const tod = timeOfDay(new Date().getHours());
  const date = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const Glyph = tod === 'morning' ? Sunrise : tod === 'afternoon' ? Sun : Moon;

  // The numbers wait for their data: a false "start a streak today" flashing at
  // someone on day 40 is worse than a beat of nothing.
  const chips = data.gamificationReady ? (
    <div className="flex flex-wrap gap-2">
      <span className={chip}>
        <Flame className="h-4 w-4 text-warning" />
        <span className="font-bold text-foreground">
          {data.streak > 0 ? t('streak', { count: data.streak }) : t('streakNone')}
        </span>
      </span>
      <span className={chip}>
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="font-bold text-foreground">{t('level', { level: data.level })}</span>
      </span>
      <span className={chip}>
        <Trophy className="h-4 w-4 text-primary" />
        {data.achievements === 0
          ? t('achievements_exact0')
          : t('achievements', { count: data.achievements })}
      </span>
    </div>
  ) : (
    // The same three pills, empty, so the header keeps its height when they land.
    <div aria-hidden className="flex flex-wrap gap-2">
      {['w-36', 'w-20', 'w-28'].map((w) => (
        <span
          key={w}
          className={`inline-flex h-[34px] ${w} items-center rounded-full border border-border bg-card px-3`}
        >
          <span className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
        </span>
      ))}
    </div>
  );

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Glyph className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">
            {name ? t(`greeting.${tod}`, { name }) : t(`greetingNoName.${tod}`)}
          </h1>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </div>
      {chips}
    </header>
  );
}
