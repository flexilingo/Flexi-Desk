import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { supabaseCall } from '@/lib/supabase';
import { parseCloudError, isAuthError } from '@/lib/cloudError';
import type { AccountNoteRow, LocalNoteRow, UnifiedNote } from './notesLogic';

/** Notes on this computer: podcast bookmarks and reader notes. */
export const loadLocalNotes = () => invoke<LocalNoteRow[]>('local_notes_list');

export const updateLocalNote = (
  n: UnifiedNote,
  patch: { label?: string; note?: string; tags?: string[] },
) =>
  invoke<void>('local_note_update', {
    source: n.source,
    id: n.id,
    label: patch.label ?? null,
    note: patch.note ?? null,
    tags: patch.tags ?? null,
  });

export const deleteLocalNotes = (items: { source: 'podcast' | 'reader'; id: string }[]) =>
  invoke<number>('local_notes_delete', { items });

/**
 * Point the player or reader at the note ("note": its second, its page) or leave them where
 * they were ("source": the episode or document itself); resolves to the desk route to show.
 */
export const prepareOpen = (n: UnifiedNote, mode: 'note' | 'source') =>
  invoke<string>('local_note_prepare_open', {
    source: n.source,
    sourceId: n.sourceId,
    positionMs:
      mode === 'note' && n.source === 'podcast' && n.seconds != null
        ? Math.round(n.seconds * 1000)
        : null,
    page: mode === 'note' ? n.page : null,
  });

const PAGE = 500;
const MAX_PAGES = 4;

/** The account's notes (`studio` bookmarks), newest first, in pages of 500. */
export async function loadAccountNotes(): Promise<AccountNoteRow[]> {
  const all: AccountNoteRow[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const res = await supabaseCall<{ bookmarks?: AccountNoteRow[]; hasMore?: boolean }>(
      'GET',
      `/studio?action=get-bookmarks&limit=${PAGE}&offset=${i * PAGE}`,
    );
    all.push(...(res.bookmarks ?? []));
    if (!res.hasMore) break;
  }
  return all;
}

export const updateAccountNote = (
  id: string,
  patch: { label?: string; note?: string; tags?: string[] },
) => supabaseCall('POST', '/studio?action=update-bookmark', { bookmarkId: id, ...patch });

export const deleteAccountNotes = (ids: string[]) =>
  ids.length === 1
    ? supabaseCall(
        'DELETE',
        `/studio?action=delete-bookmark&bookmarkId=${encodeURIComponent(ids[0])}`,
      )
    : supabaseCall('POST', '/studio?action=bulk-delete-bookmarks', { bookmarkIds: ids });

export const toggleAccountFavorite = (n: UnifiedNote) =>
  supabaseCall('POST', '/studio?action=toggle-favorite', {
    videoId: n.sourceId,
    videoUrl: n.videoUrl,
    timestampSeconds: n.seconds,
    subtitleText: n.excerpt,
    translation: n.translation,
    videoTitle: n.sourceTitle,
  });

export const openInBrowser = (url: string) => openUrl(url);

/** The failure as one of the page's error codes (anything unknown becomes UNKNOWN_ERROR). */
export function errorCode(err: unknown): string {
  const e = parseCloudError(err);
  if (isAuthError(e)) return 'UNAUTHORIZED';
  const m = /^([A-Z][A-Z0-9_]+)/.exec(e.code || e.message);
  return m ? m[1] : 'UNKNOWN_ERROR';
}

export const openPrintable = (html: string) => invoke<void>('export_open_printable', { html });
