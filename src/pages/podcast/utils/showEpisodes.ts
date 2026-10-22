import type { CefrLevel, CuratedEpisodeLite } from '../types';
import { showShares, type FitShare } from './levelFit';

/** The website's show page lists 24 episodes a page: every grid column count divides it. */
export const EPISODES_PER_PAGE = 24;

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** A stored level as a CEFR level, or null (the columns also hold "unknown"). */
export function asCefr(value: string | null | undefined): CefrLevel | null {
  const level = value?.toUpperCase() as CefrLevel | undefined;
  return level && CEFR_ORDER.includes(level) ? level : null;
}

/** Accents folded on both sides: a learner types "eco", the title says "l'éco". */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Search answers "where is the one about X", ready-only answers "which of these actually work". */
export function filterShowEpisodes(
  episodes: CuratedEpisodeLite[],
  query: string,
  readyOnly: boolean,
): CuratedEpisodeLite[] {
  const needle = fold(query.trim());
  return episodes.filter((e) => {
    if (readyOnly && e.status !== 'ready') return false;
    return !needle || fold(e.title).includes(needle);
  });
}

/** Pages offered for `total` episodes (never fewer than one). */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / EPISODES_PER_PAGE));
}

/** A page past the end (stale link, a filter that just narrowed the list) shows the last real page. */
export function clampPage(requested: number, totalPages: number): number {
  const n = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : 1;
  return Math.min(n, totalPages);
}

export function sliceAt<T>(items: T[], page: number): T[] {
  return items.slice((page - 1) * EPISODES_PER_PAGE, page * EPISODES_PER_PAGE);
}

export interface ShowLevelStats {
  shares: FitShare[] | null;
  /** The level holding the most transcribed episodes, else the show's own level. */
  showLevel: CefrLevel | null;
}

/** The show's level is read off its own transcribed episodes, the most common one leading. */
export function showLevelStats(
  readyBands: (CefrLevel | null | undefined)[],
  fallback: {
    cefr_level?: string | null;
    difficulty_band_low?: string | null;
    difficulty_band_high?: string | null;
  } | null,
): ShowLevelStats {
  const shares = showShares(readyBands);
  const common = shares?.reduce((a, b) => (b.value > a.value ? b : a)).level ?? null;
  const showLevel =
    common ??
    asCefr(fallback?.cefr_level) ??
    (fallback && fallback.difficulty_band_low === fallback.difficulty_band_high
      ? asCefr(fallback.difficulty_band_low)
      : null);
  return { shares, showLevel };
}

/** Feed descriptions carry markup and entities; the page shows them as text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&hellip;/g, '…')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The calendar date in the reader's language, pinned to UTC so every machine prints the same day. */
export function formatEpisodeDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** An episode's length in the reader's language ("6 min"), without a Latin "min" on an RTL page. */
export function formatEpisodeDuration(
  seconds: number | null | undefined,
  locale: string,
): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const unitDisplay = locale === 'ar' || locale === 'hi' ? 'long' : 'short';
  const format = (value: number, unit: 'hour' | 'minute') => {
    try {
      return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay }).format(value);
    } catch {
      return `${value} ${unit === 'hour' ? 'h' : 'min'}`;
    }
  };
  if (h > 0) return m > 0 ? `${format(h, 'hour')} ${format(m, 'minute')}` : format(h, 'hour');
  return format(Math.max(1, m), 'minute');
}

/** The public page of a show, as the website shares it (`/{lang}/podcasts/{id}-{slug}`). */
export function showShareUrl(
  feedId: number,
  title: string | null | undefined,
  locale: string,
): string {
  const slug = (title ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `https://flexilingo.com/${locale}/podcasts/${slug ? `${feedId}-${slug}` : feedId}`;
}

/** A feed's language named in the reader's own ("en-US" -> "English"); null when it declares nothing usable. */
export function podcastLanguageName(
  code: string | null | undefined,
  locale: string,
): string | null {
  const base = code?.trim().split(/[-_]/)[0].toLowerCase();
  if (!base || !/^[a-z]{2,3}$/.test(base)) return null;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(base);
    return name && name !== base ? name : base.toUpperCase();
  } catch {
    return base.toUpperCase();
  }
}

/** Page buttons the pager shows: a window around the current page, ellipses at the gaps. */
export function pagerPages(current: number, total: number, mobile = false): (number | '…')[] {
  const max = mobile ? 3 : 5;
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 2) return [...Array.from({ length: mobile ? 2 : 4 }, (_, i) => i + 1), '…', total];
  if (current >= total - 1) {
    const tail = mobile ? 2 : 4;
    return [1, '…', ...Array.from({ length: tail }, (_, i) => total - tail + 1 + i)];
  }
  if (mobile)
    return [
      1,
      ...(current > 3 ? (['…'] as const) : []),
      ...(current > 2 ? [current - 1] : []),
      current,
      ...(current < total - 1 ? [current + 1] : []),
      ...(current < total - 2 ? (['…'] as const) : []),
      total,
    ];
  return [1, '…', current - 1, current, current + 1, '…', total];
}
