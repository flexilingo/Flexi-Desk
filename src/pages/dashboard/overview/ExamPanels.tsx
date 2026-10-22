import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, GraduationCap, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import {
  DESK_EXAMS,
  FIRST_PRACTICE,
  SKILLS,
  examName,
  resolveExamGoalPanelMode,
  scoreRange,
  SNOOZE_MS,
  type ExamGoalPanelMode,
  type ExamKey,
  type Skill,
} from './exam';
import { LoadingButton, OverviewCard } from './parts';
import { startExamPractice, updateUserSettings, type UserSettings } from './services';

type Goal = ExamKey | 'none';
const GOALS: { key: Goal; label: string; hint: string }[] = [
  { key: 'celpip', label: 'celpip', hint: 'celpipHint' },
  { key: 'tcf', label: 'tcf', hint: 'tcfHint' },
  { key: 'tcf_quebec', label: 'tcfQuebec', hint: 'tcfQuebecHint' },
  { key: 'none', label: 'none', hint: 'noneHint' },
];

const SNOOZE_KEY = 'flexi-exam-goal-snoozed-at';
const NUDGE_DISMISSED_KEY = 'flexi-exam-goal-nudge-dismissed';
const DRAFT_KEY = 'flexi-exam-goal-draft';
const RESULT_SNOOZE_KEY = 'flexi-exam-result-snoozed-at';

const get = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const put = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice is kept for this session only */
  }
};

/** How the goal panel is asking right now (full / one-line / not at all), from the stored snooze and ×. */
export function examGoalPanelMode(examGoal: string | null | undefined): ExamGoalPanelMode | null {
  return resolveExamGoalPanelMode({
    examGoal,
    snoozedAt: Number(get(SNOOZE_KEY) ?? 0),
    now: Date.now(),
    nudgeDismissed: get(NUDGE_DISMISSED_KEY) === '1',
  });
}

export const resultSnoozedAt = () => Number(get(RESULT_SNOOZE_KEY) ?? 0);

function readDraft(): { goal: Goal | null; date: string } {
  try {
    const raw = JSON.parse(get(DRAFT_KEY) ?? '{}') as { goal?: unknown; date?: unknown };
    return {
      goal: GOALS.some((g) => g.key === raw.goal) ? (raw.goal as Goal) : null,
      date: typeof raw.date === 'string' ? raw.date : '',
    };
  } catch {
    return { goal: null, date: '' };
  }
}

const field =
  'rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none';
const quietBtn =
  'inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/**
 * The first question: which exam, and when. The answer is saved to the account
 * (the website shows the same). CELPIP starts a short Reading practice here;
 * TCF is saved and practised on the website until the desk runs it.
 */
export function ExamGoalPanel({
  settings,
  onHidden,
  onSaved,
  compact = false,
}: {
  settings: UserSettings;
  onHidden?: () => void;
  onSaved: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'examGoal' });
  const navigate = useNavigate();
  const [goal, setGoal] = useState<Goal | null>(() => readDraft().goal);
  const [examDate, setExamDate] = useState(() => readDraft().date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(false);
  const [snoozed, setSnoozed] = useState(
    () => Date.now() - Number(get(SNOOZE_KEY) ?? 0) < SNOOZE_MS,
  );
  const [dismissed, setDismissed] = useState(() => compact && get(NUDGE_DISMISSED_KEY) === '1');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (goal || examDate) put(DRAFT_KEY, JSON.stringify({ goal, date: examDate }));
  }, [goal, examDate]);

  // A saved goal hides the panel, unless its practice failed to start (then it
  // stays with the error and the retry) or the note about TCF is being read.
  const hidden = (settings.exam_goal != null && !busy && !error && !note) || snoozed || dismissed;
  useEffect(() => {
    if (hidden) onHidden?.();
  }, [hidden, onHidden]);
  if (hidden) return null;

  const today = new Date().toISOString().slice(0, 10);
  const snooze = () => {
    if (compact) return setExpanded(false);
    put(SNOOZE_KEY, String(Date.now()));
    setSnoozed(true);
  };
  const dismiss = () => {
    put(NUDGE_DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const start = async () => {
    if (!goal || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateUserSettings({
        exam_goal: goal,
        exam_date: goal !== 'none' && examDate ? examDate : null,
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* nothing to clear */
      }
      if (goal === 'none') {
        onSaved();
        navigate('/podcast');
        return;
      }
      if (!DESK_EXAMS.includes(goal)) {
        setNote(true);
        setBusy(false);
        onSaved();
        return;
      }
      const result = await startExamPractice({ exam_type: goal, sections: FIRST_PRACTICE[goal] });
      onSaved();
      navigate(`/celpip/session/${result.session_id}`);
    } catch {
      setBusy(false);
      setError(t('error'));
    }
  };

  const supported = goal != null && goal !== 'none' && DESK_EXAMS.includes(goal);
  const ctaLabel = goal === 'none' ? t('ctaNone') : supported ? t('ctaCelpip') : t('ctaSave');
  const noteText =
    goal === 'celpip'
      ? t('celpipNote')
      : goal === 'tcf' || goal === 'tcf_quebec'
        ? t('webOnlyNote')
        : null;

  if (compact && !expanded) {
    return (
      <section
        aria-labelledby="exam-goal-nudge"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="h-4 w-4" />
          </span>
          <p id="exam-goal-nudge" className="min-w-0 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{t('nudgeTitle')}</span>{' '}
            {t('nudgeBody')}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`${quietBtn} gap-1 text-primary`}
          >
            {t('nudgeCta')}
            <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('nudgeClose')}
            title={t('nudgeClose')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <OverviewCard labelledBy="exam-goal-title" className="p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="exam-goal-title" className="text-[17px] font-bold text-foreground">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('subtitle')}</p>
        </div>
        <button type="button" onClick={snooze} className={quietBtn}>
          {t('notNow')}
        </button>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="exam-goal-title"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {GOALS.map(({ key, label, hint }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={goal === key}
            onClick={() => {
              setGoal(key);
              setError(null);
            }}
            className={`flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-3 text-start transition-colors ${
              goal === key
                ? 'border-accent bg-accent/10'
                : 'border-border bg-card hover:border-primary/50 hover:bg-muted'
            }`}
          >
            <span className="text-sm font-bold text-foreground">{t(label)}</span>
            <span className="text-xs text-muted-foreground">{t(hint)}</span>
          </button>
        ))}
      </div>

      {goal && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {goal !== 'none' && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                {t('dateLabel')}
              </span>
              <Input
                type="date"
                min={today}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className={`${field} h-auto w-44`}
              />
            </label>
          )}
          <LoadingButton loading={busy} onClick={start}>
            {ctaLabel}
            {!busy && <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />}
          </LoadingButton>
        </div>
      )}
      {goal && noteText && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{noteText}</p>}
      {note && <p className="mt-3 text-sm text-foreground">{t('webOnlyNote')}</p>}
      {error && <InlineError message={error} className="mt-3" />}
    </OverviewCard>
  );
}

