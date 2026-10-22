/**
 * A small Markdown reader for cheatsheet page bodies.
 *
 * The website renders them with react-markdown + remark-gfm + rehype plugins; the
 * desk app carries none of those and the pages use a narrow dialect, so this is a
 * dependency-free parser for exactly it: `##`/`###` headings, paragraphs,
 * blockquotes (nested, with lazy continuation), GFM tables (cells may hold
 * `<br>`), bullet and numbered lists (nested), fenced code, rules, and inline
 * `**bold**` `*italic*` `~~strike~~` `` `code` `` `[link](url)` `<br>` `<mark>`.
 *
 * Pure: it returns a tree. `sectionise` then cuts the tree at each `##`, the way
 * the website's rehypeReference does, so a page reads as separate parts that the
 * section bar and the "on this page" list can jump between.
 */

export type Inline =
  | { k: 'text'; text: string }
  | { k: 'code'; text: string }
  | { k: 'br' }
  | { k: 'strong' | 'em' | 'del' | 'mark'; children: Inline[] }
  | { k: 'link'; href: string; children: Inline[] };

export type Block =
  | { k: 'heading'; level: number; text: string }
  | { k: 'p'; text: string }
  | { k: 'quote'; blocks: Block[] }
  | { k: 'table'; head: string[]; rows: string[][] }
  | { k: 'list'; ordered: boolean; items: { text: string; children: Block[] }[] }
  | { k: 'code'; text: string }
  | { k: 'hr' };

export type Section = { id: string; title: string; blocks: Block[] };

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?/;
const PIPE = /(?<!\\)\|/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(PIPE)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

function isDelimiter(line: string | undefined, columns: number): boolean {
  if (!line || !PIPE.test(line)) return false;
  const cells = splitRow(line);
  return cells.length === columns && cells.every((c) => /^:?-+:?$/.test(c));
}

const startsTable = (lines: string[], i: number) =>
  PIPE.test(lines[i]) && isDelimiter(lines[i + 1], splitRow(lines[i]).length);

/** A line that opens a block of its own, and so ends a paragraph or a lazy quote. */
const startsBlock = (lines: string[], i: number) =>
  FENCE.test(lines[i]) ||
  HEADING.test(lines[i]) ||
  HR.test(lines[i]) ||
  LIST.test(lines[i]) ||
  startsTable(lines, i);

export function parseBlocks(source: string): Block[] {
  return blocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ k: 'code', text: body.join('\n') });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      out.push({ k: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    if (startsTable(lines, i)) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && PIPE.test(lines[i]))
        rows.push(splitRow(lines[i++]));
      out.push({ k: 'table', head, rows });
      continue;
    }

    if (HR.test(line)) {
      out.push({ k: 'hr' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        if (QUOTE.test(lines[i])) inner.push(lines[i].replace(QUOTE, ''));
        // Lazy continuation: a plain line right under a quoted paragraph line is still the quote.
        else if (
          lines[i].trim() &&
          inner.length &&
          inner[inner.length - 1].trim() &&
          !startsBlock(lines, i)
        )
          inner.push(lines[i]);
        else break;
        i++;
      }
      out.push({ k: 'quote', blocks: blocks(inner) });
      continue;
    }

    const li = LIST.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const base = li[1].length;
      const items: { text: string; children: Block[] }[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        const text: string[] = [m[3]];
        const nested: string[] = [];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            // A blank line belongs to the item only if indented content follows.
            if (
              i + 1 < lines.length &&
              /^\s{2,}\S/.test(lines[i + 1]) &&
              (LIST.exec(lines[i + 1])?.[1].length ?? 99) > base
            ) {
              nested.push('');
              i++;
              continue;
            }
            break;
          }
          const nm = LIST.exec(next);
          if (nm && nm[1].length <= base) break;
          if (/^\s+\S/.test(next) && (nm || nested.length)) {
            nested.push(next.slice(Math.min(next.length - next.trimStart().length, base + 2)));
          } else if (/^\s+\S/.test(next)) {
            text.push(next.trim());
          } else if (!startsBlock(lines, i) && !QUOTE.test(next)) {
            text.push(next.trim());
          } else break;
          i++;
        }
        items.push({ text: text.join('\n'), children: blocks(nested) });
      }
      out.push({ k: 'list', ordered, items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !(para.length && (startsBlock(lines, i) || QUOTE.test(lines[i])))
    ) {
      para.push(lines[i++]);
    }
    out.push({ k: 'p', text: para.join('\n') });
  }
  return out;
}

// ---------- Inline ----------

const MARKS: [string, 'strong' | 'em' | 'del'][] = [
  ['**', 'strong'],
  ['~~', 'del'],
  ['*', 'em'],
];

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ k: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === '\\' && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!|~<>]/.test(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ k: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (c === '<') {
      const br = /^<br\s*\/?>/i.exec(src.slice(i));
      if (br) {
        flush();
        out.push({ k: 'br' });
        i += br[0].length;
        continue;
      }
      const mark = /^<mark>([\s\S]*?)<\/mark>/i.exec(src.slice(i));
      if (mark) {
        flush();
        out.push({ k: 'mark', children: parseInline(mark[1]) });
        i += mark[0].length;
        continue;
      }
      const tag = /^<\/?[a-zA-Z][^>\n]*>/.exec(src.slice(i));
      if (tag) {
        // Any other tag is dropped; its text stays.
        i += tag[0].length;
        continue;
      }
    }

    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (m) {
        flush();
        out.push({ k: 'link', href: m[2], children: parseInline(m[1]) });
        i += m[0].length;
        continue;
      }
    }

    let matched = false;
    for (const [delim, kind] of MARKS) {
      if (!src.startsWith(delim, i)) continue;
      const after = src[i + delim.length];
      if (after === undefined || /\s/.test(after)) continue;
      // The closer: the next delimiter not preceded by whitespace (and, for `*`, not part of `**`).
      let from = i + delim.length;
      let end = -1;
      while ((from = src.indexOf(delim, from)) !== -1) {
        const before = src[from - 1];
        const next = src[from + delim.length];
        const isDouble = delim === '*' && next === '*';
        if (before && !/\s/.test(before) && !isDouble) {
          end = from;
          break;
        }
        from += isDouble ? 2 : delim.length;
      }
      if (end > i + delim.length) {
        flush();
        out.push({ k: kind, children: parseInline(src.slice(i + delim.length, end)) });
        i = end + delim.length;
        matched = true;
      }
      break;
    }
    if (matched) continue;

    text += c;
    i++;
  }
  flush();
  return out;
}

/** The plain text of an inline tree. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.k === 'text' || n.k === 'code' ? n.text : n.k === 'br' ? ' ' : inlineText(n.children),
    )
    .join('');
}

// ---------- Sections ----------

/** A URL fragment from a heading — letters of any script survive. */
export function slugify(text: string, taken: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[`*_~]/g, '')
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'part';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * Cuts the page at each `##` heading into a part; what comes before the first
 * heading is returned as `lead`.
 */
export function sectionise(all: Block[]): { lead: Block[]; sections: Section[] } {
  const lead: Block[] = [];
  const sections: Section[] = [];
  const taken = new Set<string>();
  for (const b of all) {
    if (b.k === 'heading' && b.level === 2) {
      const title = inlineText(parseInline(b.text));
      sections.push({ id: slugify(title, taken), title, blocks: [] });
    } else if (sections.length) sections[sections.length - 1].blocks.push(b);
    else lead.push(b);
  }
  return { lead, sections };
}
