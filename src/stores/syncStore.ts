import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

export type SyncStatusType = 'Idle' | 'Syncing' | 'Synced' | 'Offline' | 'Error' | 'Conflict';

export interface SyncState {
  status: SyncStatusType;
  lastSyncedAt: string | null;
  pendingCount: number;
  conflictCount: number;
  errorMessage: string | null;
}

export interface SyncTableConfig {
  tableName: string;
  isEnabled: boolean;
  lastSyncedAt: string | null;
  recordCount: number;
  syncDirection: 'push' | 'pull' | 'both';
}

export interface SyncConflict {
  id: string;
  tableName: string;
  rowId: string;
  localData: string;
  remoteData: string;
  localUpdated: string;
  remoteUpdated: string;
  status: string;
}

interface RawSyncState {
  status: SyncStatusType;
  last_synced_at: string | null;
  pending_count: number;
  conflict_count: number;
  error_message: string | null;
}

interface RawSyncMetadata {
  table_name: string;
  last_synced_at: string | null;
  is_enabled: boolean;
  record_count: number;
  sync_direction: string;
}

interface RawSyncConflict {
  id: string;
  table_name: string;
  row_id: string;
  local_data: string;
  remote_data: string;
  local_updated: string;
  remote_updated: string;
  status: string;
}

interface SyncStoreState {
  syncState: SyncState | null;
  tables: SyncTableConfig[];
  conflicts: SyncConflict[];
  isLoading: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchConflicts: () => Promise<void>;
  setTableEnabled: (tableName: string, enabled: boolean, direction?: string) => Promise<void>;
  resolveConflict: (conflictId: string, resolution: 'keep_local' | 'keep_remote') => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>()(
  immer((set) => ({
    syncState: null,
    tables: [],
    conflicts: [],
    isLoading: false,
    error: null,

    fetchStatus: async () => {
      try {
        const raw = await invoke<RawSyncState>('sync_get_status');
        set((s) => {
          s.syncState = {
            status: raw.status,
            lastSyncedAt: raw.last_synced_at,
            pendingCount: raw.pending_count,
            conflictCount: raw.conflict_count,
            errorMessage: raw.error_message,
          };
        });
      } catch {
        /* best-effort */
      }
    },

    fetchConfig: async () => {
      set((s) => { s.isLoading = true; });
      try {
        const raw = await invoke<RawSyncMetadata[]>('sync_get_config');
        set((s) => {
          s.tables = raw.map((r) => ({
            tableName: r.table_name,
            isEnabled: r.is_enabled,
            lastSyncedAt: r.last_synced_at,
            recordCount: r.record_count,
            syncDirection: r.sync_direction as 'push' | 'pull' | 'both',
          }));
          s.isLoading = false;
        });
      } catch (err) {
        set((s) => { s.error = String(err); s.isLoading = false; });
      }
    },

    fetchConflicts: async () => {
      try {
        const raw = await invoke<RawSyncConflict[]>('sync_get_conflicts');
        set((s) => {
          s.conflicts = raw.map((r) => ({
            id: r.id,
            tableName: r.table_name,
            rowId: r.row_id,
            localData: r.local_data,
            remoteData: r.remote_data,
            localUpdated: r.local_updated,
            remoteUpdated: r.remote_updated,
            status: r.status,
          }));
        });
      } catch {
        /* best-effort */
      }
    },

    setTableEnabled: async (tableName, enabled, direction) => {
      try {
        await invoke('sync_set_table_enabled', {
          tableName,
          enabled,
          direction: direction ?? null,
        });
        const raw = await invoke<RawSyncMetadata[]>('sync_get_config');
        set((s) => {
          s.tables = raw.map((r) => ({
            tableName: r.table_name,
            isEnabled: r.is_enabled,
            lastSyncedAt: r.last_synced_at,
            recordCount: r.record_count,
            syncDirection: r.sync_direction as 'push' | 'pull' | 'both',
          }));
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    resolveConflict: async (conflictId, resolution) => {
      try {
        await invoke('sync_resolve_conflict', { conflictId, resolution });
        set((s) => {
          s.conflicts = s.conflicts.filter((c) => c.id !== conflictId);
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },
  })),
);
