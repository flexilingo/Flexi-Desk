import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { LoadingButton } from './parts';
import {
  acceptGoalSuggestion,
  dismissGoalSuggestion,
  type Announcement,
  type GoalSuggestion,
} from './services';

const DISMISSED_KEY = 'fl_dismissed_announcements';

function dismissedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** An announcement's message as plain text: the admin writes small HTML; the desk shows the words. */
export function announcementText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '').trim();
}

/** The account's dashboard announcement; stays dismissed on this computer once closed. */
export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'desk' });
  const [hidden, setHidden] = useState<string[]>(dismissedIds);
  const a = announcements.find((x) => !hidden.includes(x.id));

  const dismiss = (id: string) => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedIds(), id]));
    } catch {
      /* storage blocked: it stays closed for this session only */
    }
    setHidden((h) => [...h, id]);
  };

  useEffect(() => {
    if (!a || a.dismiss_type !== 'auto' || a.auto_dismiss_seconds <= 0) return;
    const timer = setTimeout(() => dismiss(a.id), a.auto_dismiss_seconds * 1000);
    return () => clearTimeout(timer);
  }, [a]);

  if (!a) return null;
  const clickable = a.dismiss_type === 'tap_anywhere';
  return (
    <div
      role={clickable ? 'button' : 'status'}
      onClick={clickable ? () => dismiss(a.id) : undefined}
      className={`flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 ${clickable ? 'cursor-pointer' : ''}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Megaphone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {a.title && <p className="text-sm font-bold text-foreground">{a.title}</p>}
        <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {announcementText(a.message)}
        </p>
      </div>
      {a.dismiss_type === 'button' && a.button_text ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => dismiss(a.id)}
          className="inline-flex shrink-0"
        >
          {a.button_text}
        </Button>
      ) : a.dismiss_type !== 'none' && a.dismiss_type !== 'tap_anywhere' ? (
        <button
          type="button"
          onClick={() => dismiss(a.id)}
          aria-label={t('dismiss')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/** "You hit your goal 7 days running: raise it?" — from the account's own numbers. */
export function GoalSuggestionBanner({
  suggestion,
  onDone,
}: {
  suggestion: GoalSuggestion | null;
  onDone: () => void;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'goalSuggestion' });
  const { t: td } = useTranslation('dashboard', { keyPrefix: 'desk' });
  const [pending, setPending] = useState<'accept' | 'dismiss' | null>(null);
  const [hiddenNow, setHiddenNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!suggestion || hiddenNow) return null;

  const run = async (kind: 'accept' | 'dismiss') => {
    setPending(kind);
    setError(null);
    try {
      if (kind === 'accept') await acceptGoalSuggestion(suggestion.suggested_goal);
      else await dismissGoalSuggestion();
      setHiddenNow(true);
      onDone();
    } catch {
      setError(td('cardError'));
    } finally {
      setPending(null);
    }
  };
  const params = {
    days: suggestion.days_met,
    current: suggestion.current_goal,
    suggested: suggestion.suggested_goal,
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-xs text-muted-foreground">
        <TrendingUp className="h-4 w-4 shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          {suggestion.type === 'increase'
            ? t('increaseDescription', params)
            : t('decreaseDescription', params)}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <LoadingButton
            size="sm"
            loading={pending === 'accept'}
            disabled={pending !== null}
            onClick={() => run('accept')}
          >
            {t('accept', { goal: suggestion.suggested_goal })}
          </LoadingButton>
          <LoadingButton
            size="sm"
            variant="outline"
            loading={pending === 'dismiss'}
            disabled={pending !== null}
            onClick={() => run('dismiss')}
          >
            {t('dismiss')}
          </LoadingButton>
        </div>
      </div>
      {error && <InlineError message={error} className="mt-2" />}
    </div>
  );
}
