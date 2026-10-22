import { useEffect } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSyncStore } from '@/stores/syncStore';

export function SyncSettings() {
  const { t } = useTranslation('settingsDesk');
  const { syncState, tables, isLoading, fetchStatus, fetchConfig, setTableEnabled } =
    useSyncStore();

  useEffect(() => {
    fetchStatus();
    fetchConfig();
  }, [fetchStatus, fetchConfig]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">{t('sync.title')}</h2>
        </div>
        {syncState && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                syncState.status === 'Synced'
                  ? 'bg-success'
                  : syncState.status === 'Error' || syncState.status === 'Conflict'
                    ? 'bg-destructive'
                    : 'bg-muted-foreground'
              }`}
            />
            <span>{t(`sync.status.${syncState.status}`, { defaultValue: syncState.status })}</span>
            {syncState.pendingCount > 0 && (
              <span>{t('sync.pending', { count: syncState.pendingCount })}</span>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t('sync.hint')}</p>

      {isLoading && tables.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{t('sync.loading')}</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {tables.map((table) => (
            <div key={table.tableName} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-foreground">
                  {t(`sync.tables.${table.tableName}`, { defaultValue: table.tableName })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {table.lastSyncedAt
                    ? t('sync.lastSynced', { date: new Date(table.lastSyncedAt).toLocaleString() })
                    : t('sync.never')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={table.syncDirection}
                  onChange={(e) =>
                    setTableEnabled(table.tableName, table.isEnabled, e.target.value)
                  }
                  disabled={!table.isEnabled}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="both">{t('sync.both')}</option>
                  <option value="push">{t('sync.push')}</option>
                  <option value="pull">{t('sync.pull')}</option>
                </select>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={table.isEnabled}
                    onChange={(e) => setTableEnabled(table.tableName, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:h-4 after:w-4 after:rounded-full after:bg-background after:transition-transform peer-checked:after:translate-x-4" />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {syncState?.conflictCount && syncState.conflictCount > 0 && (
        <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground">
          <RefreshCw className="me-1 inline h-3.5 w-3.5 text-accent" />
          {t('sync.conflicts', { count: syncState.conflictCount })}
        </div>
      )}
    </div>
  );
}
