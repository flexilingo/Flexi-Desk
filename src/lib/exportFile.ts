import { invoke } from '@tauri-apps/api/core';
import { save } from './nativeDialog';

/** Ask where to save, then write the file. Resolves false when the user cancelled. */
export async function saveTextFile(
  defaultName: string,
  ext: string,
  content: string,
): Promise<boolean> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return false;
  await invoke('export_save_text', { path, content });
  return true;
}
