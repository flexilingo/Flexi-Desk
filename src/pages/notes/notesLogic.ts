/**
 * The Notes page's rules, free of React and of Tauri: turning the two places a note can
 * live (this computer, the account) into one list, and filtering, sorting, grouping,
 * exporting and routing deletes on it. Ported from the website's notes helpers.
 */

/** Where a note is stored. A delete or an edit always goes to exactly this place. */
export type NoteOrigin = 'device' | 'account';
export type NoteSource = 'podcast' | 'reader' | 'cloud';
export type SortOption = 'newest' | 'oldest' | 'source';
export type OriginFilter = 'all' | NoteOrigin;

/** The shapes the two stores return. */
export interface LocalNoteRow {
  id: string;
  source: 'podcast' | 'reader';
  source_id: string;
  source_title: string | null;
  source_kind: string | null;
  position_ms: number | null;
  page: number | null;
  label: string | null;
  note: string | null;
  excerpt: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface AccountNoteRow {
  id: string;
  videoId: string;
  videoUrl: string;
  timestampSeconds: number;
  label?: string | null;
  note?: string | null;
  subtitleText?: string | null;
  translation?: string | null;
  tags?: string[] | null;
  videoTitle?: string | null;
  isFavorite?: boolean;
  createdAt: string;
}

export interface UnifiedNote {
  /** Unique across both places: `device:podcast:ID`, `account:cloud:ID`. */
  key: string;
  id: string;
  origin: NoteOrigin;
  source: NoteSource;
  /** The group this note belongs to: one episode, one document, one video. */
  groupKey: string;
  sourceId: string;
  sourceTitle: string | null;
  /** Account notes: which site the video is on (youtube, netflix...). Reader notes: pdf, image, text. */
  sourceKind: string;
  videoUrl?: string;
  seconds: number | null;
  page: number | null;
  label: string | null;
  note: string | null;
  excerpt: string | null;
  translation: string | null;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  createdMs: number;
}

export interface NoteGroup {
  key: string;
  origin: NoteOrigin;
  source: NoteSource;
  sourceId: string;
  sourceKind: string;
  title: string | null;
  videoUrl?: string;
  notes: UnifiedNote[];
}

/** SQLite stamps `YYYY-MM-DD HH:MM:SS` in UTC with no zone; read it as UTC. */
export function parseStamp(value: string): number {
  const plain = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
  const ms = new Date(plain ? `${value.replace(' ', 'T')}Z` : value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export function videoSourceKey(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('netflix.com')) return 'netflix';
    if (host.includes('bbc.com')) return 'bbc';
    if (host.includes('cbc.ca')) return 'cbc';
    if (host.includes('spotify.com')) return 'spotify';
    if (host.includes('soundcloud.com')) return 'soundcloud';
    return 'video';
  } catch {
    return 'video';
  }
}

/** The address that opens an account note's video, at the second when the site supports it. */
export function buildVideoUrl(videoUrl: string, videoId: string, timestamp?: number): string {
  try {
    const host = new URL(videoUrl).hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const u = new URL(`https://www.youtube.com/watch?v=${videoId}`);
      if (timestamp) u.searchParams.set('t', Math.floor(timestamp).toString());
      return u.toString();
    }
    if (host.includes('bbc.com')) return `https://www.bbc.com/audio/play/${videoId}`;
    return videoUrl;
  } catch {
    return videoUrl;
  }
}

/** Only http(s) addresses are ever handed to the system browser. */
export function isOpenableUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === 'https:' || p === 'http:';
  } catch {
    return false;
  }
}

export function fromLocal(row: LocalNoteRow): UnifiedNote {
  return {
    key: `device:${row.source}:${row.id}`,
    id: row.id,
    origin: 'device',
    source: row.source,
    groupKey: `device:${row.source}:${row.source_id}`,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceKind: row.source === 'reader' ? (row.source_kind ?? 'pdf') : 'podcast',
    seconds: row.position_ms == null ? null : row.position_ms / 1000,
    page: row.page,
    label: row.label || null,
    note: row.note || null,
    excerpt: row.excerpt || null,
    translation: null,
    tags: row.tags ?? [],
    favorite: false,
    createdAt: row.created_at,
    createdMs: parseStamp(row.created_at),
  };
}

