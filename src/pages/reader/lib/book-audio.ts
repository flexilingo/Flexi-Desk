import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { BookEdition } from '../types';

export type { BookEdition, BookTrackEntry, BookVideo } from '../types';

/**
 * Matching a document to a published book, and its recordings to their pages.
 *
 * The books themselves live in `public.book_editions` and arrive from the
 * server — label, track count and the shape of the audio URL. Keeping them
 * there rather than in this file is what makes adding a book a row instead of
 * a deploy, and puts the URL pattern somewhere a person would think to look.
 *
 * NOTHING IS GUESSED HERE. An earlier version matched tracks to exercises by
 * counting — the nth "Écoutez" is the nth recording — and one missed
 * instruction shifted every later page by one, silently. That is gone.
 *
 * The book says where each recording belongs itself. Its "Transcriptions des
 * audios" appendix prints every track as "12 Page 16, Dans la classe": the
 * publisher's own index, not an inference. `readTrackIndex` reads that. Each
 * entry stands on its own, so a line it fails to read costs that one track its
 * page and nothing else — there is no count for a miss to throw off.
 */

/**
 * The id a book track is played under in the app's player: `book:<edition>:<track>`.
 *
 * Namespaced so it can never collide with a real episode's id, and parsed back
 * by the player bar, which has no other way to know that what it holds is
 * track 12 of Édito A1 — it needs that to fetch the track's subtitles.
 */
export function bookTrackId(editionId: string, track: number): string {
  return `book:${editionId}:${track}`;
}

export function parseBookTrackId(
  id: string | null | undefined,
): { edition: string; track: number } | null {
  const match = /^book:([^:]+):(\d+)$/.exec(id ?? '');
  return match ? { edition: match[1], track: Number(match[2]) } : null;
}

/**
 * Build one track's URL from the edition's template.
 *
 * NOTHING IS COPIED — this points at the publisher's own site, the same URL
 * their printed codes resolve to.
 */
export function trackUrl(edition: BookEdition, track: number): string {
  const folder = (edition.audio_folder_base ?? 0) + track;
  // Each level pads differently — A1 writes 02, A2 and B1 write 002 — so the
  // width is part of the template rather than a rule applied to all of them.
  return edition.audio_url_template
    .replace('{track3}', String(track).padStart(3, '0'))
    .replace('{track2}', String(track).padStart(2, '0'))
    .replace('{track}', String(track))
    .replace('{folder}', String(folder));
}

/**
 * Whether the recordings are in our own storage rather than on the publisher's
 * site. Those are private, so the server signs them (`reader?action=track-audio`)
 * and the template is never turned into a URL here.
 */
export function isHostedAudio(edition: BookEdition): boolean {
  return edition.audio_url_template.startsWith('storage://');
}

/**
 * The edition's recordings, numbered the way the publisher numbers them.
 *
 * Track 1 is track 1 even when it is the credits: the list is meant to be the
 * same list the book's own code pages serve, so that a reader holding the book
 * can find a recording by the number printed in it.
 */
export function trackNumbers(edition: BookEdition): number[] {
  return Array.from({ length: Math.max(0, edition.track_count) }, (_, index) => index + 1);
}

/** One recording, where the book's own index says it belongs. */
export interface BookTrack {
  track: number;
  /** The PDF page the exercise is on — the printed page, corrected by the book's offset. */
  page: number;
  /** "Phonie-graphie : les liaisons · Activité 1" — what the reader looks for on the page. */
  title: string;
  /** "Unité 2 Près de moi", or null before the first unit heading. */
  unit: string | null;
}

export interface TrackIndex {
  byTrack: Map<number, BookTrack>;
  byPage: Map<number, BookTrack[]>;
  /** PDF page minus printed page, read from the appendix's footers. The videos use it too. */
  offset: number;
}

/** "Page 16, Dans la classe" — the entry's own line. */
const ENTRY = /^Page\s+(\d{1,3})\s*,\s*(.*)$/;
/** The track number, printed as a badge beside the entry. */
const BARE_NUMBER = /^(\d{1,3})$/;
const UNIT = /^Unité\s+\d+\b/;
/** "… Activité 2a" / "… Exercice 5" closing a label. */
const STEP = /\b(?:Activité|Exercice)\s*\S*$/;
/** A wrapped label goes on in lower case, or straight into its step. */
const CONTINUES = /^(?:\p{Ll}|Activité\b|Exercice\b)/u;
/** Where the transcript body starts: "a." / "b." — never part of a label. */
const LIST_MARKER = /^[a-h]\.(?:\s|$)/;
const AUDIO_SECTION = /documents?\s+audios?/i;
const VIDEO_SECTION = /documents?\s+vid[ée]os?/i;
/** The appendix sits at the back; this is how far back it is looked for. */
const SEARCH_PAGES = 40;