/** After the exam date: "How did it go? Enter your official scores." */
export function ExamResultPanel({
  settings,
  onSaved,
}: {
  settings: UserSettings;
  onSaved: () => void;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'examResult' });
  const [scores, setScores] = useState<Partial<Record<Skill, string>>>({});
  const [newDate, setNewDate] = useState('');
  const [movingDate, setMovingDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [snoozed, setSnoozed] = useState(() => Date.now() - resultSnoozedAt() < SNOOZE_MS);

  const exam = settings.exam_goal;
  const examDate = settings.exam_date;
  const today = new Date().toISOString().slice(0, 10);
  if (done) {
    return <OverviewCard className="p-5 text-sm text-foreground">{t('thanks')}</OverviewCard>;
  }
  if (
    !exam ||
    exam === 'none' ||
    !examDate ||
    examDate >= today ||
    settings.official_result ||
    snoozed
  )
    return null;
  const name = examName(exam as ExamKey);

  const save = async () => {
    if (busy) return;
    const entered = SKILLS.filter((s) => scores[s]?.trim());
    if (entered.length === 0) return setError(t('enterOne'));
    for (const s of entered) {
      const n = Number(scores[s]);
      const { min, max } = scoreRange(exam, s);
      if (!Number.isFinite(n) || n < min || n > max)
        return setError(t('outOfRange', { skill: t(`skills.${s}`), min, max }));
    }
    setBusy(true);
    setError(null);
    try {
      const result: Record<string, unknown> = {
        exam_type: exam,
        exam_date: examDate,
        reported_at: new Date().toISOString(),
      };
      for (const s of entered) result[s] = Number(scores[s]);
      await updateUserSettings({ official_result: result });
      setDone(true);
      onSaved();
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  };

  const moveDate = async () => {
    if (busy || !newDate) return;
    setBusy(true);
    setError(null);
    try {
      await updateUserSettings({ exam_date: newDate });
      onSaved();
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverviewCard labelledBy="exam-result-title" className="p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="exam-result-title" className="text-[17px] font-bold text-foreground">
            {t('title', { exam: name })}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            put(RESULT_SNOOZE_KEY, String(Date.now()));
            setSnoozed(true);
          }}
          className={quietBtn}
        >
          {t('notOutYet')}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SKILLS.map((s) => {
          const { min, max } = scoreRange(exam, s);
          return (
            <label
              key={s}
              className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground"
            >
              {t(`skills.${s}`)}
              <Input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                placeholder={`${min}–${max}`}
                value={scores[s] ?? ''}
                onChange={(e) => setScores((prev) => ({ ...prev, [s]: e.target.value }))}
                className={`${field} h-auto tabular-nums`}
              />
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <LoadingButton loading={busy} onClick={save}>
          {t('save')}
        </LoadingButton>
        {!movingDate ? (
          <button type="button" onClick={() => setMovingDate(true)} className={quietBtn}>
            {t('notTakenYet')}
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Input
              type="date"
              min={today}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label={t('newDate')}
              className={`${field} h-auto w-44`}
            />
            <LoadingButton variant="outline" loading={busy} onClick={moveDate}>
              {t('saveDate')}
            </LoadingButton>
          </span>
        )}
      </div>
      {error && <InlineError message={error} className="mt-3" />}
    </OverviewCard>
  );
}
