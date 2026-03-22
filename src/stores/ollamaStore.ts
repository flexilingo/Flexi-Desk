import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';
import { setSetting, getSetting } from '@/lib/tauri-bridge';
import type {
  OllamaModel,
  OllamaPullProgress,
  OllamaInstallStatus,
  OllamaInstallProgress,
  RawOllamaStatus,
  RawOllamaInstallStatus,
} from './ollamaTypes';
import { mapOllamaModel, mapOllamaStatus, mapOllamaInstallStatus } from './ollamaTypes';

interface OllamaState {
  isConnected: boolean;
  version: string | null;
  isCheckingConnection: boolean;

  installedModels: OllamaModel[];
  isLoadingModels: boolean;

  isPulling: boolean;
  pullProgress: OllamaPullProgress | null;
  pullingModelName: string | null;

  selectedModel: string | null;

  // Install state
  installStatus: OllamaInstallStatus | null;
  isInstalling: boolean;
  installProgress: OllamaInstallProgress | null;
  isStartingServe: boolean;

  error: string | null;

  checkConnection: () => Promise<void>;
  fetchInstalledModels: () => Promise<void>;
  pullModel: (modelName: string) => Promise<void>;
  deleteModel: (modelName: string) => Promise<void>;
  selectModel: (modelName: string) => Promise<void>;
  setPullProgress: (progress: OllamaPullProgress | null) => void;
  clearError: () => void;
  loadSelectedModel: () => Promise<void>;

  // Install actions
  checkInstallStatus: () => Promise<void>;
  installOllama: () => Promise<void>;
  startServe: () => Promise<void>;
  stopServe: () => Promise<void>;
  setInstallProgress: (progress: OllamaInstallProgress | null) => void;
}

export const useOllamaStore = create<OllamaState>()(
  immer((set, get) => ({
    isConnected: false,
    version: null,
    isCheckingConnection: false,

    installedModels: [],
    isLoadingModels: false,

    isPulling: false,
    pullProgress: null,
    pullingModelName: null,

    selectedModel: null,

    installStatus: null,
    isInstalling: false,
    installProgress: null,
    isStartingServe: false,

    error: null,

    checkConnection: async () => {
      set((s) => {
        s.isCheckingConnection = true;
        s.error = null;
      });
      try {
        const raw = await invoke<RawOllamaStatus>('ollama_status');
        const status = mapOllamaStatus(raw);
        set((s) => {
          s.isConnected = status.connected;
          s.version = status.version;
          s.installedModels = status.models;
          s.isCheckingConnection = false;
        });
        // Auto-select the first model if Ollama is connected but no model is saved
        if (status.connected && status.models.length > 0 && !get().selectedModel) {
          await get().selectModel(status.models[0].name);
        }
      } catch (err) {
        set((s) => {
          s.isConnected = false;
          s.version = null;
          s.installedModels = [];
          s.isCheckingConnection = false;
          s.error = String(err);
        });
      }
    },

    fetchInstalledModels: async () => {
      set((s) => {
        s.isLoadingModels = true;
      });
      try {
        const raw = await invoke<{ name: string; size: number; digest: string; modified_at: string }[]>('ollama_list_models');
        const models = raw.map(mapOllamaModel);
        set((s) => {
          s.installedModels = models;
          s.isLoadingModels = false;
        });
        // Auto-select the first model if none is selected yet
        if (models.length > 0 && !get().selectedModel) {
          await get().selectModel(models[0].name);
        }
      } catch (err) {
        set((s) => {
          s.isLoadingModels = false;
          s.error = String(err);
        });
      }
    },

    pullModel: async (modelName: string) => {
      set((s) => {
        s.isPulling = true;
        s.pullingModelName = modelName;
        s.pullProgress = null;
        s.error = null;
      });
      try {
        await invoke('ollama_pull_model', { modelName });
        await get().fetchInstalledModels();
        set((s) => {
          s.isPulling = false;
          s.pullingModelName = null;
          s.pullProgress = null;
        });
      } catch (err) {
        set((s) => {
          s.isPulling = false;
          s.pullingModelName = null;
          s.pullProgress = null;
          s.error = String(err);
        });
      }
    },

    deleteModel: async (modelName: string) => {
      set((s) => {
        s.error = null;
      });
      try {
        await invoke('ollama_delete_model', { modelName });
        await get().fetchInstalledModels();
        if (get().selectedModel === modelName) {
          set((s) => {
            s.selectedModel = null;
          });
        }
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    selectModel: async (modelName: string) => {
      set((s) => {
        s.selectedModel = modelName;
      });
      await setSetting('ai_model', modelName);
    },

    setPullProgress: (progress) => {
      set((s) => {
        s.pullProgress = progress;
      });
    },

    clearError: () => {
      set((s) => {
        s.error = null;
      });
    },

    loadSelectedModel: async () => {
      const model = await getSetting('ai_model');
      if (model) {
        set((s) => {
          s.selectedModel = model;
        });
      }
    },

    // Install actions
    checkInstallStatus: async () => {
      try {
        const raw = await invoke<RawOllamaInstallStatus>('ollama_install_status');
        set((s) => {
          s.installStatus = mapOllamaInstallStatus(raw);
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    installOllama: async () => {
      set((s) => {
        s.isInstalling = true;
        s.installProgress = null;
        s.error = null;
      });
      try {
        await invoke('ollama_install');
        // After install, start serve and connect
        set((s) => {
          s.isInstalling = false;
          s.installProgress = null;
        });
        await get().startServe();
        await get().checkInstallStatus();
      } catch (err) {
        set((s) => {
          s.isInstalling = false;
          s.installProgress = null;
          s.error = String(err);
        });
      }
    },

    startServe: async () => {
      set((s) => {
        s.isStartingServe = true;
        s.error = null;
      });
      try {
        await invoke('ollama_start_serve');
        // Re-check connection after starting
        await get().checkConnection();
        set((s) => {
          s.isStartingServe = false;
        });
      } catch (err) {
        set((s) => {
          s.isStartingServe = false;
          s.error = String(err);
        });
      }
    },

    stopServe: async () => {
      try {
        await invoke('ollama_stop_serve');
        set((s) => {
          s.isConnected = false;
          s.installedModels = [];
        });
      } catch (err) {
        set((s) => {
          s.error = String(err);
        });
      }
    },

    setInstallProgress: (progress) => {
      set((s) => {
        s.installProgress = progress;
      });
    },
  }))
);
