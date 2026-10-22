/**
 * The sentence bank's shapes — the website's `features/sentence-practice/types.ts`,
 * plus the answers of the desktop-facing `sentences-app` function.
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];

/** The languages the bank is written for. */
export const PRACTICE_LANGS = ['fr', 'en'] as const;

export type Direction = 'recognize' | 'produce' | 'listen' | 'answer';
export const DIRECTIONS: Direction[] = ['recognize', 'produce', 'listen', 'answer'];

export type AnswerModel = {
  text: string;
  pattern: string;
  polarity?: string;
  register?: string;
  rule_keys?: string[];
  meaning: string;
  note: string | null;
};

export type Token = {
  surface: string;
  pos: string;
  role: string;
  is_chunk?: boolean;
  lemma?: string;
  features?: Record<string, string>;
  rule_keys?: string[];
  contrast?: string[];
  conjugation?: {
    infinitive: string;
    family: 'group-1-er' | 'group-2-ir' | 'group-3-irregular';
    stem?: string;
    ending?: string;
    mood: string;
    tense?: string;
    person?: string;
    agrees_with?: string;
    auxiliary?: 'avoir' | 'être';
    participle?: string;
    note_key?: string;
  };
  agreement?: {
    base: string;
    gender?: 'm' | 'f';
    number?: 'sg' | 'pl';
    because?: string;
    change?: string;
    audible?: boolean;
  };
};

export type Mechanic = {
  type: string;
  from: string;
  to: string;
  trigger?: string;
  rule_keys?: string[];
};

export type Variant = {
  text: string;
  register: 'familiar' | 'standard' | 'formal';
  channel?: 'spoken' | 'written' | 'both';
};

export type Analysis = {
  structure?: { pattern: string; slots: string[] };
  prompt_facts?: string[];
  tokens?: Token[];
  mechanics?: Mechanic[];
  variants?: Variant[];
};

export type Beat = { for: string; text: string };

export type AttemptResult = {
  status: 'RECORDED' | 'DUPLICATE' | 'NOT_REVEALED';
  correct?: boolean;
  box_before?: number;
  box_after?: number;
  due_at?: string;
};

export type PracticeStats = {
  practiced: number;
  learned: number;
  weak: number;
  due: number;
  dueListen: number;
  misheard: number;
  today: number;
  streak: number;
};

export type HistoryFilter = 'all' | 'weak' | 'learned' | 'misheard';

export type HistoryItem = {
  id: number;
  last_dir?: Direction | null;
  last_plays?: number | null;
  last_heard?: boolean | null;
  listen_box?: number | null;
  text: string;
  meaning: string;
  box: number;
  correct_count: number;
  wrong_count: number;
  last_correct: boolean | null;
  last_answered_at: string;
  due_at: string | null;
  last_wrong_answer: string | null;
};

export type HistoryPage = {
  filter: HistoryFilter;
  page: number;
  pageSize: number;
  count: number;
  items: HistoryItem[];
};

export type Topic = { tag: string };

export type Unit = {
  unit: number;
  title: string;
  can_do: string;
  rule_keys: string[];
  hasSentences: boolean;
};

export type PracticeSentence = {
  id: number;
  unit?: number | null;
  difficulty?: number;
  slug?: string;
  text: string;
  level: Level;
  ipa: string | null;
  form: 'declarative' | 'interrogative' | 'imperative' | 'exclamative';
  polarity: 'affirmative' | 'negative';
  register: 'familiar' | 'standard' | 'formal';
  tags: string[];
  rule_keys: string[];
  accepted: string[];
  analysis: Analysis;
  meaning: string;
  literal: string | null;
  hint: string | null;
  token_glosses: Record<string, string>;
  beats: Beat[];
};

/** What a card carries before it is answered: only the side its direction asks from. */
export type PromptSide = Pick<PracticeSentence, 'text' | 'ipa' | 'meaning' | 'hint' | 'analysis'>;

export type Rule = {
  key: string;
  kind: string;
  level: Level;
  cheatsheet_slug: string | null;
  title: string;
  summary: string;
  body: string;
  examples: { fr: string; gloss: string }[];
};

export const RULE_KIND_ORDER = [
  'structure',
  'question',
  'word-order',
  'verb',
  'article',
  'negation',
  'pronoun',
  'agreement',
  'preposition',
  'spelling',
  'vocabulary',
] as const;

export type Labels = Record<string, Record<string, string>>;

export type PanelOption = { value: string; label: string; hint?: string; disabled?: boolean };
export type PanelSection = {
  key: string;
  kind: 'choice' | 'switch' | 'navigate';
  title: string;
  hint?: string;
  short?: string;
  param?: string;
  options: PanelOption[];
  value: string;
  default: string;
  resets: string[];
  keepsScore: boolean;
  track?: true;
};
export type PanelDeal = {
  level?: string;
  order?: string;
  unit?: string;
  topic?: string;
  dir?: string;
  group?: string;
  mix?: string;
  tags?: string;
  track?: string;
};

/** `GET sentences-app?action=meta` */
export type Meta = {
  /** Present from API level 2 (the desktop additions). */
  api?: number;
  levels: Level[];
  level: Level;
  units: Unit[];
  topics: Topic[];
  groups: { key: string; levels: Level[] }[];
  labels: Labels;
  sections: PanelSection[];
  state: Record<string, string>;
  deal: PanelDeal;
  ui: Record<string, string>;
};

export type Scorecard = {
  accepted: boolean;
  score: number;
  criteria: {
    meaning: boolean;
    grammar: boolean;
    spelling: 'ok' | 'accents' | 'typos';
    elision: boolean | null;
  };
  hints: {
    register?: 'formal' | 'neutral' | 'informal';
    natural?: boolean;
    errorType?:
      | 'gender_agreement'
      | 'verb_conjugation'
      | 'word_order'
      | 'preposition_or_article'
      | 'spelling_or_accent'
      | 'negation'
      | 'wrong_word'
      | 'avoir_expression';
  };
};

/** `POST deal` */
export type DealAnswer =
  | {
      status: 'card';
      dir: Direction;
      track: string;
      token: string;
      audio: string | null;
      card: PromptSide & { unit: number | null; level: Level };
    }
  | { status: 'review_empty' }
  | { status: 'empty' }
  | {
      status: 'finished';
      track: string;
      reset: string | null;
      due: number;
      /** What ran out: only the level can be started over; a unit can be replayed. */
      scope?: 'level' | 'unit' | 'topic';
      nextUnit?: number | null;
      replay?: string | null;
    };

export type AnswerModelGrade = { verdict: 'exact' | 'accents' | 'unmatched'; index: number | null };
