/**
 * The cheatsheet's search, as pure functions — the website's two layers
 * (CheatsheetSearch.tsx) and the verb index's filter (VerbIndex.tsx), plus the
 * offline stand-ins for the two server lookups (body search, conjugated form).
 *
 * LOCAL layer: title / subtitle / tags / headings of the topic list the page
 * already holds; answers on the keystroke.
 * SERVER layer: the page bodies and the conjugated forms; answers once typing
 * settles. Offline, `searchBodies` and `formsInVerbs` do the same over what is
 * stored on this computer, so the box keeps working on the pages already opened.
 */
import { foldWord } from './onDemand';
import { normalise } from './normalise';
import type { FormHit, SearchHit, Topic, TopicSummary, VerbDetail, VerbListItem } from './types';

export type Hit = {
  slug: string;
  title: string;
  subtitle?: string | null;
  section?: string;
  level?: string;
  /** The matched row — present only on body hits. */
  line?: string | null;
  heading?: string | null;
  matches?: number;
};

export const MAX_HITS = 24;

/** Searchable text of a topic summary, folded once. */
export function buildHaystack(topics: readonly TopicSummary[]) {
  return topics.map((x) => ({
    topic: x,
    text: normalise([x.title, x.subtitle ?? '', x.tags.join(' '), x.headings.join(' ')].join(' ')),
  }));
}

/** LOCAL layer. */
export function localHits(haystack: ReturnType<typeof buildHaystack>, needle: string): Hit[] {
  if (!needle) return [];
  return haystack
    .filter((h) => h.text.includes(needle))
    .map((h) => ({
      slug: h.topic.slug,
      title: h.topic.title,
      subtitle: h.topic.subtitle,
      section: h.topic.section,
      level: h.topic.level,
    }));
}

/**
 * Server (or offline body) hits replace the local ones for pages both found,
 * because they carry the matched row. A stale response — one stamped with an
 * older query — contributes nothing.
 */
export function mergeHits(remote: { q: string; hits: Hit[] }, local: Hit[], needle: string): Hit[] {
  if (!needle) return [];
  const fresh = remote.q === needle ? remote.hits : [];
  const byRemote = new Set(fresh.map((h) => h.slug));
  const merged = [...fresh];
  for (const h of local) if (!byRemote.has(h.slug)) merged.push(h);
  return merged.slice(0, MAX_HITS);
}

/** The heading a line sits under, as the server reports it. */
const HEADING = /^#{2,4}\s+(.+)$/;

/**
 * Offline stand-in for the server's full-text search: scans the stored topic
 * bodies line by line. A hit is the first matching line, its heading and how
 * many lines matched; titles weigh first, then match count.
 */
