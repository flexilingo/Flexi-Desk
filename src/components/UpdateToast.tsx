import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { progressPercent, useUpdaterStore } from '@/stores/updaterStore';

/** Small corner notice: shows only when an update was found at startup. */
export function UpdateToast() {
  const { t } = useTranslation('updater');
  const { status, version, progress, error, dismissed, install, restart, dismiss } =
    useUpdaterStore();

  const canRetry = status === 'error' && !!version;
  const visible =
    !dismissed &&
    (status === 'available' || status === 'downloading' || status === 'ready' || canRetry);
  if (!visible) return null;

  const percent = progressPercent(progress);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {status === 'ready' ? t('ready') : t('available', { version })}
        </p>
        {status !== 'downloading' && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('dismiss')}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {status === 'downloading' && (
        <div className="mt-3 space-y-1">
          <progress className="h-1.5 w-full accent-accent" max={100} value={percent ?? undefined} />
          <p className="text-xs text-muted-foreground">
            {percent === null ? t('downloadingUnknown') : t('downloading', { percent })}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3">
        {(status === 'available' || canRetry) && (
          <Button size="sm" className="inline-flex" onClick={() => void install()}>
            {t('install')}
          </Button>
        )}
        {status === 'downloading' && (
          <Button size="sm" className="inline-flex" disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('installing')}
          </Button>
        )}
        {status === 'ready' && (
          <Button size="sm" className="inline-flex" onClick={() => void restart()}>
            {t('restart')}
          </Button>
        )}
      </div>
    </div>
  );
}
