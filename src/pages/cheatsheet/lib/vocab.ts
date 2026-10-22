/**
 * Pulls flashcard-shaped rows out of a topic's Markdown tables.
 *
 * A vocabulary page is written for a reader, not for a machine: its tables mix
 * word lists with grammar tables, register notes and pronunciation columns. So
 * the extractor is deliberately CONSERVATIVE — it only takes a table when the
 * header row names both a target-language column and a meaning column. A table
 * it does not understand produces nothing rather than producing junk cards,
 * because a deck with three broken cards in it is worse than a missing button.
 *
 * Pure: no `fs`, no React. The page reads the file, this turns the body into
 * cards, and a client component sends them to the deck API.
 */
import type { Topic } from './types';

export type VocabCard = {
  /** The target-language side — what the learner is being tested on. */
  front: string;
  /** The meaning, in the explain locale. */
  back: string;
  /** IPA, the feminine form, the register — whatever the table also carried. */
  notes?: string;
};

export type VocabGroup = {
  /** The nearest heading above the table, so a deck can be built per section. */
  heading: string;
  cards: VocabCard[];
};

/** Headers whose column holds the target language. */
const FRONT = new Set([
  // The page's own language headers: Persian (the original), English, French, Arabic.
  'French',
  'Français',
  'Francais',
  'Word',
  'Verb',
  'Phrase',
  'Expression',
  'Masculine',
  'Adjective',
  'Noun',
  'Le mot',
  'Mot',
  'Verbe',
  'Expression française',
  'الفرنسية',
  'كلمة',
  'فعل',
  'عبارة',
  'فرانسه',
  'فعل',
  'عبارت',
  'مذکر',
  'مذکر مفرد',
  'مخفف',
  'کوتاه',
  'صفت',
  'اسم',
  'کلمه',
  'واحد',
  'کسر',
  'شماره',
  'روزهای هفته',
]);

/** Headers whose column holds the meaning. */
const BACK = new Set([
  'معنی',
  'فارسی',
  'یعنی',
  'مفهوم',
  'English',
  'Meaning',
  'Anglais',
  'Sens',
  'Signification',
  'Traduction',
  'Translation',
  'المعنى',
  'العربية',
  'الإنجليزية',
]);

/**
 * Headers worth keeping on the back of the card but never as the answer.
 * `تلفظ` is the most valuable of these — a card without its pronunciation
 * teaches the spelling and not the word.
 */
const EXTRA: Record<string, string> = {
  تلفظ: '',
  Pronunciation: '',
  Prononciation: '',
  النطق: '',
  مؤنث: 'مؤنث',
  ثبت: 'ثبت',
  سطح: 'سطح',
  شدت: 'شدت',
  کامل: 'کامل',
  'حرف اضافه': 'حرف اضافه',
  فروشنده: 'فروشنده',
};

/** Markdown decoration is for the page, not for the card. */
function clean(cell: string): string {
  return (
    cell
      // A break separates two alternatives; dropping the tag would weld them
      // into one nonsense word (`bonjour<br>salut` -> `bonjoursalut`).
      .replace(/<br\s*\/?>/gi, ' · ')
      .replace(/\\\|/g, '|')
      .replace(/`/g, '')
      .replace(/\*\*/g, '')
      .replace(/~~/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** An unescaped column delimiter — `\|` inside a cell is a literal pipe. */
const PIPE = /(?<!\\)\|/;

function splitRow(line: string): string[] {
  // GFM lets a row omit the leading and/or trailing pipe, so both are stripped
  // only when present rather than assumed.
  const s = line.trim();
  return s
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(PIPE)
    .map((c) => c.trim());
}

/**
 * The `---|---` line under a header.
 *
 * Matched structurally instead of by shape: it must hold as many cells as the
 * header and every cell must be dashes. A looser pattern would swallow a
 * thematic break (`---`) or an ordinary sentence that happens to contain a
 * pipe, and the rows after it would be read as vocabulary.
 */
function isDelimiterRow(line: string, columns: number): boolean {
  if (!PIPE.test(line)) return false;
  const cells = splitRow(line);
  return cells.length === columns && cells.every((c) => /^:?-+:?$/.test(c));
}

const HEADING = /^(#{2,4})\s+(.+)$/;

/**
 * A row is a card only if both sides survived cleaning and the front actually
 * looks like target-language material. `—` and `❌`-marked rows are teaching
 * devices, not vocabulary.
 */
function usable(front: string, back: string): boolean {
  if (!front || !back) return false;
  if (front === '—' || back === '—') return false;
  // A marker anywhere in the row means the row is teaching what NOT to say.
  // Checking only the front let a wrong form through whenever the mark sat in
  // the meaning column instead.
  if (/[❌✅]/.test(front) || /[❌✅]/.test(back)) return false;
  // Needs at least one Latin letter; a Persian-only cell is not the front.
  return /[A-Za-zÀ-ÖØ-öø-ÿŒœ]/.test(front);
}

export function extractVocab(body: string): VocabGroup[] {
  const lines = body.split('\n');
  const groups: VocabGroup[] = [];
  let heading = '';
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = HEADING.exec(line);
    if (h) {
      heading = clean(h[2]);
      continue;
    }

    // A table starts at any line with a delimiter, followed by a matching
    // dash row. Requiring a leading pipe would silently skip whole tables that
    // render perfectly well without one.
    if (!PIPE.test(line)) continue;
    const rawHeaders = splitRow(line);
    if (!isDelimiterRow(lines[i + 1] ?? '', rawHeaders.length)) continue;

    const headers = rawHeaders.map(clean);
    const frontCol = headers.findIndex((x) => FRONT.has(x));
    const backCol = headers.findIndex((x) => BACK.has(x));
    if (frontCol === -1 || backCol === -1) continue;

    const extras = headers
      .map((x, col) => ({ col, label: EXTRA[x] }))
      .filter((x) => x.label !== undefined && x.col !== frontCol && x.col !== backCol);

    const cards: VocabCard[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j];
      if (!PIPE.test(row)) break;
      const cells = splitRow(row).map(clean);
      const front = cells[frontCol] ?? '';
      const back = cells[backCol] ?? '';
      if (!usable(front, back)) continue;

      const notes = extras
        .map(({ col, label }) => {
          const v = cells[col];
          if (!v || v === '—') return '';
          return label ? `${label}: ${v}` : v;
        })
        .filter(Boolean)
        .join('\n');

      cards.push(notes ? { front, back, notes } : { front, back });
    }

    if (cards.length) groups.push({ heading, cards });
  }

  return groups;
}

/** Every card on the page, de-duplicated on the front — tables overlap. */
export function vocabCards(topic: Topic): VocabCard[] {
  const seen = new Set<string>();
  const out: VocabCard[] = [];
  for (const group of extractVocab(topic.body)) {
    for (const card of group.cards) {
      const key = card.front.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(card);
    }
  }
  return out;
}
