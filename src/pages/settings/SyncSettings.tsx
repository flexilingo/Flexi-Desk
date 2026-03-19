import { useEffect } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { useSyncStore } from '@/stores/syncStore';

const TABLE_LABELS: Record<string, string> = {
  vocabulary: 'Vocabulary',
  decks: 'Decks',
  deck_cards: 'Deck Cards',
  srs_progress: 'SRS Progress',
  goals: 'Goals',
  daily_stats: 'Daily Stats',
  streaks: 'Streaks',
  settings: 'Settings',
};

export function SyncSettings() {
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
          <h2 className="text-base font-semibold text-foreground">Cloud Sync</h2>
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
            <span>{syncState.status}</span>
            {syncState.pendingCount > 0 && (
              <span>({syncState.pendingCount} pending)</span>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Choose which data to sync with your FlexiLingo cloud account. Changes made
        offline are queued and synced when connected.
      </p>

      {isLoading && tables.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {tables.map((table) => (
            <div
              key={table.tableName}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm text-foreground">
                  {TABLE_LABELS[table.tableName] ?? table.tableName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {table.lastSyncedAt
                    ? `Last synced: ${new Date(table.lastSyncedAt).toLocaleString()}`
                    : 'Never synced'}
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
                  <option value="both">Both</option>
                  <option value="push">Push only</option>
                  <option value="pull">Pull only</option>
                </select>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={table.isEnabled}
                    onChange={(e) =>
                      setTableEnabled(table.tableName, e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {syncState?.conflictCount && syncState.conflictCount > 0 && (
        <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground">
          <RefreshCw className="inline h-3.5 w-3.5 mr-1 text-accent" />
          {syncState.conflictCount} unresolved conflict(s). Go to Settings &gt; Conflicts to resolve.
        </div>
      )}
    </div>
  );
}