export function fromAccount(row: AccountNoteRow): UnifiedNote {
  return {
    key: `account:cloud:${row.id}`,
    id: row.id,
    origin: 'account',
    source: 'cloud',
    groupKey: `account:cloud:${row.videoId || row.videoUrl}`,
    sourceId: row.videoId,
    sourceTitle: row.videoTitle || null,
    sourceKind: videoSourceKey(row.videoUrl),
    videoUrl: row.videoUrl,
    seconds: row.timestampSeconds,
    page: null,
    label: row.label || null,
    note: row.note || null,
    excerpt: row.subtitleText || null,
    translation: row.translation || null,
    tags: row.tags ?? [],
    favorite: !!row.isFavorite,
    createdAt: row.createdAt,
    createdMs: parseStamp(row.createdAt),
  };
}

/** Where a note sits inside its group: by second (podcast, video) or by page (reader). */
function order(n: UnifiedNote): number {
  return n.page != null ? n.page : (n.seconds ?? 0);
}

export function groupNotes(notes: UnifiedNote[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const n of notes) {
    let g = groups.get(n.groupKey);
    if (!g) {
      g = {
        key: n.groupKey,
        origin: n.origin,
        source: n.source,
        sourceId: n.sourceId,
        sourceKind: n.sourceKind,
        title: n.sourceTitle,
        videoUrl: n.videoUrl,
        notes: [],
      };
      groups.set(n.groupKey, g);
    }
    g.notes.push(n);
  }
  for (const g of groups.values()) {
    g.notes.sort((a, b) => order(a) - order(b) || a.createdMs - b.createdMs);
  }
  return [...groups.values()];
}

export function allTags(notes: UnifiedNote[]): string[] {
  const set = new Set<string>();
  for (const n of notes) for (const t of n.tags) set.add(t);
  return [...set].sort();
}

export interface NoteFilters {
  query: string;
  tags: string[];
  origin: OriginFilter;
  favoritesOnly: boolean;
}

