import { cleanWord, tokenize } from '@/components/lookup/tokenize';
import { groupLines, isWordBrokenAcross } from './line-context';

/**
 * Splitting a page's text runs into words — across run boundaries.
 *
 * THE PROBLEM THIS SOLVES. A pdf.js "run" is not a word. Producers routinely
 * break one mid-word, most often at a ligature: `indéfinis` arrives as three
 * runs, `indé` + `fi` + `nis`, because `fi` is a single glyph drawn from a
 * different slot. Tokenising each run on its own therefore produced three
 * "words", so the reader saw a third of a word highlight under the cursor and
 * looking it up asked the dictionary for `fi`. The same split hits `af fi che`,
 * `fl ashez`, `véri fi ez` — it is the normal case in a typeset book, not an
 * edge case.
 *
 * So the line is the unit: the runs on one baseline are joined, tokenised as a
 * whole, and each word is then cut back up along the run boundaries it crosses.
 * The pieces keep their own run's position — which is what keeps the layer
 * aligned — while every piece carries the WHOLE word and a shared group id, so
 * a click anywhere in `indéfinis` looks up `indéfinis` and hovering lights all
 * three pieces at once.
 *
 * THE MIRROR PROBLEM. Joining blindly glues words that the PDF separates with
 * a gap instead of a space character — `définis le` came out as one word
 * `définisle`, which no dictionary has. There is no clue in the text for this;
 * the only evidence is geometry, so the runs' laid-out boxes are measured and a
 * visible gap is treated as the space the producer never wrote. The inserted
 * space is used for TOKENISING ONLY and never reaches the DOM: the text layer
 * has to stay character-for-character what pdf.js drew, or selection and glyph
 * positions drift away from the page underneath.
 *
 * ACROSS A LINE BREAK. A typeset book hyphenates: `pen-` ends one line and
 * `etrating` opens the next. Both halves then look up the whole word
 * (`isWordBrokenAcross` decides when). They keep separate groups on purpose —
 * a group is one rectangle to the highlighter and the selection snapper, and
 * one rectangle over two lines would cover everything between them.
 */

/**
 * A run's laid-out box, in CSS pixels.
 *
 * `height` stands in for the font size — the layer sets `line-height: 1` — and
 * is what the gap below is measured against, so a 7pt footnote and a 40pt
 * heading each get a threshold in their own terms.
 */
export interface RunMetrics {
  left: number;
  right: number;
  height: number;
}

/** A gap wider than this share of the font size reads as a word break. */
const GAP_RATIO = 0.22;

export interface RunSegment {
  /** Exactly the characters of this run that the segment covers. */
  text: string;
  /** The complete word the segment belongs to, cleaned for lookup. Null for spacing and punctuation. */
  word: string | null;
  /** Shared by every segment of one word, including across runs. Null when `word` is. */
  group: number | null;
}

/** Is there a visible gap between two adjacent runs on a line? */
function isSeparated(before: RunMetrics | undefined, after: RunMetrics | undefined): boolean {
  if (!before || !after) return false;
  // Measured both ways so right-to-left text, where the next run sits to the
  // LEFT of the previous one, is not reported as one enormous gap.
  const gap = Math.max(after.left - before.right, before.left - after.right);
  const fontSize = Math.max(before.height, after.height);
  return fontSize > 0 && gap > fontSize * GAP_RATIO;
}

/**
 * Per-run segments, index-aligned with `strings`.
 *
 * @param strings pdf.js' `textContentItemsStr`.
 * @param tops    each run's `parseFloat(style.top)`, index-aligned.
 * @param metrics each run's laid-out box, index-aligned. Omitted, runs are
 *                joined with nothing, which is right whenever the producer
 *                emits its spaces as runs of their own (most do).
 */
export function segmentRuns(
  strings: string[],
  tops: number[],
  metrics?: RunMetrics[],
): RunSegment[][] {
  const out: RunSegment[][] = strings.map(() => []);
  let nextGroup = 0;
  // The last word of the line before, in case this line finishes it.
  let previous: { line: string; head: string; pieces: RunSegment[] } | null = null;

  for (const { start, end } of groupLines(tops)) {
    const runs = strings.slice(start, end + 1).map((s) => s ?? '');
    if (!runs.some(Boolean)) continue;

    // Build the line and remember where each run sits inside it. A synthetic
    // space lands BETWEEN two runs' ranges, so it belongs to neither and is
    // dropped again when the words are cut back up.
    const bounds: Array<[number, number]> = [];
    let lineText = '';
    for (let i = 0; i < runs.length; i += 1) {
      const needsSpace =
        i > 0 &&
        !/\s$/.test(lineText) &&
        !/^\s/.test(runs[i]) &&
        isSeparated(metrics?.[start + i - 1], metrics?.[start + i]);
      if (needsSpace) lineText += ' ';

      bounds.push([lineText.length, lineText.length + runs[i].length]);
      lineText += runs[i];
    }

    const carried = previous && isWordBrokenAcross(previous.line, lineText) ? previous : null;
    let first = true;
    let last: { head: string; pieces: RunSegment[] } | null = null;

    // `tokenize` emits every character exactly once, in order, so a running
    // cursor gives each token its offsets without re-searching the string.
    let cursor = 0;
    for (const token of tokenize(lineText)) {
      const from = cursor;
      const to = cursor + token.text.length;
      cursor = to;

      const word = token.word ? cleanWord(token.text) : '';
      const group = word ? nextGroup++ : null;
      const pieces: RunSegment[] = [];

      for (let i = 0; i < runs.length; i += 1) {
        const [runFrom, runTo] = bounds[i];
        const sliceFrom = Math.max(from, runFrom);
        const sliceTo = Math.min(to, runTo);
        if (sliceTo <= sliceFrom) continue;
        const piece: RunSegment = {
          text: lineText.slice(sliceFrom, sliceTo),
          word: word || null,
          group,
        };
        out[start + i].push(piece);
        pieces.push(piece);
      }

      if (!word) continue;
      if (first && carried) {
        const whole = carried.head + word;
        for (const piece of [...carried.pieces, ...pieces]) piece.word = whole;
      }
      first = false;
      last = { head: word, pieces };
    }

    // A line with no word in it (a rule, a lone dash) ends the chance of a
    // continuation; one with no text at all is passed over.
    if (last) previous = { line: lineText, ...last };
    else if (lineText.trim()) previous = null;
  }

  return out;
}
