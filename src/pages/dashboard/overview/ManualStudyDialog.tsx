import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
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
import { saveManualMinutesToAccount, setManualMinutes } from './services';
import { ymd } from './model';

const SHORTCUTS = [15, 30, 45, 60, 90, 120];

function words(t: (k: string) => string, total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h} ${t('hours')} ${t('and')} ${m} ${t('minutes')}`;
  if (h > 0) return `${h} ${t('hours')}`;
  if (m > 0) return `${m} ${t('minutes')}`;
  return t('zeroMinutes');
}

/**
 * Record study time by hand for one day. Saved on this computer first; signed
 * in, it is also sent to the account so the website shows the same calendar.
 * The dialog stays open on any failure, with the reason inline.
 */
export function ManualStudyDialog({
  open,
  onClose,
  selectedDate,
  initialMinutes = 0,
  activityMinutes = 0,
  signedIn,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  selectedDate?: string;
  initialMinutes?: number;
  /** Time already counted for that day by itself (study, listening, reading). */
  activityMinutes?: number;
  signedIn: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation('dashboard', { keyPrefix: 'manualStudy' });
  const todayStr = useMemo(() => ymd(new Date()), []);
  const [date, setDate] = useState(selectedDate || todayStr);
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useEffect(() => {
    if (open) {
      setDate(selectedDate || todayStr);
      setMinutes(String(initialMinutes));
      setError(null);
    }
  }, [open, selectedDate, initialMinutes, todayStr]);

  const parsed = Number.parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const total = Math.round(activityMinutes) + valid;

  const run = async (kind: 'save' | 'delete', value: number) => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
      setError(t('invalidDate'));
      return;
    }
    if (date > todayStr) {
      setError(t('futureDate'));
      return;
    }
    if (!Number.isFinite(value) || value < 0 || value > 600) {
      setError(t('invalidMinutes'));
      return;
    }
    setBusy(kind);
    try {
      await setManualMinutes(date, value);
    } catch {
      setError(t(kind === 'save' ? 'errorSaving' : 'errorDeleting'));
      setBusy(null);
      return;
    }
    onSaved();
    if (signedIn) {
      try {
        await saveManualMinutesToAccount(date, value);
      } catch {
        // On this computer already; the account is the part to retry.
        setError(t('cloudError'));
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 pb-5 pt-6">
          <div className="mb-1 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Clock className="h-[17px] w-[17px]" />
            </div>
            <DialogTitle>{t('title')}</DialogTitle>
          </div>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label
              htmlFor="manual-date"
              className="mb-2 block text-sm font-semibold text-muted-foreground"
            >
              {t('date')}
            </label>
            <Input
              id="manual-date"
              type="date"
              value={date}
              max={todayStr}
              onChange={(e) => setDate(e.target.value)}
              className="w-48"
            />
          </div>

          <div>
            <label
              htmlFor="manual-minutes"
              className="mb-2 block text-sm font-semibold text-muted-foreground"
            >
              {t('studyTime')}
            </label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SHORTCUTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMinutes(String(val))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    valid === val
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-accent/60 hover:text-accent'
                  }`}
                >
                  {val < 60 ? `${val} ${t('minutes')}` : `${val / 60} ${t('hours')}`}
                </button>
              ))}
            </div>
            <input
              id="manual-minutes"
              type="range"
              min={0}
              max={600}
              step={5}
              value={valid}
              onChange={(e) => setMinutes(e.target.value)}
              className="h-1.5 w-full cursor-pointer rounded-full accent-primary"
            />
            <div
              className="mt-1 flex justify-between px-0.5 text-[10px] text-muted-foreground"
              dir="ltr"
            >
              <span>0</span>
              <span>2h</span>
              <span>4h</span>
              <span>6h</span>
              <span>10h</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('equivalent')}</span>
              <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-foreground">
                {words(t, valid)}
              </span>
            </div>
          </div>

          {activityMinutes > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-muted px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">{t('dayTotal')}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-success" />
                  {t('activityTime')}
                </span>
                <span className="font-semibold text-foreground">
                  {Math.round(activityMinutes)} {t('minutes')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full bg-accent" />
                  {t('manualTime')}
                </span>
                <span className="font-semibold text-foreground">
                  {valid} {t('minutes')}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-xs">
                <span className="font-bold text-foreground">{t('total')}</span>
                <span className="font-bold text-accent">{words(t, total)}</span>
              </div>
            </div>
          )}

          {error && <InlineError message={error} />}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 pb-6 pt-4">
          <div>
            {initialMinutes > 0 && (
              <LoadingButton
                variant="destructive"
                loading={busy === 'delete'}
                disabled={busy !== null}
                onClick={() => run('delete', 0)}
              >
                {t('delete')}
              </LoadingButton>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button variant="outline" onClick={onClose} disabled={busy !== null}>
              {t('cancel')}
            </Button>
            <LoadingButton
              loading={busy === 'save'}
              disabled={busy !== null}
              onClick={() => run('save', valid)}
            >
              {busy === 'save' ? t('saving') : t('save')}
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
