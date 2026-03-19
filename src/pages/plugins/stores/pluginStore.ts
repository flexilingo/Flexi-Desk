import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepageUrl?: string;
  permissions: string[];
  config: Record<string, unknown>;
  status: 'disabled' | 'enabled' | 'error' | 'updating';
  errorMessage?: string;
  installSource: string;
  installedAt: string;
}

interface RawPlugin {
  id: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  homepage_url: string | null;
  permissions: string[];
  config: Record<string, unknown>;
  status: string;
  error_message: string | null;
  install_source: string;
  installed_at: string;
  updated_at: string;
}

function mapPlugin(raw: RawPlugin): PluginInfo {
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version,
    description: raw.description ?? undefined,
    author: raw.author ?? undefined,
    homepageUrl: raw.homepage_url ?? undefined,
    permissions: raw.permissions,
    config: raw.config,
    status: raw.status as PluginInfo['status'],
    errorMessage: raw.error_message ?? undefined,
    installSource: raw.install_source,
    installedAt: raw.installed_at,
  };
}

interface PluginState {
  plugins: PluginInfo[];
  isLoading: boolean;
  error: string | null;

  fetchPlugins: () => Promise<void>;
  enablePlugin: (id: string) => Promise<void>;
  disablePlugin: (id: string) => Promise<void>;
  uninstallPlugin: (id: string) => Promise<void>;
  updateConfig: (id: string, config: Record<string, unknown>) => Promise<void>;
  installLocal: (dir: string) => Promise<void>;
}

export const usePluginStore = create<PluginState>()(
  immer((set) => ({
    plugins: [],
    isLoading: false,
    error: null,

    fetchPlugins: async () => {
      set((s) => { s.isLoading = true; });
      try {
        const raw = await invoke<RawPlugin[]>('plugin_list');
        set((s) => {
          s.plugins = raw.map(mapPlugin);
          s.isLoading = false;
        });
      } catch (err) {
        set((s) => { s.error = String(err); s.isLoading = false; });
      }
    },

    enablePlugin: async (id) => {
      try {
        const raw = await invoke<RawPlugin>('plugin_enable', { pluginId: id });
        const updated = mapPlugin(raw);
        set((s) => {
          const idx = s.plugins.findIndex((p) => p.id === id);
          if (idx >= 0) s.plugins[idx] = updated;
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    disablePlugin: async (id) => {
      try {
        const raw = await invoke<RawPlugin>('plugin_disable', { pluginId: id });
        const updated = mapPlugin(raw);
        set((s) => {
          const idx = s.plugins.findIndex((p) => p.id === id);
          if (idx >= 0) s.plugins[idx] = updated;
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    uninstallPlugin: async (id) => {
      try {
        await invoke('plugin_uninstall', { pluginId: id });
        set((s) => {
          s.plugins = s.plugins.filter((p) => p.id !== id);
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    updateConfig: async (id, config) => {
      try {
        const raw = await invoke<RawPlugin>('plugin_update_config', {
          pluginId: id,
          config,
        });
        const updated = mapPlugin(raw);
        set((s) => {
          const idx = s.plugins.findIndex((p) => p.id === id);
          if (idx >= 0) s.plugins[idx] = updated;
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    installLocal: async (dir) => {
      try {
        const raw = await invoke<RawPlugin>('plugin_install_local', { pluginDir: dir });
        set((s) => {
          s.plugins.push(mapPlugin(raw));
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },
  })),
);
