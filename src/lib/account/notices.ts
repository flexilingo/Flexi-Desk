import type { PublicAnnouncement } from './types';

const DISMISSED_ANN = 'fl_dismissed_announcements';
const DISMISSED_LOC = 'flexi-locale-suggestion-dismissed';

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeList(key: string, v: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* closes for this session only */
  }
}

export const dismissedIds = () => new Set(readList(DISMISSED_ANN));
export function dismissAnnouncement(id: string): Set<string> {
  const next = new Set(readList(DISMISSED_ANN)).add(id);
  writeList(DISMISSED_ANN, [...next]);
  return next;
}

/** The announcement for a slot that the person has not closed. */
export function pickAnnouncement(
  list: PublicAnnouncement[],
  slot: string,
  dismissed: Set<string>,
): PublicAnnouncement | null {
  const found = list.find((a) => a.slot === slot) ?? null;
  return found && !dismissed.has(found.id) ? found : null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * The words of an announcement (operators write simple HTML). Markup is dropped, so it
 * is shown as text - it is never injected as HTML.
 */
export function announcementText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/[ \t\n\r\f]+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p\b[^>]*>/gi, '\uE000')
    .replace(/<[^>]*>/g, '')
    .replace(/ *\uE000[\uE000 ]*/g, '\uE000')
    .replace(/^\uE000|\uE000$/g, '')
    .replace(/\uE000/g, '\n')
    .replace(/ *\n */g, '\n')
    .replace(/^ | $/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    });
}

/** Written in the language being offered: the person may not read the current one. */
export const LOCALE_COPY: Record<
  string,
  { text: string; cta: string; close: string; dir: 'ltr' | 'rtl' }
> = {
  zh: { text: '此应用有中文版本。', cta: '切换到中文', close: '关闭', dir: 'ltr' },
  fr: {
    text: 'Cette application existe aussi en français.',
    cta: 'Passer au français',
    close: 'Fermer',
    dir: 'ltr',
  },
  ar: {
    text: 'هذا التطبيق متوفر أيضًا باللغة العربية.',
    cta: 'الانتقال إلى العربية',
    close: 'إغلاق',
    dir: 'rtl',
  },
  hi: {
    text: 'यह ऐप हिन्दी में भी उपलब्ध है।',
    cta: 'हिन्दी में देखें',
    close: 'बंद करें',
    dir: 'ltr',
  },
  fa: {
    text: 'این برنامه به فارسی هم هست.',
    cta: 'رفتن به نسخه‌ی فارسی',
    close: 'بستن',
    dir: 'rtl',
  },
  de: {
    text: 'Diese App gibt es auch auf Deutsch.',
    cta: 'Zu Deutsch wechseln',
    close: 'Schließen',
    dir: 'ltr',
  },
  vi: {
    text: 'Ứng dụng này cũng có tiếng Việt.',
    cta: 'Chuyển sang tiếng Việt',
    close: 'Đóng',
    dir: 'ltr',
  },
  en: {
    text: 'This app is also in English.',
    cta: 'Switch to English',
    close: 'Close',
    dir: 'ltr',
  },
};

export const dismissedLocales = () => readList(DISMISSED_LOC);
export function dismissLocale(code: string): string[] {
  const next = [...new Set([...readList(DISMISSED_LOC), code])];
  writeList(DISMISSED_LOC, next);
  return next;
}

/**
 * The first language the computer prefers that the app has and is not using, unless the
 * person already closed that offer. `null` when the app already speaks it.
 */
export function localeOffer(preferred: string[], current: string, dismissed: string[]) {
  const cur = current.split('-')[0].toLowerCase();
  for (const tag of preferred) {
    const code = tag?.split('-')[0]?.toLowerCase();
    if (!code || !LOCALE_COPY[code]) continue;
    if (code === cur) return null;
    if (dismissed.includes(code)) return null;
    return { code, copy: LOCALE_COPY[code], dir: LOCALE_COPY[code].dir };
  }
  return null;
}
