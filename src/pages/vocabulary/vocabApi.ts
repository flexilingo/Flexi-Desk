import { invoke } from '@tauri-apps/api/core';
import { supabaseCall } from '@/lib/supabase';
import type { AccountWordRow, LocalWordRow } from './vocabLogic';

/** Every word in this computer's store, with its SRS status and lookup count. */
export const loadLocalWords = () => invoke<LocalWordRow[]>('vocabulary_overview');

export const updateWord = (
  id: number,
  patch: { translation: string; definition: string; pos: string; cefrLevel: string },
) => invoke<void>('vocabulary_update', { id, ...patch });

export const deleteWords = (ids: number[]) => invoke<number>('vocabulary_bulk_delete', { ids });

interface HistoryPage {
  words?: AccountWordRow[];
  pagination?: { totalPages?: number };
}

const LIMIT = 100;
const MAX_PAGES = 10;

/**
 * The account's looked-up words: the 1000 most recent, plus the 100 most clicked (so a
 * word looked up often long ago still counts towards "most clicked" and the suggestions).
 */
export async function loadAccountWords(): Promise<AccountWordRow[]> {
  const byId = new Map<string, AccountWordRow>();
  const read = async (sort: string, page: number) =>
    supabaseCall<HistoryPage>(
      'GET',
      `/vocabulary?action=history&sort=${sort}&page=${page}&limit=${LIMIT}`,
    );

  const first = await read('recent', 1);
  for (const w of first.words ?? []) byId.set(w.id, w);
  const pages = Math.min(first.pagination?.totalPages ?? 1, MAX_PAGES);
  const rest = await Promise.all([
    ...Array.from({ length: Math.max(0, pages - 1) }, (_, i) => read('recent', i + 2)),
    read('most_clicked', 1),
  ]);
  for (const r of rest) for (const w of r.words ?? []) byId.set(w.id, w);
  return [...byId.values()];
}
