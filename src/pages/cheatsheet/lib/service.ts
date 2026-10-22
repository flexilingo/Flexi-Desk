/**
 * The cheatsheet client wired to the app: cloud reads through `supabaseCall`, the
 * offline copy through the `cheatsheet_cache_*` Tauri commands.
 */
import { invoke } from '@tauri-apps/api/core';
import { supabaseCall } from '@/lib/supabase';
import { createClient, type CachedEntry, type CacheKind } from './client';

export const cheatsheet = createClient({
  call: (method, path, body) => supabaseCall(method, path, body),
  cacheGet: (lang, kind, key) =>
    invoke<CachedEntry | null>('cheatsheet_cache_get', { lang, kind, key }),
  cachePut: (lang, kind, key, body) =>
    invoke<void>('cheatsheet_cache_put', { lang, kind, key, body }),
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
});

export type CacheStats = {
  indexes: number;
  topics: number;
  verb_lists: number;
  verbs: number;
  bytes: number;
  last_fetched_at: string | null;
};

export const cacheStats = (lang: string) => invoke<CacheStats>('cheatsheet_cache_stats', { lang });
export const cacheClear = (lang: string) => invoke<number>('cheatsheet_cache_clear', { lang });
export const cacheList = (lang: string, kind: CacheKind, prefix: string) =>
  invoke<CachedEntry[]>('cheatsheet_cache_list', { lang, kind, prefix });
