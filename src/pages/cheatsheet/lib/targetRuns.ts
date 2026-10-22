/**
 * Which parts of a mixed-script string are target-language runs — the website's
 * notebooks/utils/targetRuns.ts, condensed. A page explaining French in Persian
 * is Persian prose with Latin runs in it; only the Latin runs are French, and only
 * those are clickable and speakable. A transcription `/ak.tœʁ/` is Latin letters
 * too, so slashes mark it and it is never target text.
 */
const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿŒœ]/;
const LATIN_WORD = "[A-Za-zÀ-ÖØ-öø-ÿŒœ0-9][A-Za-zÀ-ÖØ-öø-ÿŒœ0-9'’\\-]*";
const LATIN_RUN = new RegExp(`${LATIN_WORD}(?:[ \\t]+${LATIN_WORD})*`, 'g');
const MIN_INTERACTIVE_LENGTH = 2;

export const IPA_SPAN = /\/(?![\s/])[^/\n]{0,39}[^/\n\s]\//g;

export interface Segment {
  text: string;
  target: boolean;
  ipa?: boolean;
}

export function splitTargetRuns(input: string, minLength = MIN_INTERACTIVE_LENGTH): Segment[] {
  // Transcriptions first: they are cut out whole so nothing inside them is target text.
  const pieces: Segment[] = [];
  const ipa = new RegExp(IPA_SPAN.source, 'g');
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = ipa.exec(input)) !== null) {
    if (m.index > cursor) pieces.push({ text: input.slice(cursor, m.index), target: false });
    pieces.push({ text: m[0], target: false, ipa: true });
    cursor = m.index + m[0].length;
  }
  if (cursor < input.length) pieces.push({ text: input.slice(cursor), target: false });

  const out: Segment[] = [];
  for (const piece of pieces) {
    if (piece.ipa) {
      out.push(piece);
      continue;
    }
    let at = 0;
    const re = new RegExp(LATIN_RUN.source, 'g');
    let r: RegExpExecArray | null;
    while ((r = re.exec(piece.text)) !== null) {
      if (r[0].length < minLength || !LATIN_LETTER.test(r[0])) continue;
      if (r.index > at) out.push({ text: piece.text.slice(at, r.index), target: false });
      out.push({ text: r[0], target: true });
      at = r.index + r[0].length;
    }
    if (at < piece.text.length) out.push({ text: piece.text.slice(at), target: false });
  }
  return out;
}
