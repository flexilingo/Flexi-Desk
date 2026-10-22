/**
 * Where one word runs into the next, marked in the transcription.
 *
 * The IPA in the bank already pronounces liaisons — «Les enfants» is
 * `/lez ɑ̃.fɑ̃/`, not `/le ɑ̃.fɑ̃/` — but it says so only by attaching the
 * consonant to the word before it, which is invisible to a learner reading a
 * line of symbols. The consonant looks like it belongs to «les», and nothing
 * shows that the two words are said as one.
 *
 * So the space between them becomes a tie: `/lez‿ɑ̃.fɑ̃/`.
 *
 * Found from the spelling, not guessed from the sounds. A French word ending
 * in s, x, z, t, d or n normally drops that letter, and hearing it again
 * before a vowel is exactly what a liaison is; a word ending in r or c (avec
 * elle, bonjour à tous) pronounces its consonant anyway, so linking those
 * would teach a rule that is not there. The mark says "these are said
 * together", which is true of every case it fires on — the analysis panel is
 * where the phenomenon is named.
 */

/** Liaison letters, and the sound each one comes back as. */
const LIAISON: { letters: string; sound: string }[] = [
  { letters: 'sxz', sound: 'z' },
  { letters: 'td', sound: 't' },
  { letters: 'n', sound: 'n' },
];

/** Enough of the French vowel inventory to recognise a group that opens on one. */
const VOWELS = 'aɑɛeəiɔoœøuyɑ̃ɛ̃ɔ̃œ̃';

export const LIAISON_TIE = '‿';

/** A transcription group, and whether it runs into the one after it. */
export type IpaGroup = { ipa: string; tied: boolean };

/** Words, without the punctuation that would hide a final letter. */
function words(text: string): string[] {
  return text
    .replace(/[.,!?;:«»"“”()…]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * One stretch of transcription against the words it transcribes.
 *
 * Positional, and the whole stretch is left alone when the counts disagree —
 * which they do when the IPA fuses words («tout le temps» → `tul.tɑ̃`). A tie
 * in the wrong place teaches the wrong thing; no tie is what the page showed
 * before this existed.
 */
function tieGroups(groups: string[], ws: string[]): IpaGroup[] {
  if (groups.length < 2 || groups.length !== ws.length) {
    return groups.map((g) => ({ ipa: g, tied: false }));
  }
  return groups.map((g, i) => {
    const next = groups[i + 1];
    if (!next) return { ipa: g, tied: false };
    const last = ws[i]
      .toLowerCase()
      .replace(/[^a-zà-ÿ]/g, '')
      .slice(-1);
    const rule = LIAISON.find((r) => r.letters.includes(last));
    const tied = Boolean(rule) && g.endsWith(rule!.sound) && VOWELS.includes(next[0]);
    return { ipa: g, tied };
  });
}

/**
 * The transcription, split at the points where it may be tied.
 *
 * Some rows transcribe a two-part sentence in two stretches separated by «·»
 * («Tes amis ? Je les attends…»). Those are aligned part by part; run together
 * they never match the word count and the whole sentence would lose its ties.
 */
export function ipaGroups(text: string, ipa: string | null): IpaGroup[] {
  if (!ipa) return [];
  const inner = ipa.trim().replace(/\//g, '').trim();
  if (!inner) return [];

  const parts = inner
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean);
  const clauses = text
    .split(/[.!?…]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (parts.length > 1 && parts.length === clauses.length) {
    const out: IpaGroup[] = [];
    parts.forEach((part, i) => {
      if (i > 0) out.push({ ipa: '·', tied: false });
      out.push(...tieGroups(part.split(/\s+/).filter(Boolean), words(clauses[i])));
    });
    return out;
  }

  return tieGroups(inner.split(/\s+/).filter(Boolean), words(text));
}

/** The transcription as one string, ties included — for anywhere plain text is needed. */
export function ipaWithTies(text: string, ipa: string | null): string {
  const groups = ipaGroups(text, ipa);
  if (groups.length === 0) return '';
  return groups
    .map((g, i) => (i === 0 ? g.ipa : (groups[i - 1].tied ? LIAISON_TIE : ' ') + g.ipa))
    .join('');
}

/** Whether this sentence has anything to tie — the legend is shown only then. */
export function hasLiaison(text: string, ipa: string | null): boolean {
  return ipaGroups(text, ipa).some((g) => g.tied);
}
