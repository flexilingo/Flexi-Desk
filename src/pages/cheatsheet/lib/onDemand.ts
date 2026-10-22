/**
 * The infinitive inside what a reader typed, or null if there is none.
 *
 * "Conjugation googler", "conjugaison du verbe googler", "صرف فعل googler" —
 * the words around the verb only say what the reader wants done with it. The
 * same lists as the backend's `verbPart` (functions/cheatsheet/handlers/
 * find-form.ts), so the button is offered exactly when the backend will accept
 * the word's shape.
 */
const ASKING =
  /^(conjugation|conjugations|conjugate|conjugaison|conjugaisons|conjuguer|صرف|تصريف)$/i;
const FILLER = /^(de|du|of|the|verb|verbs|verbe|verbes|french|français|francais|فعل|الفعل)$/i;
const INFINITIVE = /^[a-zàâäçéèêëîïôöùûüÿœæ][a-zàâäçéèêëîïôöùûüÿœæ'-]{1,38}(er|ir|ïr|re)$/;

export function infinitiveIn(q: string): string | null {
  const words = q.trim().split(/\s+/).filter(Boolean);
  const asking = words.some((w) => ASKING.test(w));
  const rest = asking
    ? words.filter((w) => !ASKING.test(w) && !FILLER.test(w)).map((w) => w.replace(/^d['’]/i, ''))
    : words;
  const word = (rest.length ? rest : words)
    .join(' ')
    .normalize('NFC')
    .toLowerCase()
    .replace(/’/g, "'");
  return INFINITIVE.test(word) ? word : null;
}

/** Accent- and case-blind, for "is this the verb that was typed". */
export const foldWord = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
