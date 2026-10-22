import type { WordDialogTab } from './types';

/** The tab a reader last picked, remembered between words and sessions. */
const KEY = 'flexi.wordDialog.tab';
export const WORD_DIALOG_TABS: readonly WordDialogTab[] = [
  'google',
  'ai',
  'dictionary',
  'merriam-webster',
];

export function readLastTab(): WordDialogTab | null {
  try {
    const stored = window.localStorage.getItem(KEY);
    return WORD_DIALOG_TABS.includes(stored as WordDialogTab) ? (stored as WordDialogTab) : null;
  } catch {
    return null;
  }
}

export function rememberTab(tab: WordDialogTab): void {
  try {
    window.localStorage.setItem(KEY, tab);
  } catch {
    // Storage unavailable: the dialog simply opens on its default.
  }
}
