/**
 * The Vocabulary page's rules, free of React and of Tauri: merging the words looked up on
 * this computer with the account's history, and filtering, sorting, paging, counting and
 * recommending on the result. Mirrors the website's `vocabulary` function, which did the
 * same on the server.
 */

export type VocabStatus = 'new' | 'learning' | 'mastered';
export type VocabSort = 'recent' | 'most_clicked' | 'alphabetical';
export type CefrBand = 'all' | 'A1' | 'B1' | 'C1';

/** A word from this computer's word store, as `vocabulary_overview` returns it. */
export interface LocalWordRow {
  id: number;
  word: string;
  language: string;
  pos: string | null;
  cefr_level: string | null;
  translation: string | null;
  definition: string | null;
  context_sentence: string | null;
  source_module: string | null;
  created_at: string;
  last_seen_at: string;
  lookup_count: number;
  deck_count: number;
  status: VocabStatus;
  level: number;
}

/** A word from the account's history (`vocabulary?action=history`). */
export interface AccountWordRow {
  id: string;
  word: string;
  translation: string | null;
  lookup_count: number;
  first_seen_at: string;
  last_seen_at: string;
  cefrLevel: string;
  sourceLang?: string | null;
  status: 'new' | 'in_deck' | 'mastered';
  leitnerBox: number;
  videoContexts?: string[];
}

export interface VocabItem {
  /** Unique per word and language. */
  key: string;
  word: string;
  translation: string | null;
  /** A1..C2, or 'unknown'. */
  cefr: string;
  /** The word's language; null for an old account lookup it cannot be told from. */
  language: string | null;
  lookups: number;
  firstMs: number;
  lastMs: number;
  status: VocabStatus;
  /** 0..5, the dots on the card. */
  level: number;
  contexts: string[];
  /** Set when the word is in this computer's store: the only place it can be edited or deleted. */
  local: LocalWordRow | null;
  /** True when the account's history knows the word. */
  inAccount: boolean;
}

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const PAGE_SIZE = 20;
export const RECOMMENDATION_LIMIT = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RANK: Record<VocabStatus, number> = { new: 0, learning: 1, mastered: 2 };

/** SQLite stamps `YYYY-MM-DD HH:MM:SS` in UTC with no zone; read it as UTC. */
export function parseStamp(value: string | null | undefined): number {
  if (!value) return 0;
  const plain = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
  const ms = new Date(plain ? `${value.replace(' ', 'T')}Z` : value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function normalizeCefr(level: string | null | undefined): string {
  const up = (level ?? '').trim().toUpperCase();
  return CEFR_LEVELS.includes(up) ? up : 'unknown';
}

const wordKey = (w: string) => w.trim().toLowerCase();

function uniq(list: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const s of list) {
    const v = s?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export function accountStatus(s: AccountWordRow['status']): VocabStatus {
  return s === 'mastered' ? 'mastered' : s === 'in_deck' ? 'learning' : 'new';
}

/**
 * One list from both places, merged by word. An account word joins the local word it is
 * the same as (same spelling, and the same language when the account knows it); the
 * rest stand alone. Where both know a word the better SRS state wins, the lookup count
 * is the larger of the two (a signed-in desk lookup is recorded in both places, so
 * adding them would count it twice), and the dates span both.
 */
export function mergeWords(local: LocalWordRow[], account: AccountWordRow[]): VocabItem[] {
  const items = new Map<string, VocabItem>();
  for (const r of local) {
    const key = `${r.language}:${wordKey(r.word)}`;
    items.set(key, {
      key,
      word: r.word,
      translation: r.translation,
      cefr: normalizeCefr(r.cefr_level),
      language: r.language,
      lookups: r.lookup_count,
      firstMs: parseStamp(r.created_at),
      lastMs: parseStamp(r.last_seen_at),
      status: r.status,
      level: r.level,
      contexts: uniq([r.context_sentence]),
      local: r,
      inAccount: false,
    });
  }

  for (const a of account) {
    const w = wordKey(a.word);
    const lang = a.sourceLang ?? null;
    let target: VocabItem | undefined = lang ? items.get(`${lang}:${w}`) : undefined;
    if (!target && !lang) {
      target = [...items.values()].find((i) => wordKey(i.word) === w && i.local !== null);
    }
    const status = accountStatus(a.status);
    if (target) {
      target.inAccount = true;
      target.translation = target.translation ?? a.translation;
      if (target.cefr === 'unknown') target.cefr = normalizeCefr(a.cefrLevel);
      target.lookups = Math.max(target.lookups, a.lookup_count);
      target.firstMs = Math.min(
        target.firstMs || Infinity,
        parseStamp(a.first_seen_at) || Infinity,
      );
      if (!Number.isFinite(target.firstMs)) target.firstMs = 0;
      target.lastMs = Math.max(target.lastMs, parseStamp(a.last_seen_at));
      if (RANK[status] > RANK[target.status]) target.status = status;
      target.level = Math.max(target.level, a.leitnerBox ?? 0);
      target.contexts = uniq([...target.contexts, ...(a.videoContexts ?? [])]);
      continue;
    }
    const key = `${lang ?? '?'}:${w}`;
    const existing = items.get(key);
    if (existing) {
      // The account lists the same word twice (once per lookup language): keep the busier row.
      existing.lookups = Math.max(existing.lookups, a.lookup_count);
      existing.lastMs = Math.max(existing.lastMs, parseStamp(a.last_seen_at));
      continue;
    }
    items.set(key, {
      key,
      word: a.word,
      translation: a.translation,
      cefr: normalizeCefr(a.cefrLevel),
      language: lang,
      lookups: a.lookup_count,
      firstMs: parseStamp(a.first_seen_at),
      lastMs: parseStamp(a.last_seen_at),
      status,
      level: a.leitnerBox ?? 0,
      contexts: uniq(a.videoContexts ?? []),
      local: null,
      inAccount: true,
    });
  }
  return [...items.values()];
}

/** The chips offer a band: A1-A2, B1-B2, C1-C2. */
export function cefrInBand(cefr: string, band: CefrBand): boolean {
  if (band === 'all') return true;
  if (band === 'A1') return cefr === 'A1' || cefr === 'A2';
  if (band === 'B1') return cefr === 'B1' || cefr === 'B2';
  return cefr === 'C1' || cefr === 'C2';
}

export interface VocabFilters {
  status: 'all' | VocabStatus;
  cefr: CefrBand;
  search: string;
}

export function filterWords(items: VocabItem[], f: VocabFilters): VocabItem[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    if (f.status !== 'all' && i.status !== f.status) return false;
    if (!cefrInBand(i.cefr, f.cefr)) return false;
    if (q && !i.word.toLowerCase().includes(q) && !(i.translation ?? '').toLowerCase().includes(q))
      return false;
    return true;
  });
}

export function sortWords(items: VocabItem[], sort: VocabSort): VocabItem[] {
  const out = [...items];
  if (sort === 'alphabetical') out.sort((a, b) => a.word.localeCompare(b.word));
  else if (sort === 'most_clicked')
    out.sort((a, b) => b.lookups - a.lookups || b.lastMs - a.lastMs);
  else out.sort((a, b) => b.lastMs - a.lastMs);
  return out;
}

export function paginate<T>(
  items: T[],
  page: number,
  size = PAGE_SIZE,
): { items: T[]; total: number; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((p - 1) * size, p * size), total: items.length, totalPages, page: p };
}

