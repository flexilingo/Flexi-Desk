import { describe, expect, it } from 'vitest';
import {
  allTags,
  buildVideoUrl,
  filterNotes,
  formatTime,
  fromAccount,
  fromLocal,
  groupNotes,
  isOpenableUrl,
  notesToCsv,
  notesToJson,
  notesToMarkdown,
  notesToPrintHtml,
  parseStamp,
  planDelete,
  sortGroups,
  videoSourceKey,
  withTag,
  type AccountNoteRow,
  type ExportLabels,
  type LocalNoteRow,
  type NoteFilters,
} from '@/pages/notes/notesLogic';

const podcast = (over: Partial<LocalNoteRow> = {}): LocalNoteRow => ({
  id: 'b1', source: 'podcast', source_id: 'e1', source_title: 'Episode One', source_kind: null, position_ms: 12000,
  page: null, label: 'Idiom', note: 'a note', excerpt: null, tags: ['verbs'], created_at: '2026-10-01 10:00:00', updated_at: '2026-10-01 10:00:00', ...over,
});
const reader = (over: Partial<LocalNoteRow> = {}): LocalNoteRow => ({
  id: 'n1', source: 'reader', source_id: 'd1', source_title: 'Le Petit Prince', source_kind: 'pdf', position_ms: null,
  page: 3, label: null, note: 'reader body', excerpt: 'les mots cités', tags: [], created_at: '2026-10-03T09:00:00.000Z', updated_at: '2026-10-03T09:00:00.000Z', ...over,
});
const cloud = (over: Partial<AccountNoteRow> = {}): AccountNoteRow => ({
  id: 'c1', videoId: 'abc', videoUrl: 'https://www.youtube.com/watch?v=abc', timestampSeconds: 65, label: null, note: 'cloud note',
  subtitleText: 'Hello there', translation: 'Bonjour', tags: ['b2'], videoTitle: 'A video', isFavorite: true, createdAt: '2026-10-02T08:00:00.000Z', ...over,
});

const labels: ExportLabels = {
  title: 'My notes', exported: 'Exported', tags: 'Tags', pageLabel: (n) => `Page ${n}`,
  headers: { source: 'Source', where: 'Where', position: 'Position', text: 'Text', translation: 'Translation', note: 'Note', tags: 'Tags', date: 'Date' },
  whereDevice: 'This computer', whereAccount: 'Your account',
};
const noFilter: NoteFilters = { query: '', tags: [], origin: 'all', favoritesOnly: false };

