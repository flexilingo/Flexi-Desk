/**
 * Strip punctuation from a transcript token, keeping letters and digits in ANY
 * script plus in-word apostrophes (English contractions, French elisions).
 *
 * Replaces the old `/[^a-z']/g`, which silently destroyed every non-ASCII word —
 * "était" became "tait", "سلام" became "" — so French and Persian transcripts
 * could never get CEFR chips.
 */
export function cleanWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’]/gu, '')
    .replace(/^['’]+|['’]+$/g, '');
}

/**
 * Cache key for the CEFR word cache. The bare word is not enough: "chat" is an A1
 * word in English and a different-frequency word in French, and the cache is
 * module-level, so it outlives episode switches.
 */
export function cefrCacheKey(lang: string, word: string): string {
  return `${lang}:${word}`;
}

/**
 * Languages the LOCAL difficulty analyzer has a frequency table for.
 * Mirrors `FREQ_DATA` in `src-tauri/src/podcast/nlp.rs` — update both together.
 * Chinese is absent on purpose: the tokenizer cannot segment unspaced text, and
 * wrong numbers are worse than "unavailable".
 */
const CEFR_SUPPORTED = new Set(['en', 'ar', 'de', 'es', 'fa', 'fr', 'hi', 'ru', 'tr']);

export function cefrSupported(lang: string): boolean {
  const base = lang.split(/[-_]/)[0].toLowerCase();
  if (!base || base === 'auto') return true; // resolves to English backend-side
  return CEFR_SUPPORTED.has(base);
}
