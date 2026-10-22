/**
 * Shape and taxonomy of the cheatsheet — ported from the website's
 * features/cheatsheet/types.ts, plus the API response shapes the website keeps in
 * its service module.
 */

export const CHEATSHEET_LANGS = ['fr'] as const;
export type CheatsheetLang = (typeof CHEATSHEET_LANGS)[number];

/** Top level of the sidebar. Titles come from the `cheatsheet` messages, so
 *  the taxonomy reads in whatever language the page is explained in. */
export const SECTIONS = [
  { id: 'grammaire' },
  { id: 'verbes' },
  { id: 'vocabulaire' },
  { id: 'communication' },
  { id: 'examen' },
] as const;

/** Second level. A topic whose category is missing here lands in `autre`. */
export const CATEGORIES = [
  { id: 'prononciation', section: 'grammaire' },
  { id: 'nom', section: 'grammaire' },
  { id: 'pronom', section: 'grammaire' },
  { id: 'adjectif', section: 'grammaire' },
  { id: 'verbe', section: 'grammaire' },
  { id: 'phrase', section: 'grammaire' },
  { id: 'question', section: 'grammaire' },
  { id: 'negation', section: 'grammaire' },
  { id: 'preposition', section: 'grammaire' },
  { id: 'nombre', section: 'grammaire' },
  { id: 'vocabulaire', section: 'vocabulaire' },
  { id: 'communication', section: 'communication' },
  { id: 'examen', section: 'examen' },
  { id: 'autre', section: 'grammaire' },
] as const;

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];

export type Topic = {
  slug: string;
  title: string;
  subtitle?: string;
  section: string;
  category: string;
  order: number;
  level: string;
  tags: string[];
  related: string[];
  body: string;
};

export type TopicSummary = Omit<Topic, 'body'> & { headings: string[] };

export type SidebarSection = {
  id: string;
  categories: { id: string; topics: TopicSummary[] }[];
};

/**
 * Sidebar: section -> category -> topics, from the topic list alone.
 *
 * Built in the app rather than by the backend because the ORDER of sections
 * and categories is a presentation decision that belongs with the labels,
 * which live in this app's messages.
 *
 * Built where it is drawn (CheatsheetBrowser) rather than handed over as a
 * prop: the browser already receives the topic list, and the tree is the same
 * topics again in another shape — ~115 KB more of every cheatsheet page's
 * payload. Slugs compare in a fixed locale so the server and every browser
 * order ties the same way (hydration).
 */
export function buildSidebarTree(topics: readonly TopicSummary[]): SidebarSection[] {
  return SECTIONS.map((section) => ({
    id: section.id,
    categories: CATEGORIES.filter((c) => c.section === section.id)
      .map((c) => ({
        id: c.id,
        topics: topics
          .filter((t) => t.section === section.id && t.category === c.id)
          .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug, 'en')),
      }))
      .filter((c) => c.topics.length > 0),
  })).filter((s) => s.categories.length > 0);
}

/**
 * Reading direction of the language the page EXPLAINS in.
 *
 * Every cheatsheet surface used to be `dir="rtl"` outright, which was true
 * while Persian was the only translation and became wrong the moment there was
 * a second: the English page rendered right-aligned, with the search
 * placeholder reading "?What are you looking for".
 */
export const dirFor = (locale: string): 'rtl' | 'ltr' =>
  locale === 'fa' || locale === 'ar' || locale === 'he' || locale === 'ur' ? 'rtl' : 'ltr';

/**
 * A count in the reader's digits. Persian text runs in Persian digits, and a
 * count beside it in Latin ones reads as a bug; every cheatsheet count goes
 * through this so no page is the odd one out.
 */
export const formatCount = (n: number, locale: string) =>
  n.toLocaleString(locale === 'fa' ? 'fa-IR' : locale);

/**
 * Whether the explain locale is written in the same script as the language
 * being taught.
 *
 * When it is, nothing about a word's SHAPE says which language it belongs to,
 * so the renderer cannot guess — and guessed wrong, putting a play button on
 * every English word of an English page. Only what the author marked with
 * backticks can be trusted there.
 */
const LATIN = new Set(['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'vi', 'tr', 'pl', 'ro']);

/**
 * The explain locale a reader gets until their own is written.
 *
 * A locale with no translation used to show a "being produced" box with a
 * request button — a dead end for the reader who landed there. English is the
 * one version most of them can read, so they get that instead, in their own
 * UI chrome, until the translation is published.
 */
export const FALLBACK_EXPLAIN_LOCALE = 'en';
export const sameScript = (lang: string, locale: string) => LATIN.has(lang) && LATIN.has(locale);

/**
 * Topic titles are written "subject — the hook" ("Noun gender — read the ending").
 * Split, the subject can lead and the hook can sit under it in a quieter voice;
 * a title without the dash is all subject.
 */
export const splitTitle = (title: string): { lead: string; tail: string } => {
  const at = title.indexOf(' — ');
  return at > 0
    ? { lead: title.slice(0, at), tail: title.slice(at + 3) }
    : { lead: title, tail: '' };
};

// ---------- API shapes (the website's service.ts) ----------

export type IndexResponse = { count: number; topics: TopicSummary[]; updated_at: string };
export type TopicResponse = { topic: Topic };
export type CoverageRow = { lang: string; locale: string; translated: number; total: number };
export type CheatsheetStats = { topics: number; verbs: number; examples: number };

export type VerbListItem = { lemma: string; gloss: string; level: string; family: string };
export type VerbForm = { pr: string; form: string; ipa: string };
export type VerbTense = { mood: string; tense: string; forms: VerbForm[] };
export type VerbDetail = VerbListItem & {
  /** IPA of the infinitive itself. Null until the schema that carries it ships. */
  ipa: string | null;
  predicted: boolean;
  forms: VerbTense[];
  /** "mood|tense|pronoun" -> meaning, in the explain locale. */
  form_glosses: Record<string, string>;
  /** What the verb takes, as language-neutral keys: 'direct', 'prep:à'. */
  complement: string[];
  complement_note: string | null;
  examples: { fr: string; ipa?: string; gloss?: string }[];
  collocations: { fr: string; ipa?: string; gloss?: string }[];
  tips: string[];
};

export type SearchHit = {
  slug: string;
  title: string;
  subtitle: string | null;
  section: string;
  level: string;
  line: string | null;
  heading: string | null;
  matches: number;
};

/** A conjugated form the reader met in a sentence, traced back to its verb. */
export type FormHit = {
  lemma: string;
  gloss: string;
  level: string;
  form: string;
  ipa: string;
  mood: string;
  tense: string;
  pr: string;
};