interface Run {
  index: number;
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: string;
}

/**
 * French typesetting puts thin and non-breaking spaces before `!`, `?` and `:`
 * — and this book sets some of them as private-use glyphs of its own font.
 */
const tidy = (text: string) =>
  text
    .replace(/[\uE000-\uF8FF]/g, ' ')
    .replace(/[\s\p{Zs}]+/gu, ' ')
    .trim();

/**
 * Phonetic symbols partly come from a font with no text mapping, so [ɑ̃] arrives
 * as "[ A· ]" and [ʃ] [ʒ] as "[ S J". Shown like that they read as typos; shown
 * as […] they read as what they are — a sound the page itself will show.
 *
 * The tell is the padding: a symbol that came through, [i] or [ø], sits tight
 * against its brackets. A mangled one is spaced out, or never closes.
 */
const READABLE_SYMBOL = /^[\p{L}\p{M}ːˈˌ]+$/u;
const cleanLabel = (text: string) =>
  tidy(
    text
      .replace(/\[([^\]]*)\]/g, (whole, inner: string) =>
        READABLE_SYMBOL.test(inner) ? whole : '[…]',
      )
      .replace(/\[[^\]]*$/, '[…]'),
  )
    .replace(/\s*:?\s*voir p\.\s*\d+\.?$/i, '')
    .replace(/\s+(?:et|ou)$/, '')
    .replace(/[\s:,]+$/, '');

/**
 * The run plus whatever continues it on the same line.
 *
 * A heading is not always one run: "Unité 2" and its title are two, and a
 * phonetic symbol like [ɑ̃] is set in its own font. Only runs that TOUCH the
 * previous one are taken — the page's other column shares the baseline.
 */
function withRestOfLine(runs: Run[], run: Run): string {
  const parts = [run.str];
  let end = run.x + run.width;
  for (const next of runs) {
    if (next.index <= run.index || Math.abs(next.y - run.y) > 3) continue;
    if (next.x < end - 1 || next.x > end + run.height * 2) continue;
    parts.push(next.str);
    end = next.x + next.width;
  }
  return tidy(parts.join(' '));
}

async function readRuns(pdf: PDFDocumentProxy, pageNumber: number): Promise<Run[]> {
  const page = await pdf.getPage(pageNumber);
  const { items } = await page.getTextContent();
  const runs: Run[] = [];
  items.forEach((item, index) => {
    if (!('str' in item) || !item.str.trim()) return;
    runs.push({
      index,
      str: tidy(item.str),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
      font: item.fontName,
    });
  });
  return runs;
}

/**
 * Read the book's printed track index: which recording belongs on which page.
 *
 * WHY POSITION, NOT READING ORDER. The badge carrying the track number is not
 * where the text flows — pdf.js hands it over at the END of the page, long
 * after its entry. What ties the two together is where they sit: the badge is
 * on the entry's baseline, a little to its left. So each "Page N, …" line is
 * paired with the bare number beside it, and nothing depends on order.
 *
 * Returns null when the book has no such appendix. The panel then lists the
 * recordings by number, which is still true, rather than a map that is not.
 */
