import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineError } from '@/components/common/InlineError';
import { LoadingButton } from './parts';
import { createGoal, deleteGoal, updateUserSettings } from './services';
import type { OverviewData } from './useOverviewData';

/** The daily study goal (minutes a day): the dashed line on the week. Local. */
export function GoalDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: OverviewData;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'goal' });
  const [minutes, setMinutes] = useState('30');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMinutes(String(data.dailyGoalMinutes ?? 30));
      setError(null);
    }
  }, [open, data.dailyGoalMinutes]);

  const save = async () => {
    const n = Number.parseInt(minutes, 10);
    if (!Number.isFinite(n) || n < 5 || n > 600) {
      setError(t('invalid'));
      return;
    }
    setBusy('save');
    setError(null);
    try {
      if (data.dailyGoalId) await deleteGoal(data.dailyGoalId);
      await createGoal(n);
      data.goalsReload();
      onOpenChange(false);
    } catch {
      setError(t('error'));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!data.dailyGoalId) return;
    setBusy('remove');
    setError(null);
    try {
      await deleteGoal(data.dailyGoalId);
      data.goalsReload();
      onOpenChange(false);
    } catch {
      setError(t('error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('body')}</DialogDescription>
        </DialogHeader>
        <label className="mt-4 flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          {t('minutes')}
          <Input
            type="number"
            inputMode="numeric"
            min={5}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-32"
          />
        </label>
        {error && <InlineError message={error} className="mt-3" />}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {data.dailyGoalId ? (
            <LoadingButton
              variant="ghost"
              size="sm"
              loading={busy === 'remove'}
              disabled={busy !== null}
              onClick={remove}
            >
              {t('remove')}
            </LoadingButton>
          ) : (
            <span />
          )}
          <LoadingButton loading={busy === 'save'} disabled={busy !== null} onClick={save}>
            {t('save')}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Add or move the exam date, saved to the account so the website agrees. */
export function ExamDateDialog({
  open,
  onOpenChange,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string | null;
  onSaved: () => void;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'examGoal' });
  const { t: tw } = useTranslation('dashboard', { keyPrefix: 'examWeek' });
  const { t: tg } = useTranslation('dashboard', { keyPrefix: 'goal' });
  const [date, setDate] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (open) {
      setDate(current ?? '');
      setError(null);
    }
  }, [open, current]);

  const save = async () => {
    if (!date) {
      setError(t('dateLabel'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateUserSettings({ exam_date: date });
      onSaved();
      onOpenChange(false);
    } catch {
      setError(t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tw('addDate')}</DialogTitle>
          <DialogDescription>{t('dateLabel')}</DialogDescription>
        </DialogHeader>
        <Input
          type="date"
          min={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-4 w-44"
        />
        {error && <InlineError message={error} className="mt-3" />}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('nudgeClose')}
          </Button>
          <LoadingButton loading={busy} onClick={save}>
            {tg('save')}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