export function searchBodies(topics: readonly Topic[], q: string, limit = 30): SearchHit[] {
  const needle = normalise(q.trim());
  if (needle.length < 2) return [];
  const out: (SearchHit & { score: number })[] = [];
  for (const t of topics) {
    let heading: string | null = null;
    let first: string | null = null;
    let firstHeading: string | null = null;
    let matches = 0;
    for (const line of t.body.split('\n')) {
      const h = HEADING.exec(line);
      if (h) heading = h[1].replace(/[`*]/g, '').trim();
      if (normalise(line).includes(needle)) {
        matches++;
        if (first === null) {
          first = line;
          firstHeading = heading;
        }
      }
    }
    const inTitle = normalise(`${t.title} ${t.subtitle ?? ''}`).includes(needle);
    if (!matches && !inTitle) continue;
    out.push({
      slug: t.slug,
      title: t.title,
      subtitle: t.subtitle ?? null,
      section: t.section,
      level: t.level,
      line: first,
      heading: firstHeading,
      matches,
      score: (inTitle ? 1000 : 0) + matches,
    });
  }
  return out
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug, 'en'))
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
}

/**
 * Offline stand-in for `find-form`: which stored verb has a form equal to what
 * was typed (accent- and case-blind, with or without its pronoun).
 */
export function formsInVerbs(verbs: readonly VerbDetail[], q: string, limit = 8): FormHit[] {
  const needle = foldWord(q.trim());
  if (needle.length < 2) return [];
  const out: FormHit[] = [];
  for (const v of verbs) {
    for (const tense of v.forms ?? []) {
      for (const f of tense.forms) {
        const bare = foldWord(f.form).replace(
          /^(que |qu')?(je |j'|tu |il |elle |on |nous |vous |ils |elles )/,
          '',
        );
        if (foldWord(f.form) === needle || bare === needle) {
          out.push({
            lemma: v.lemma,
            gloss: v.gloss,
            level: v.level,
            form: f.form,
            ipa: f.ipa,
            mood: tense.mood,
            tense: tense.tense,
            pr: f.pr,
          });
          break;
        }
      }
      if (out.some((o) => o.lemma === v.lemma)) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- Result-row presentation (verbatim from the website) ----------

/** Where the query sits inside the ORIGINAL text, or -1. Offsets are trusted only when folding kept the length. */
export function highlightAt(text: string, q: string): number {
  const n = normalise(text);
  const i = n.indexOf(normalise(q));
  if (i >= 0 && n.length === text.length) return i;
  return text.toLowerCase().indexOf(q.toLowerCase());
}

/**
 * A matched line comes from the page's Markdown source: strip a quote's `>`, a
 * heading's `#`, list dashes, `**` and backticks; table cells join with a middle dot.
 */
export function plainLine(line: string) {
  return line
    .replace(/^[\s>#*-]+/, '')
    .replace(/\*\*|`/g, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/^ · | · $/g, '');
}

/** The part of a line around the match: starts a few words before it when it is late. */
export function excerpt(line: string, q: string) {
  const at = line.toLowerCase().indexOf(q.toLowerCase());
  if (at < 50) return line.slice(0, 150);
  const from = line.lastIndexOf(' ', at - 30) + 1;
  return '…' + line.slice(from, from + 150);
}

// ---------- Verb index ----------

export const PER_PAGE = 36;

export type VerbRow = VerbListItem & { extra: boolean; key: string };

/** Glossed verbs first, then every other verb by name alone. */
export function buildVerbRows(verbs: readonly VerbListItem[], more: readonly string[]): VerbRow[] {
  return [
    ...verbs.map((v) => ({ ...v, extra: false, key: normalise(`${v.lemma} ${v.gloss}`) })),
    ...more.map((lemma) => ({
      lemma,
      gloss: '',
      level: '',
      family: '',
      extra: true,
      key: normalise(lemma),
    })),
  ];
}

/** Filter-as-you-type on lemma and meaning, then the level chip. */
export function filterVerbs(
  rows: readonly VerbRow[],
  needle: string,
  level: string | null,
): VerbRow[] {
  return rows
    .filter((v) => !needle || v.key.includes(needle))
    .filter((v) => !level || v.level === level);
}

/** The levels the verbs actually have, never a fixed list. */
export function verbLevelCounts(verbs: readonly VerbListItem[]) {
  return [...new Set(verbs.map((v) => v.level).filter(Boolean))]
    .sort()
    .map((level) => ({ level, count: verbs.filter((v) => v.level === level).length }));
}

export function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / PER_PAGE));
}

export function pageSlice<T>(rows: readonly T[], page: number): T[] {
  return rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
}

/** 1 … 4 5 6 … 61 — the ends, and the pages either side of the current one. */
export function pageList(page: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) out.push(n);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/**
 * Whether the "conjugate it now" offer shows: the typed word is an infinitive,
 * the lookups have answered, and nothing in the list or the form hits IS that verb.
 */
export function offerConjugation(opts: {
  asked: string | null;
  answered: boolean;
  lemmas: readonly string[];
}): boolean {
  const { asked, answered, lemmas } = opts;
  return asked !== null && answered && !lemmas.some((l) => foldWord(l) === foldWord(asked));
}
