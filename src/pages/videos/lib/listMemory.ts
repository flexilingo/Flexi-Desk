// The video list the watch page's Back returns to: the catalogue or a channel page, with the filters
// that were on it (they live in the URL). Per session, so a reload keeps it and nothing else does.

const STORAGE_KEY = 'flexilingo-desk-video-list';
const CATALOGUE = '/videos';

export function rememberVideoList(href: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    /* storage unavailable — Back falls back to the catalogue */
  }
}

/** A list page is the catalogue, the channel list or a channel — never a watch page. */
function isListHref(href: string): boolean {
  if (href.startsWith(`${CATALOGUE}/watch`)) return false;
  return href === CATALOGUE || href.startsWith(`${CATALOGUE}/`) || href.startsWith(`${CATALOGUE}?`);
}

export function videoListHref(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved && isListHref(saved)) return saved;
  } catch {
    /* fall through */
  }
  return CATALOGUE;
}
