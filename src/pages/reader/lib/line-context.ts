/**
 * Reconstructing "the sentence this word came from" out of a PDF text layer.
 *
 * The word dialog translates far better with context, and on ordinary reading
 * text `TappableText` hands it the real sentence. A PDF has no sentences: it has
 * positioned runs, and a run is as likely to be three characters of a ligature
 * as a whole clause. What it does have is geometry, so the line is
 * reconstructed from it — runs that share a baseline are the same line.
 *
 * Works off the percentages pdf.js writes into `style.top`, which are already
 * resolution- and zoom-independent, so nothing here has to be recomputed when
 * the reader zooms.
 */

/**
 * How far two runs' baselines may differ and still count as one line, in
 * percent of page height. A body line is roughly 1.5% of a page tall, so this
 * absorbs subscripts and per-run rounding without swallowing the line below.
 */
const LINE_TOLERANCE = 0.6;

/** Matches `MAX_SENTENCE_CHARS` in the shared tokenizer. */
const MAX_CONTEXT_CHARS = 320;

/** Under this, the line is a heading or a column and needs the next one too. */
const SHORT_LINE_CHARS = 40;

/**
 * A line that stops in the middle of a word: a letter, then a hyphen. `-` and
 * `‐` are what a typesetter prints; a soft hyphen (U+00AD) is what some
 * producers leave in the text when the break was made automatically.
 */
const BROKEN_END = /\p{L}[-‐­]\s*$/u;

/** The line that finishes a broken word opens on a lower-case letter. */
const CONTINUED_START = /^\s*\p{Ll}/u;

/** An inclusive run range sharing one baseline. */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * Does `above` end on half a word that `below` finishes?
 *
 * A typeset book breaks long words at the end of a line — `a rain so pen-` /
 * `etrating, that…`. Read a line at a time that is two words, and the first
 * half is often a real word with the wrong meaning: the reader tapped
 * "penetrating" and was told what "pen" means. The lower-case rule keeps a dash
 * before a name, a list marker or a page number from being glued on.
 */
export function isWordBrokenAcross(above: string, below: string): boolean {
  return BROKEN_END.test(above) && CONTINUED_START.test(below);
}

/**
 * Cut the page's runs into visual lines.
 *
 * Exported because it is the unit TWO things need and they must agree on it:
 * the context builder below, and `segmentRuns`, which has to join a line back
 * together before it can find the words a ligature split across runs. Two
 * private notions of "line" would drift, and the symptom — a word whose halves
 * disagree about what they are — is invisible until someone clicks it.
 *
 * Each run is compared against the baseline that OPENED its line rather than
 * against its neighbour, so a long line cannot drift a whole line-height
 * downward one small step at a time.
 */
export function groupLines(tops: number[]): LineRange[] {
  const lines: LineRange[] = [];

  for (let i = 0; i < tops.length; i += 1) {
    const open = lines.at(-1);
    const baseline = open ? tops[open.start] : Number.NaN;
    const sameLine =
      open !== undefined &&
      Number.isFinite(baseline) &&
      Number.isFinite(tops[i]) &&
      Math.abs(tops[i] - baseline) <= LINE_TOLERANCE;

    if (sameLine) open.end = i;
    else lines.push({ start: i, end: i });
  }

  return lines;
}

/** The text of one line, exactly as its runs carry it. */
function lineText(line: LineRange, strings: string[]): string {
  return strings.slice(line.start, line.end + 1).join('');
}

/** The nearest line from `from` in direction `step` that has any text. */
function neighbour(lines: LineRange[], from: number, step: 1 | -1, strings: string[]): number {
  for (let i = from + step; i >= 0 && i < lines.length; i += step) {
    if (lineText(lines[i], strings).trim()) return i;
  }
  return -1;
}

/**
 * Put a word broken over a line break back together, in a copy of the runs.
 *
 * The hyphen goes, and the first run of the line below is pulled up onto the
 * end of the line above, so the join reads `penetrating` whether or not the
 * producer separates its runs with spaces. Only the context string is built
 * from this copy; the text layer itself is never touched.
 */
function mend(parts: string[], above: LineRange, below: LineRange): void {
  let tail = above.end;
  while (tail > above.start && !parts[tail].trim()) parts[tail--] = '';
  let head = below.start;
  while (head < below.end && !parts[head].trim()) parts[head++] = '';

  parts[tail] = parts[tail].replace(/[-‐­]\s*$/u, '') + parts[head].trimStart();
  parts[head] = '';
}

/**
 * Join runs back into readable text.
 *
 * Most producers emit the spaces as runs of their own, so plain concatenation
 * is right. A minority emit one run per word and no spaces at all, which
 * concatenation would turn into `Thequickbrown` — hence the fallback. Checking
 * the concatenation for a space distinguishes the two without having to reason
 * about horizontal gaps.
 */
function join(parts: string[]): string {
  const glued = parts.join('');
  const text = parts.length < 2 || glued.includes(' ') ? glued : parts.join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Grow outward from the clicked run until the budget is spent.
 *
 * Centred rather than truncated from the left, because on a long line — a table
 * row, a table of contents — a left-anchored cut is most likely to drop the very
 * word being looked up, which is the one piece of the context that must survive.
 */
function windowedJoin(strings: string[], start: number, end: number, index: number): string {
  let low = index;
  let high = index;
  let length = strings[index]?.length ?? 0;

  while (low > start || high < end) {
    const takeLow = low > start && (high >= end || index - low <= high - index);
    const next = takeLow ? low - 1 : high + 1;
    const cost = strings[next]?.length ?? 0;
    if (length + cost > MAX_CONTEXT_CHARS) break;
    length += cost;
    if (takeLow) low = next;
    else high = next;
  }

  return join(strings.slice(low, high + 1));
}

/**
 * Context for the run at `index`: its line, plus the line below when its own is
 * too short to mean anything on its own. A word broken over a line break brings
 * the other line along, mended, so the context holds the word that was looked up.
 *
 * @param tops  `parseFloat(style.top)` per run, index-aligned with `strings`.
 */
export function buildLineContext(index: number, tops: number[], strings: string[]): string {
  if (index < 0 || index >= strings.length) return '';

  const lines = groupLines(tops);
  const at = lines.findIndex((line) => index >= line.start && index <= line.end);
  if (at < 0) return windowedJoin(strings, index, index, index);

  const own = lineText(lines[at], strings);
  const before = neighbour(lines, at, -1, strings);
  const after = neighbour(lines, at, 1, strings);
  const brokenAbove = before >= 0 && isWordBrokenAcross(lineText(lines[before], strings), own);
  const brokenBelow = after >= 0 && isWordBrokenAcross(own, lineText(lines[after], strings));

  // Below first: when a one-run line is broken at both ends, mending above
  // first would empty that run and leave the second hyphen nowhere to find.
  const parts = strings.slice();
  if (brokenBelow) mend(parts, lines[at], lines[after]);
  if (brokenAbove) mend(parts, lines[before], lines[at]);

  const start = brokenAbove ? lines[before].start : lines[at].start;
  let end = brokenBelow ? lines[after].end : lines[at].end;
  if (
    !brokenBelow &&
    join(parts.slice(start, end + 1)).length < SHORT_LINE_CHARS &&
    end + 1 < strings.length
  ) {
    end = (lines[at + 1] ?? lines[at]).end;
  }

  return windowedJoin(parts, start, end, index);
}
