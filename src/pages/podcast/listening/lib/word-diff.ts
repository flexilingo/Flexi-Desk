// Word-level diff for dictation scoring — LCS alignment over normalized
// word arrays. Pure; no dependencies.

export type DiffStatus = 'match' | 'wrong' | 'missing' | 'extra';

export interface DiffChip {
  word: string; // the TARGET word (for missing/wrong) or the typed word (extra)
  typed?: string; // what the user typed in place of a wrong word
  status: DiffStatus;
}

export interface DiffResult {
  chips: DiffChip[];
  accuracy: number; // matched / max(targetLen, answerLen), 0..1
  missedWords: string[]; // target words not matched (missing + wrong)
}

function normalize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      // Letters and digits of ANY script: French accents and Persian words are words, not noise.
      .replace(/[^\p{L}\p{N}' -]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

export function diffWords(target: string, answer: string): DiffResult {
  const t = normalize(target);
  const a = normalize(answer);

  // LCS table
  const n = t.length;
  const m = a.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = t[i] === a[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Walk the alignment
  const chips: DiffChip[] = [];
  const missedWords: string[] = [];
  let matches = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (t[i] === a[j]) {
      chips.push({ word: t[i], status: 'match' });
      matches++;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      // target word skipped. If the next answer word is also unmatched, pair
      // them as a "wrong" substitution for friendlier feedback.
      if (lcs[i + 1][j + 1] === lcs[i][j] && j < m) {
        chips.push({ word: t[i], typed: a[j], status: 'wrong' });
        missedWords.push(t[i]);
        i++;
        j++;
      } else {
        chips.push({ word: t[i], status: 'missing' });
        missedWords.push(t[i]);
        i++;
      }
    } else {
      chips.push({ word: a[j], status: 'extra' });
      j++;
    }
  }
  while (i < n) {
    chips.push({ word: t[i], status: 'missing' });
    missedWords.push(t[i]);
    i++;
  }
  while (j < m) {
    chips.push({ word: a[j], status: 'extra' });
    j++;
  }

  const denom = Math.max(n, m, 1);
  return { chips, accuracy: matches / denom, missedWords };
}
