/**
 * Splitting plain reading text into paragraphs, sentences and words.
 *
 * PURE ON PURPOSE. This module imports nothing — no React, no `next/*`, no
 * `window`, no `document`, and deliberately no `Intl`. The React Native app
 * copies this file byte-for-byte, and Hermes ships only a partial `Intl`, so
 * `Intl.Segmenter` (the obvious tool for word boundaries) would be the single
 * thing that turns a mechanical port into a rewrite. Regex only.
 */

/**
 * Characters that can carry a word: any letter, any combining mark, any digit.
 *
 * `\p{M}` is not optional decoration — Arabic harakat and Devanagari matras are
 * separate code points, and leaving them out would split `पानी` mid-word.
 */
const WORD_START = '\\p{L}\\p{M}\\p{N}';

/**
 * Characters that continue a word once it has started.
 *
 * - `'` and `’` — `l'eau`, `don't`, `qu'il`. Both forms appear in real PDFs.
 * - `‌` (ZWNJ) — in Persian `می‌رود` is ONE word joined by a ZWNJ. Treating
 *   it as a separator would split every verb in the language in half.
 * - `-` — `well-known`, `peut-être`.
 *
 * A trailing one of these is stripped by `cleanWord` before lookup, so
 * `word-` at a line break does not query the dictionary with its hyphen.
 */
const WORD_CONTINUE = `${WORD_START}'’‌-`;

const TOKEN_RE = new RegExp(`[${WORD_START}][${WORD_CONTINUE}]*`, 'gu');

/**
 * Han characters are emitted one at a time.
 *
 * Chinese and Japanese write without spaces, so the rule above matches a whole
 * clause as a single token — `多伦多图书馆通知` came out as one "word", which
 * means one enormous untappable blob per sentence and a dictionary query that
 * can never hit. Splitting per character is what Chinese readers do: most words
 * are one or two characters, and a single character is always a real lookup.
 *
 * Kana runs are deliberately NOT split — a katakana loanword is multi-character
 * and per-character kana is meaningless.
 */
const HAN_RE = /\p{Script=Han}/u;

/**
 * Sentence terminators across the scripts we render.
 *
 * Two alternatives, because the spacing conventions differ. The CJK full-width
 * forms end a sentence on their own — Chinese does not put a space after `。`,
 * so requiring one would return a whole page as a single sentence. The Latin,
 * Arabic and Persian forms must be followed by whitespace or the end of the
 * string, which is what keeps `3.14`, `Dr. Smith` and `www.x.com` intact.
 *
 * Closing quotes and brackets right after the terminator stay with their sentence
 * (`« Ça va ? »`, `"Stop."`, `「好。」`) — on their own they would be a sentence with no
 * words, which the reader can neither mark nor read aloud.
 */
const SENTENCE_END = /[。！？]+[」』”’）)]*|[.!?؟۔]+(?:\s*[»"”’)\]]+)?(?=\s|$)/g;

/**
 * Above this, a run without terminating punctuation is broken at a space.
 *
 * The sentence is what gets sent as translation context, so an un-punctuated
 * wall of text (a table of contents, a poem, an index) would otherwise ship
 * thousands of characters as "the sentence this word came from".
 */
const MAX_SENTENCE_CHARS = 320;

export interface Token {
  text: string;
  /** false for the whitespace and punctuation between words — render as-is. */
  word: boolean;
}

/**
 * Blank-line-separated blocks. A single newline stays inside the paragraph:
 * PDF extraction emits one per visual line, and promoting those to paragraphs
 * would give a page eighty of them.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Sentences within one paragraph, punctuation kept on the sentence it ends. */
export function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let cursor = 0;

  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(paragraph)) !== null) {
    const end = match.index + match[0].length;
    const piece = paragraph.slice(cursor, end).trim();
    if (piece) out.push(piece);
    cursor = end;
  }

  const tail = paragraph.slice(cursor).trim();
  if (tail) out.push(tail);

  return out.flatMap(splitLongRun);
}

/** Break an over-long run at spaces so context stays a usable size. */
function splitLongRun(sentence: string): string[] {
  if (sentence.length <= MAX_SENTENCE_CHARS) return [sentence];

  const parts: string[] = [];
  let current = '';
  for (const chunk of sentence.split(/(\s+)/)) {
    if (current.length + chunk.length > MAX_SENTENCE_CHARS && current.trim()) {
      parts.push(current.trim());
      current = '';
    }
    current += chunk;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Emit one matched run as word tokens, splitting only its Han characters.
 *
 * Handled per run rather than per token because a token can legitimately mix
 * scripts (`iPhone手机`): splitting the whole thing per character would turn
 * `iPhone` into six unlookupable letters.
 */
function pushWord(out: Token[], text: string): void {
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ text: buffer, word: true });
    buffer = '';
  };

  for (const char of Array.from(text)) {
    if (HAN_RE.test(char)) {
      flush();
      out.push({ text: char, word: true });
    } else {
      buffer += char;
    }
  }
  flush();
}

/**
 * Split into alternating word / non-word tokens.
 *
 * Every character of the input appears in exactly one token, so joining them
 * back reproduces the source exactly — which is what lets the renderer wrap
 * only the words and leave spacing and punctuation untouched.
 */
export function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let cursor = 0;

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(input)) !== null) {
    if (match.index > cursor) {
      out.push({ text: input.slice(cursor, match.index), word: false });
    }
    pushWord(out, match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < input.length) {
    out.push({ text: input.slice(cursor), word: false });
  }

  return out;
}

/**
 * The form actually sent to the dictionary.
 *
 * Trims the joiners that are only word-internal, so `well-known` survives but
 * the dangling hyphen of a broken line, or the apostrophe in `l'eau` being
 * tapped at its edge, does not reach the lookup and miss the cache.
 */
export function cleanWord(token: string): string {
  return token.replace(/^['’‌-]+|['’‌-]+$/g, '');
}

/** Distinct words of a block of text, in first-appearance order. */
export function uniqueWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(text)) {
    if (!token.word) continue;
    const clean = cleanWord(token.text).toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}
