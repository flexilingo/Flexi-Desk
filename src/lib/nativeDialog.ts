import { invoke } from '@tauri-apps/api/core';

/**
 * File dialogs are opened by Rust, not by the webview. Rust remembers the path the user picked
 * and the commands that read or write a path accept only such paths (or paths inside the app's
 * own folder), so a script running in the page cannot name an arbitrary file.
 */
export interface NativeDialogOptions {
  title?: string;
  /** `save` only: a suggested file name. */
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  /** Accepted for call-site compatibility; the dialog always picks a single file. */
  multiple?: boolean;
}

/** "Open file" dialog. Resolves the picked path, or null when the user cancelled. */
export function open(options: NativeDialogOptions = {}): Promise<string | null> {
  const { title, filters } = options;
  return invoke<string | null>('dialog_pick_file', { options: { title, filters } });
}

/** "Save as" dialog. Resolves the chosen path, or null when the user cancelled. */
export function save(options: NativeDialogOptions = {}): Promise<string | null> {
  const { title, defaultPath, filters } = options;
  return invoke<string | null>('dialog_pick_save', { options: { title, defaultPath, filters } });
}