/** The page buttons: the first, the last, and a window around the current page. */
export function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  const wanted = new Set(
    [1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages),
  );
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export interface VocabStats {
  total: number;
  inDeck: number;
  mastered: number;
  newThisWeek: number;
  masteryPct: number;
}

export function wordStats(items: VocabItem[], now = Date.now()): VocabStats {
  const mastered = items.filter((i) => i.status === 'mastered').length;
  return {
    total: items.length,
    inDeck: items.filter((i) => i.status !== 'new').length,
    mastered,
    newThisWeek: items.filter((i) => i.firstMs > 0 && now - i.firstMs <= WEEK_MS).length,
    masteryPct: items.length > 0 ? Math.round((mastered / items.length) * 100) : 0,
  };
}

/** Words looked up two or more times that are in no deck, most looked up first. */
export function recommendWords(items: VocabItem[]): VocabItem[] {
  return sortWords(
    items.filter((i) => i.status === 'new' && i.lookups >= 2),
    'most_clicked',
  ).slice(0, RECOMMENDATION_LIMIT);
}

/** How a selection splits: only words on this computer can be edited or deleted. */
export function splitByStore(items: VocabItem[]): { local: VocabItem[]; accountOnly: VocabItem[] } {
  return { local: items.filter((i) => i.local), accountOnly: items.filter((i) => !i.local) };
}

export function wordsToCsv(items: VocabItem[]): string {
  const rows = [
    ['word', 'language', 'translation', 'cefr', 'status', 'lookups', 'first_seen', 'last_seen'],
  ];
  for (const i of items) {
    rows.push([
      i.word,
      i.language ?? '',
      i.translation ?? '',
      i.cefr === 'unknown' ? '' : i.cefr,
      i.status,
      String(i.lookups),
      i.firstMs ? new Date(i.firstMs).toISOString().slice(0, 10) : '',
      i.lastMs ? new Date(i.lastMs).toISOString().slice(0, 10) : '',
    ]);
  }
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function wordsToJson(items: VocabItem[]): string {
  return JSON.stringify(
    items.map((i) => ({
      word: i.word,
      language: i.language,
      translation: i.translation,
      cefr: i.cefr === 'unknown' ? null : i.cefr,
      status: i.status,
      lookups: i.lookups,
      firstSeen: i.firstMs ? new Date(i.firstMs).toISOString() : null,
      lastSeen: i.lastMs ? new Date(i.lastMs).toISOString() : null,
      onThisComputer: i.local !== null,
      inAccount: i.inAccount,
    })),
    null,
    2,
  );
}
