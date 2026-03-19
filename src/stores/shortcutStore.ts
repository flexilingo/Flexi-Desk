import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

export interface KeyboardShortcut {
  id: string;
  actionId: string;
  label: string;
  description?: string;
  category: 'global' | 'navigation' | 'review' | 'reading' | 'caption' | 'podcast' | 'general';
  keyBinding: string;
  defaultBinding: string;
  isGlobal: boolean;
  isEnabled: boolean;
}

export interface ShortcutConflict {
  newActionId: string;
  existingActionId: string;
  existingLabel: string;
  keyBinding: string;
}

interface RawShortcut {
  id: string;
  action_id: string;
  label: string;
  description: string | null;
  category: string;
  key_binding: string;
  default_binding: string;
  is_global: boolean;
  is_enabled: boolean;
  updated_at: string;
}

function mapShortcut(raw: RawShortcut): KeyboardShortcut {
  return {
    id: raw.id,
    actionId: raw.action_id,
    label: raw.label,
    description: raw.description ?? undefined,
    category: raw.category as KeyboardShortcut['category'],
    keyBinding: raw.key_binding,
    defaultBinding: raw.default_binding,
    isGlobal: raw.is_global,
    isEnabled: raw.is_enabled,
  };
}

interface ShortcutState {
  shortcuts: KeyboardShortcut[];
  isLoading: boolean;
  error: string | null;

  fetchShortcuts: (category?: string) => Promise<void>;
  updateBinding: (actionId: string, newBinding: string) => Promise<ShortcutConflict | null>;
  checkConflict: (actionId: string, binding: string) => Promise<ShortcutConflict | null>;
  resetShortcut: (actionId: string) => Promise<void>;
  resetAll: () => Promise<void>;
  toggleShortcut: (actionId: string, enabled: boolean) => Promise<void>;
}

export const useShortcutStore = create<ShortcutState>()(
  immer((set) => ({
    shortcuts: [],
    isLoading: false,
    error: null,

    fetchShortcuts: async (category) => {
      set((s) => { s.isLoading = true; });
      try {
        const raw = await invoke<RawShortcut[]>('shortcut_list', {
          category: category ?? null,
        });
        set((s) => {
          s.shortcuts = raw.map(mapShortcut);
          s.isLoading = false;
        });
      } catch (err) {
        set((s) => { s.error = String(err); s.isLoading = false; });
      }
    },

    updateBinding: async (actionId, newBinding) => {
      try {
        // Check for conflicts first
        const conflict = await invoke<ShortcutConflict | null>('shortcut_check_conflict', {
          actionId,
          binding: newBinding,
        });
        if (conflict) return conflict;

        const raw = await invoke<RawShortcut>('shortcut_update_binding', {
          actionId,
          newBinding,
        });
        const updated = mapShortcut(raw);
        set((s) => {
          const idx = s.shortcuts.findIndex((sc) => sc.actionId === actionId);
          if (idx >= 0) s.shortcuts[idx] = updated;
        });
        return null;
      } catch (err) {
        set((s) => { s.error = String(err); });
        return null;
      }
    },

    checkConflict: async (actionId, binding) => {
      try {
        return await invoke<ShortcutConflict | null>('shortcut_check_conflict', {
          actionId,
          binding,
        });
      } catch {
        return null;
      }
    },

    resetShortcut: async (actionId) => {
      try {
        const raw = await invoke<RawShortcut>('shortcut_reset', { actionId });
        const updated = mapShortcut(raw);
        set((s) => {
          const idx = s.shortcuts.findIndex((sc) => sc.actionId === actionId);
          if (idx >= 0) s.shortcuts[idx] = updated;
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    resetAll: async () => {
      try {
        const raw = await invoke<RawShortcut[]>('shortcut_reset_all');
        set((s) => {
          s.shortcuts = raw.map(mapShortcut);
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },

    toggleShortcut: async (actionId, enabled) => {
      try {
        const raw = await invoke<RawShortcut>('shortcut_toggle', { actionId, enabled });
        const updated = mapShortcut(raw);
        set((s) => {
          const idx = s.shortcuts.findIndex((sc) => sc.actionId === actionId);
          if (idx >= 0) s.shortcuts[idx] = updated;
        });
      } catch (err) {
        set((s) => { s.error = String(err); });
      }
    },
  })),
);