describe('notes: one list from two places', () => {
  it('keeps the place of every note and never lets keys collide across places', () => {
    const a = fromLocal(podcast({ id: 'same' }));
    const b = fromLocal(reader({ id: 'same' }));
    const c = fromAccount(cloud({ id: 'same' }));
    expect(new Set([a.key, b.key, c.key]).size).toBe(3);
    expect([a.origin, b.origin, c.origin]).toEqual(['device', 'device', 'account']);
    expect(a.seconds).toBe(12);
    expect(b.page).toBe(3);
    expect(c.excerpt).toBe('Hello there');
    expect(c.favorite).toBe(true);
  });

  it('reads SQLite timestamps as UTC', () => {
    expect(parseStamp('2026-10-01 10:00:00')).toBe(Date.UTC(2026, 9, 1, 10, 0, 0));
    expect(parseStamp('2026-10-03T09:00:00.000Z')).toBe(Date.UTC(2026, 9, 3, 9, 0, 0));
    expect(parseStamp('nonsense')).toBe(0);
  });

  it('groups per source and orders each group by second, or by page', () => {
    const notes = [
      fromLocal(podcast({ id: 'b2', position_ms: 90000 })),
      fromLocal(podcast({ id: 'b1', position_ms: 12000 })),
      fromLocal(reader({ id: 'n2', page: 9 })),
      fromLocal(reader({ id: 'n1', page: 2 })),
      fromAccount(cloud()),
    ];
    const groups = groupNotes(notes);
    expect(groups).toHaveLength(3);
    expect(groups.find((g) => g.source === 'podcast')!.notes.map((n) => n.id)).toEqual(['b1', 'b2']);
    expect(groups.find((g) => g.source === 'reader')!.notes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });
});

describe('notes: filter, tags, sort', () => {
  const notes = [fromLocal(podcast()), fromLocal(reader()), fromAccount(cloud())];

  it('searches the text, translation, note and label', () => {
    const ids = (q: string) => filterNotes(notes, { ...noFilter, query: q }).map((n) => n.id);
    expect(ids('bonjour')).toEqual(['c1']);
    expect(ids('READER BODY')).toEqual(['n1']);
    expect(ids('idiom')).toEqual(['b1']);
    expect(ids('cités')).toEqual(['n1']);
    expect(ids('zzz')).toEqual([]);
  });

  it('filters by tag, by place and by favourites', () => {
    expect(filterNotes(notes, { ...noFilter, tags: ['verbs'] }).map((n) => n.id)).toEqual(['b1']);
    expect(filterNotes(notes, { ...noFilter, tags: ['verbs', 'b2'] }).map((n) => n.id).sort()).toEqual(['b1', 'c1']);
    expect(filterNotes(notes, { ...noFilter, origin: 'account' }).map((n) => n.id)).toEqual(['c1']);
    expect(filterNotes(notes, { ...noFilter, origin: 'device' })).toHaveLength(2);
    expect(filterNotes(notes, { ...noFilter, favoritesOnly: true }).map((n) => n.id)).toEqual(['c1']);
    expect(allTags(notes)).toEqual(['b2', 'verbs']);
  });

  it('adds a tag once, in lower case', () => {
    expect(withTag(['a'], ' B ')).toEqual(['a', 'b']);
    expect(withTag(['a'], 'a')).toBeNull();
    expect(withTag([], '  ')).toBeNull();
  });

  it('sorts groups newest, oldest or by source name', () => {
    const groups = groupNotes(notes);
    const title = (g: { title: string | null }) => g.title ?? '';
    const names = (s: 'newest' | 'oldest' | 'source') => sortGroups(groups, s, title).map((g) => g.title);
    expect(names('newest')).toEqual(['Le Petit Prince', 'A video', 'Episode One']);
    expect(names('oldest')).toEqual(['Episode One', 'A video', 'Le Petit Prince']);
    expect(names('source')).toEqual(['A video', 'Episode One', 'Le Petit Prince']);
  });
});

describe('notes: delete routing', () => {
  it('sends every note only to the store it lives in, even when ids collide', () => {
    const notes = [fromLocal(podcast({ id: 'x' })), fromLocal(reader({ id: 'x' })), fromAccount(cloud({ id: 'x' })), fromAccount(cloud({ id: 'y' }))];
    expect(planDelete(notes)).toEqual({
      device: [{ source: 'podcast', id: 'x' }, { source: 'reader', id: 'x' }],
      account: ['x', 'y'],
    });
    expect(planDelete([])).toEqual({ device: [], account: [] });
  });
});

describe('notes: source addresses', () => {
  it('names the site and builds the address at the second', () => {
    expect(videoSourceKey('https://youtu.be/abc')).toBe('youtube');
    expect(videoSourceKey('https://www.bbc.com/x')).toBe('bbc');
    expect(videoSourceKey('https://example.com')).toBe('video');
    expect(videoSourceKey('not a url')).toBe('video');
    expect(buildVideoUrl('https://www.youtube.com/watch?v=abc', 'abc', 65.9)).toBe('https://www.youtube.com/watch?v=abc&t=65');
    expect(buildVideoUrl('https://www.youtube.com/watch?v=abc', 'abc')).toBe('https://www.youtube.com/watch?v=abc');
    expect(buildVideoUrl('https://www.bbc.com/x', 'p0123')).toBe('https://www.bbc.com/audio/play/p0123');
    expect(buildVideoUrl('https://netflix.com/watch/1', 'n1', 30)).toBe('https://netflix.com/watch/1');
  });

  it('only opens web addresses in the system browser', () => {
    expect(isOpenableUrl('https://x.com/a')).toBe(true);
    expect(isOpenableUrl('file:///etc/passwd')).toBe(false);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('')).toBe(false);
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(-3)).toBe('0:00');
  });
});

describe('notes: export', () => {
  const groups = groupNotes([fromLocal(podcast({ note: 'say "hi"' })), fromLocal(reader()), fromAccount(cloud())]);
  const title = (g: { title: string | null }) => g.title ?? '';

  it('writes Markdown with the place of every source', () => {
    const md = notesToMarkdown(groups, title, labels, '2026-10-21');
    expect(md).toContain('# My notes');
    expect(md).toContain('## Episode One (This computer)');
    expect(md).toContain('## A video (Your account)');
    expect(md).toContain('### 0:12');
    expect(md).toContain('### Page 3');
    expect(md).toContain('> Hello there');
    expect(md).toContain('Tags: verbs');
  });

  it('writes CSV with one row per note and quotes escaped', () => {
    const csv = notesToCsv(groups, title, labels);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('"Source","Where","Position","Text","Translation","Note","Tags","Date"');
    expect(csv).toContain('"Idiom - say ""hi"""');
    expect(csv).toContain('"A video","Your account","1:05","Hello there","Bonjour","cloud note","b2","2026-10-02"');
  });

  it('writes JSON that says where each source is stored', () => {
    const json = JSON.parse(notesToJson(groups, title)) as { source: string; storedOn: string; notes: { page: number | null; seconds: number | null }[] }[];
    expect(json.map((g) => g.storedOn).sort()).toEqual(['account', 'this-computer', 'this-computer']);
    expect(json.find((g) => g.source === 'Le Petit Prince')!.notes[0].page).toBe(3);
    expect(json.find((g) => g.source === 'A video')!.notes[0].seconds).toBe(65);
  });

  it('escapes the printable page', () => {
    const grp = groupNotes([fromLocal(podcast({ note: '<script>alert(1)</script>' }))]);
    const html = notesToPrintHtml(grp, title, labels, 'today', 'rtl');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html.match(/<script>/g)).toHaveLength(1); // only the print trigger
  });
});
