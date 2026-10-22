import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { progressPercent, updaterErrorKey, useUpdaterStore } from '@/stores/updaterStore';

export function UpdatesSection() {
  const { t } = useTranslation('updater');
  const { status, version, progress, error, failure, check, install, restart } = useUpdaterStore();
  const [current, setCurrent] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then(setCurrent)
      .catch(() => setCurrent(''));
  }, []);

  const percent = progressPercent(progress);
  const busy = status === 'checking' || status === 'downloading';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <RefreshCw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{t('title')}</CardTitle>
            <CardDescription>
              {current ? t('currentVersion', { version: current }) : t('subtitle')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === 'upToDate' && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            {t('upToDate')}
          </p>
        )}
        {(status === 'available' || (status === 'error' && version)) && (
          <p className="text-sm text-foreground">{t('available', { version })}</p>
        )}
        {status === 'downloading' && (
          <div className="space-y-1">
            <progress
              className="h-1.5 w-full accent-accent"
              max={100}
              value={percent ?? undefined}
            />
            <p className="text-xs text-muted-foreground">
              {percent === null ? t('downloadingUnknown') : t('downloading', { percent })}
            </p>
          </div>
        )}
        {status === 'ready' && <p className="text-sm text-foreground">{t('ready')}</p>}
        {status === 'error' && (
          <p
            role="alert"
            title={error ?? undefined}
            className="flex items-start gap-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {t(updaterErrorKey(failure))}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {(status === 'available' || (status === 'error' && !!version)) && (
            <Button size="sm" className="inline-flex" onClick={() => void install()}>
              <Download className="mr-2 h-4 w-4" />
              {t('install')}
            </Button>
          )}
          {status === 'ready' && (
            <Button size="sm" className="inline-flex" onClick={() => void restart()}>
              {t('restart')}
            </Button>
          )}
          {status !== 'ready' && status !== 'available' && (
            <Button
              size="sm"
              variant="outline"
              className="inline-flex"
              disabled={busy}
              onClick={() => void check()}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status === 'checking'
                ? t('checking')
                : status === 'error' && failure === 'check'
                  ? t('tryAgain')
                  : t('check')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
