import { useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useSyncStore } from '@/stores/syncStore';

export function SyncStatusIndicator() {
  const { syncState, fetchStatus } = useSyncStore();

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!syncState) return null;

  const { status, pendingCount } = syncState;

  const icon = (() => {
    switch (status) {
      case 'Syncing':
        return <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />;
      case 'Synced':
        return <Cloud className="h-3.5 w-3.5 text-success" />;
      case 'Offline':
        return <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'Error':
      case 'Conflict':
        return <AlertTriangle className="h-3.5 w-3.5 text-accent" />;
      default:
        return <Cloud className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  })();

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground" title={`Sync: ${status}`}>
      {icon}
      {pendingCount > 0 && <span className="text-[10px]">{pendingCount}</span>}
    </div>
  );
}
