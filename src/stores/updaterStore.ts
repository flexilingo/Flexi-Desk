import { create } from 'zustand';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

/** Folds the updater's download events into a running byte count. */
export function nextProgress(
  prev: DownloadProgress,
  event: { event: string; data?: { contentLength?: number; chunkLength?: number } },
): DownloadProgress {
  if (event.event === 'Started') {
    return { downloaded: 0, total: event.data?.contentLength ?? null };
  }
  if (event.event === 'Progress') {
    return { ...prev, downloaded: prev.downloaded + (event.data?.chunkLength ?? 0) };
  }
  return prev;
}

/** 0-100, or null while the total size is unknown. */
export function progressPercent(p: DownloadProgress): number | null {
  if (!p.total || p.total <= 0) return null;
  return Math.min(100, Math.round((p.downloaded / p.total) * 100));
}

/** Which step failed - picks the translated sentence (the plugin's own text is English-only). */
export type UpdaterFailure = 'check' | 'install' | 'restart';

/** The `updater` i18n key for a failure. */
export function updaterErrorKey(failure: UpdaterFailure | null): string {
  if (failure === 'install') return 'errors.install';
  if (failure === 'restart') return 'errors.restart';
  return 'errors.check';
}

interface UpdaterState {
  status: UpdaterStatus;
  version: string | null;
  progress: DownloadProgress;
  /** The plugin's raw message - kept for diagnostics, never shown as the sentence. */
  error: string | null;
  failure: UpdaterFailure | null;
  dismissed: boolean;
  /** `silent` (startup): a failed check leaves no error behind. */
  check: (opts?: { silent?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
}

let pending: Update | null = null;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: 'idle',
  version: null,
  progress: { downloaded: 0, total: null },
  error: null,
  failure: null,
  dismissed: false,

  check: async (opts) => {
    const { status } = get();
    if (status === 'checking' || status === 'downloading') return;
    set({ status: 'checking', error: null, failure: null });
    try {
      const update = await check();
      if (update) {
        pending = update;
        set({ status: 'available', version: update.version, dismissed: false });
      } else {
        pending = null;
        set({ status: 'upToDate', version: null });
      }
    } catch (e) {
      if (opts?.silent) set({ status: 'idle' });
      else set({ status: 'error', error: messageOf(e), failure: 'check' });
    }
  },

  install: async () => {
    if (!pending || get().status === 'downloading') return;
    set({
      status: 'downloading',
      error: null,
      failure: null,
      progress: { downloaded: 0, total: null },
    });
    try {
      await pending.downloadAndInstall((ev) =>
        set((s) => ({ progress: nextProgress(s.progress, ev) })),
      );
      set({ status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: messageOf(e), failure: 'install' });
    }
  },

  restart: async () => {
    try {
      await relaunch();
    } catch (e) {
      set({ status: 'error', error: messageOf(e), failure: 'restart' });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
