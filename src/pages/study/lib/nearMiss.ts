/**
 * How close a WRONG typed answer came — for the feedback line only, never the grade.
 *
 * The grade stays exact: a near miss is still a miss and the card does not move.
 * But "wrong" alone tells someone who typed `cafe` for `café` the same thing it
 * tells someone who had no idea, and those two need different next steps.
 *
 *   'accent' — only accents differ (`cafe` / `café`)
 *   'typo'   — one letter added, dropped, swapped or changed
 *   null     — not close; an ordinary miss
 */
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const bare = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

export function nearMissKind(input: string, target: string): 'accent' | 'typo' | null {
  const a = normalize(input);
  const b = normalize(target);
  if (!a || a === b) return null;
  if (bare(a) === bare(b)) return 'accent';
  return withinOneEdit(bare(a), bare(b)) ? 'typo' : null;
}

/**
 * One insertion, deletion, substitution or adjacent swap apart. Not for words under
 * four letters: there one edit is usually ANOTHER real word (`au` for `eau`).
 */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || b.length < 4) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
