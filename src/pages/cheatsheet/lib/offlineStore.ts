import { create } from 'zustand';
import { cheatsheet, cacheClear, cacheStats, type CacheStats } from './service';
import { downloadForOffline, type DownloadProgress } from './offline';

/**
 * The offline download lives outside any screen, so leaving the page does not
 * abandon it; `OfflineCard` just reads this.
 */
type OfflineState = {
  running: boolean;
  progress: DownloadProgress | null;
  stats: CacheStats | null;
  error: boolean;
  refreshStats: (lang: string) => Promise<void>;
  start: (lang: string, locale: string) => Promise<void>;
  cancel: () => void;
  clear: (lang: string) => Promise<void>;
};

let controller: AbortController | null = null;

export const useOfflineStore = create<OfflineState>((set, get) => ({
  running: false,
  progress: null,
  stats: null,
  error: false,

  async refreshStats(lang) {
    try {
      set({ stats: await cacheStats(lang) });
    } catch {
      set({ stats: null });
    }
  },

  async start(lang, locale) {
    if (get().running) return;
    controller = new AbortController();
    set({ running: true, error: false, progress: null });
    try {
      const final = await downloadForOffline(
        cheatsheet,
        lang,
        locale,
        (progress) => set({ progress }),
        controller.signal,
      );
      set({ progress: final });
    } catch {
      set({ error: true });
    } finally {
      controller = null;
      set({ running: false });
      cheatsheet.resetSession();
      await get().refreshStats(lang);
    }
  },

  cancel() {
    controller?.abort();
  },

  async clear(lang) {
    await cacheClear(lang);
    set({ progress: null });
    cheatsheet.resetSession();
    await get().refreshStats(lang);
  },
}));