export async function readTrackIndex(
  pdf: PDFDocumentProxy,
  edition: BookEdition,
): Promise<TrackIndex | null> {
  // The walk back and the read forward cross the same pages; read each once.
  const cache = new Map<number, Promise<Run[]>>();
  const runsOf = (n: number) => {
    if (!cache.has(n)) cache.set(n, readRuns(pdf, n));
    return cache.get(n)!;
  };

  // Walk back from the end: the audio appendix is followed by the video one.
  let first: number | null = null;
  let last: number | null = null;
  for (let n = pdf.numPages; n > Math.max(0, pdf.numPages - SEARCH_PAGES); n--) {
    const text = (await runsOf(n)).map((run) => run.str).join(' ');
    if (last === null && VIDEO_SECTION.test(text)) last = n;
    if (AUDIO_SECTION.test(text)) {
      first = n;
      break;
    }
  }
  if (first === null) return null;

  const found: BookTrack[] = [];
  // printed page → PDF page. Read from the appendix's own footers, so a book
  // whose PDF carries a cover or front matter still lands on the right sheet.
  const offsets: number[] = [];
  let unit: string | null = null;

  for (let n = first; n <= (last ?? pdf.numPages); n++) {
    const runs = await runsOf(n);
    const videoStart = runs.find((run) => VIDEO_SECTION.test(run.str));

    const footer = runs.find((run) => BARE_NUMBER.test(run.str) && run.y < 60);
    if (footer) offsets.push(n - Number(footer.str));

    for (const run of runs) {
      if (videoStart && run.index > videoStart.index) break;

      if (UNIT.test(run.str)) {
        unit = withRestOfLine(runs, run);
        continue;
      }

      if (!ENTRY.test(run.str)) continue;
      const entry = ENTRY.exec(withRestOfLine(runs, run));
      if (!entry) continue;
      const badge = runs.find(
        (other) =>
          BARE_NUMBER.test(other.str) &&
          Math.abs(other.y - run.y) < 3 &&
          run.x - other.x > 5 &&
          run.x - other.x < 45,
      );
      if (!badge) continue;
      const track = Number(badge.str);
      if (track < 1 || track > edition.track_count) continue;

      // A long label wraps onto the next line, in the entry's own font.
      let label = entry[2];
      let lineY = run.y;
      for (const next of runs) {
        if (next.index <= run.index) continue;
        // The rest of a line already taken — this one's, or the other column's.
        if (Math.abs(next.y - lineY) < 3) continue;
        if (STEP.test(label) || ENTRY.test(next.str)) break;
        if (LIST_MARKER.test(next.str) || !CONTINUES.test(next.str)) break;
        if (next.font !== run.font || Math.abs(next.x - run.x) > 2) break;
        if (next.y > lineY || lineY - next.y > run.height * 1.8) break;
        label += ` ${withRestOfLine(runs, next)}`;
        lineY = next.y;
      }
      found.push({ track, page: Number(entry[1]), title: cleanLabel(label), unit });
    }
  }
  if (found.length === 0) return null;

  const offset = mostCommon(offsets) ?? 0;
  found.sort((a, b) => a.track - b.track);

  const byTrack = new Map<number, BookTrack>();
  const byPage = new Map<number, BookTrack[]>();
  let previous: (BookTrack & { section: string | null }) | null = null;
  let lastPage = 0;

  for (const item of found) {
    const page = item.page + offset;
    // The book runs front to back and so does its track list. An entry that
    // goes backwards was misread, and is left out rather than shown.
    if (byTrack.has(item.track) || page < lastPage || page < 1 || page > pdf.numPages) continue;
    lastPage = page;

    // "Activité 2" on its own belongs to the section the entry before it on
    // the same page named — the book prints the heading once.
    const step = STEP.exec(item.title)?.[0] ?? null;
    const own = cleanLabel(item.title.replace(STEP, '')) || null;
    // Annotated because it is read back from `previous`, which is built from it.
    const section: string | null =
      own ?? (previous && previous.page === page ? previous.section : null);
    const title = section && step ? `${section} · ${step}` : (section ?? item.title);

    const track: BookTrack = { track: item.track, page, title, unit: item.unit };
    byTrack.set(track.track, track);
    byPage.set(page, [...(byPage.get(page) ?? []), track]);
    previous = { ...track, section };
  }

  return byTrack.size > 0 ? { byTrack, byPage, offset } : null;
}

/**
 * The track index from the list the server holds for this book, for a copy
 * whose own index `readTrackIndex` cannot read. The same shape, so the panel
 * cannot tell where it came from.
 *
 * Printed pages become PDF pages with the edition's `page_offset`; an entry
 * that lands outside this PDF is left out, like a misread one.
 */
export function indexFromList(edition: BookEdition, numPages: number): TrackIndex | null {
  const offset = edition.page_offset ?? 0;
  const byTrack = new Map<number, BookTrack>();
  const byPage = new Map<number, BookTrack[]>();
  for (const entry of edition.tracks ?? []) {
    if (entry.printed_page === null || entry.track > edition.track_count) continue;
    const page = entry.printed_page + offset;
    if (page < 1 || page > numPages) continue;
    const track: BookTrack = { track: entry.track, page, title: entry.title, unit: entry.unit };
    byTrack.set(track.track, track);
    byPage.set(page, [...(byPage.get(page) ?? []), track]);
  }
  return byTrack.size > 0 ? { byTrack, byPage, offset } : null;
}

function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | null = null;
  for (const [value, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}
