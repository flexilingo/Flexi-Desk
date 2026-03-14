import { invoke } from '@tauri-apps/api/core';

export async function supabaseCall<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const result = await invoke<T>('supabase_call', {
    method,
    path,
    body: body ?? null,
  });
  return result;
}