export function filterNotes(notes: UnifiedNote[], f: NoteFilters): UnifiedNote[] {
  const q = f.query.trim().toLowerCase();
  return notes.filter((n) => {
    if (f.origin !== 'all' && n.origin !== f.origin) return false;
    if (f.favoritesOnly && !n.favorite) return false;
    if (f.tags.length > 0 && !n.tags.some((t) => f.tags.includes(t))) return false;
    if (q) {
      const hay = [n.excerpt, n.translation, n.note, n.label];
      if (!hay.some((s) => s?.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

/** `labelOf` turns a group into the name it is sorted and exported under. */
export function sortGroups(
  groups: NoteGroup[],
  sort: SortOption,
  labelOf: (g: NoteGroup) => string,
): NoteGroup[] {
  const newest = (g: NoteGroup) => Math.max(...g.notes.map((n) => n.createdMs));
  const oldest = (g: NoteGroup) => Math.min(...g.notes.map((n) => n.createdMs));
  const out = [...groups];
  if (sort === 'newest') out.sort((a, b) => newest(b) - newest(a));
  else if (sort === 'oldest') out.sort((a, b) => oldest(a) - oldest(b));
  else out.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  return out;
}

/** Add `tag` to a note's tags, or null when it already has it. */
export function withTag(tags: string[], tag: string): string[] | null {
  const t = tag.trim().toLowerCase();
  if (!t || tags.includes(t)) return null;
  return [...tags, t];
}

// ── Delete routing ───────────────────────────────────────────────────────────

export interface DeletePlan {
  /** Notes on this computer, each named with its own store. */
  device: { source: 'podcast' | 'reader'; id: string }[];
  /** Ids in the account. */
  account: string[];
}

/** Split a selection by where each note lives, so no delete can reach the wrong place. */
export function planDelete(notes: UnifiedNote[]): DeletePlan {
  const plan: DeletePlan = { device: [], account: [] };
  for (const n of notes) {
    if (n.origin === 'account') plan.account.push(n.id);
    else plan.device.push({ source: n.source as 'podcast' | 'reader', id: n.id });
  }
  return plan;
}

// ── Export ───────────────────────────────────────────────────────────────────

export interface ExportLabels {
  /** Heading of the document. */
  title: string;
  exported: string;
  tags: string;
  /** "Page 3" in the page's language. */
  pageLabel: (n: number) => string;
  headers: {
    source: string;
    where: string;
    position: string;
    text: string;
    translation: string;
    note: string;
    tags: string;
    date: string;
  };
  whereDevice: string;
  whereAccount: string;
}

function position(n: UnifiedNote, labels: ExportLabels): string {
  if (n.page != null) return labels.pageLabel(n.page);
  return n.seconds != null ? formatTime(n.seconds) : '';
}

function whereOf(g: NoteGroup, labels: ExportLabels): string {
  return g.origin === 'device' ? labels.whereDevice : labels.whereAccount;
}

export function notesToMarkdown(
  groups: NoteGroup[],
  titleOf: (g: NoteGroup) => string,
  labels: ExportLabels,
  date: string,
): string {
  const lines: string[] = [`# ${labels.title}`, `${labels.exported}: ${date}\n`];
  for (const g of groups) {
    lines.push(`## ${titleOf(g)} (${whereOf(g, labels)})\n`);
    for (const n of g.notes) {
      lines.push(`### ${position(n, labels)}\n`);
      if (n.label) lines.push(`**${n.label}**\n`);
      if (n.excerpt) lines.push(`> ${n.excerpt}`);
      if (n.translation) lines.push(`> ${n.translation}`);
      if (n.note) lines.push(`\n*${n.note}*`);
      if (n.tags.length > 0) lines.push(`\n${labels.tags}: ${n.tags.join(', ')}`);
      lines.push('\n---\n');
    }
  }
  return lines.join('\n');
}

export function notesToCsv(
  groups: NoteGroup[],
  titleOf: (g: NoteGroup) => string,
  labels: ExportLabels,
): string {
  const h = labels.headers;
  const rows: string[][] = [
    [h.source, h.where, h.position, h.text, h.translation, h.note, h.tags, h.date],
  ];
  for (const g of groups) {
    for (const n of g.notes) {
      rows.push([
        titleOf(g),
        whereOf(g, labels),
        position(n, labels),
        n.excerpt ?? '',
        n.translation ?? '',
        [n.label, n.note].filter(Boolean).join(' - '),
        n.tags.join('; '),
        new Date(n.createdMs).toISOString().slice(0, 10),
      ]);
    }
  }
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function notesToJson(groups: NoteGroup[], titleOf: (g: NoteGroup) => string): string {
  return JSON.stringify(
    groups.map((g) => ({
      source: titleOf(g),
      storedOn: g.origin === 'device' ? 'this-computer' : 'account',
      kind: g.sourceKind,
      url: g.videoUrl ?? null,
      notes: g.notes.map((n) => ({
        position: n.page != null ? null : n.seconds != null ? formatTime(n.seconds) : null,
        seconds: n.seconds,
        page: n.page,
        label: n.label,
        text: n.excerpt,
        translation: n.translation,
        note: n.note,
        tags: n.tags,
        date: new Date(n.createdMs).toISOString(),
      })),
    })),
    null,
    2,
  );
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A printable page; it prints itself when opened. */
export function notesToPrintHtml(
  groups: NoteGroup[],
  titleOf: (g: NoteGroup) => string,
  labels: ExportLabels,
  date: string,
  dir: 'ltr' | 'rtl',
): string {
  const body = groups
    .map(
      (g) =>
        `<h2>${esc(titleOf(g))} <small>${esc(whereOf(g, labels))}</small></h2>${g.notes
          .map(
            (n) =>
              `<div class="note"><div class="pos">${esc(position(n, labels))}${n.label ? ` &middot; ${esc(n.label)}` : ''}</div>${
                n.excerpt ? `<div class="text" dir="auto">${esc(n.excerpt)}</div>` : ''
              }${n.translation ? `<div class="tr" dir="auto">${esc(n.translation)}</div>` : ''}${
                n.note ? `<div class="mine" dir="auto">${esc(n.note)}</div>` : ''
              }${n.tags.length > 0 ? `<div class="tags">${esc(n.tags.join(', '))}</div>` : ''}</div>`,
          )
          .join('')}`,
    )
    .join('');
  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><title>${esc(labels.title)}</title><style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1a140c}
h1{color:#0e240a;border-bottom:2px solid #c56a3f;padding-bottom:.5rem}h2{color:#0e240a;margin-top:2rem}h2 small{font-size:.7rem;color:#9a8c78;font-weight:400}
.note{border-inline-start:3px solid #c56a3f;padding:.75rem 1rem;margin:1rem 0;background:#fbf7ee;break-inside:avoid}
.pos{font-weight:600;color:#c56a3f;font-size:.9rem}.tr{color:#5a4a38;font-size:.9rem}.mine{color:#ad5832;font-style:italic;margin-top:.5rem}.tags{color:#9a8c78;font-size:.8rem;margin-top:.25rem}
@media print{body{padding:0}}</style></head><body><h1>${esc(labels.title)}</h1><p>${esc(labels.exported)}: ${esc(date)}</p>${body}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}
