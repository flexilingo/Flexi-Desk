import type { TFunction } from 'i18next';
import type { ReadingItem } from './queue';

/**
 * The "more" trigger as a plain icon button: the menu holds secondary actions
 * (remove, delete), so it should not read as a second button.
 */
export const QUIET_MENU =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/**
 * The one action an item offers, named for what it can actually open. A
 * document that is not ready leads to its own pages when it can, and otherwise
 * simply opens.
 */
export function actionLabel(item: ReadingItem, t: TFunction, tl: TFunction): string {
  if (item.status !== 'ready')
    return item.href.includes('/pdf/') ? t('library.readPages') : t('library.open');
  if (item.finished) return t('home.readAgain');
  return item.started ? tl('shelf.continue') : tl('shelf.start');
}

/** Where the reader is in it, in words — or null while there is nothing to measure. */
export function progressLine(item: ReadingItem, t: TFunction, tl: TFunction): string | null {
  if (item.status !== 'ready') return null;
  if (item.finished) return tl('shelf.finished');
  if (item.started && item.pageCount)
    return tl('shelf.page', { n: item.page, total: item.pageCount });
  if (item.kind !== 'book' && item.pageCount) {
    return item.pageCount === 1 ? t('library.onePage') : t('library.pages', { n: item.pageCount });
  }
  return t('home.notStarted');
}
