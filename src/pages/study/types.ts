// =============================================================================
// Study — frontend types (mirror the Rust study commands' JSON, which mirror
// flexi-lingo-front's store/practiceSessionApi.ts). All snake_case to match the
// serde output of src-tauri/src/commands/study.rs.
// =============================================================================

export type ActivityType =
  | 'recall'
  | 'cloze'
  | 'type_test'
  | 'listen_again'
  | 'speak_test'
  | 'use_in_sentence'
  | 'synonym_discrim'
  | 'mini_reading';

export type ProficiencyDimension =
  | 'recognition'
  | 'recall'
  | 'listening'
  | 'production'
  | 'pronunciation';

export type LearningStage = 'new' | 'learning' | 'reinforcing' | 'solidifying' | 'mature' | 'leech';

export type Preset = 'vocabulary' | 'listening' | 'speaking' | 'full' | 'custom';
export type DeckStrategy = 'mix' | 'isolated' | 'rotation';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type HealthStatus = 'untouched' | 'fresh' | 'good' | 'warning' | 'critical';
export type SRSAlgorithm = 'leitner' | 'sm2' | 'fsrs';
export type StudyScope = 'due' | 'new' | 'weak' | 'random' | 'leech';
export type StudyFocus = 'balanced' | 'listening' | 'production' | 'recognition';

export interface StageRule {
  force_activities?: ActivityType[];
  prefer_activities?: ActivityType[];
  boost?: number;
}
export type StageOverrides = Partial<Record<LearningStage, StageRule>>;

export interface PracticeConfig {
  user_id: string;
  preset: Preset;
  enabled_activities: ActivityType[];
  activity_weights: Partial<Record<ActivityType, number>>;
  stage_overrides: StageOverrides;
  daily_minutes: number;
  goal: string;
  always_show_translation: boolean;
  auto_pronounce: boolean;
  reverse_card: boolean;
  use_listen_again: boolean;
  use_ai_grading: boolean;
  deck_strategy: DeckStrategy;
  deck_weights: Record<string, number>;
  /**
   * Decks switched OFF in Study settings — hard-excluded from every daily
   * plan. Separate from `deck_weights` (a soft 0.5–3× priority multiplier
   * with no "off" value) so a deck's tuned weight survives off → on.
   */
  disabled_deck_ids: string[];
  active_deck_id: string | null;
  focus: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateConfigBody {
  preset?: Preset;
  enabled_activities?: ActivityType[];
  activity_weights?: Partial<Record<ActivityType, number>>;
  stage_overrides?: StageOverrides;
  daily_minutes?: number;
  goal?: string;
  always_show_translation?: boolean;
  auto_pronounce?: boolean;
  reverse_card?: boolean;
  use_listen_again?: boolean;
  use_ai_grading?: boolean;
  deck_strategy?: DeckStrategy;
  deck_weights?: Record<string, number>;
  disabled_deck_ids?: string[];
  active_deck_id?: string | null;
  focus?: string | null;
}

export interface PlanItem {
  card_id: string;
  deck_id: string;
  activity_type: ActivityType;
  order_index: number;
  primary_dimension: ProficiencyDimension;
}

export interface DailyPlan {
  user_id: string;
  plan_date: string;
  card_queue: PlanItem[];
  total_cards: number;
  estimated_minutes: number;
  config_snapshot: PracticeConfig | null;
  generated_at: string;
  consumed_at: string | null;
  consumed_count: number;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  preset: Preset;
  enabled_activities: ActivityType[];
  deck_strategy: DeckStrategy;
  deck_ids: string[];
  goal_minutes: number | null;
  started_at: string;
  ended_at: string | null;
  total_seconds: number | null;
  activities_total: number;
  activities_correct: number;
  status: SessionStatus;
  card_queue: PlanItem[] | null;
  consumed_count: number;
  estimated_minutes: number | null;
}

export type ActivityPromptPayload =
  | { type: 'recall'; front_text: string; back_text: string; reverse: boolean }
  | {
      type: 'cloze';
      sentence: string;
      target: string;
      fa_translation?: string;
      distractors?: string[];
    }
  | { type: 'type_test'; prompt_text: string; target: string; reverse: boolean }
  | {
      type: 'listen_again';
      audio_clip_url: string;
      source_type: string;
      source_snippet: string;
      source_position?: number;
    }
  | { type: 'speak_test'; target: string; expected_phonemes?: string }
  | { type: 'use_in_sentence'; target: string; topic_hint?: string }
  | { type: 'synonym_discrim'; context_sentence: string; options: string[]; correct_index: number }
  | {
      type: 'mini_reading';
      paragraph: string;
      target_words: string[];
      comprehension_question?: string;
      comprehension_choices?: string[];
      comprehension_correct_index?: number;
    };

export interface CardNotes {
  definition?: string;
  memory_hook?: string;
  ipa?: string;
  part_of_speech?: string;
  cefr_level?: string;
  difficulty?: string;
  register?: string;
  synonyms?: string[];
  antonyms?: string[];
  collocations?: string[];
  common_mistakes?: { wrong: string; correct: string }[];
  etymology?: string;
  learning_lang?: string;
  conjugations?: {
    groups?: {
      mood?: string;
      tense?: string;
      forms?: { pr?: string; gloss?: string; form: string; ipa?: string }[];
    }[];
  };
  pronunciation_tips?: string;
  cultural_note?: string;
  examples?: { source?: string; target?: string; en?: string; tr?: string }[];
  // any extra fields are tolerated
  [key: string]: unknown;
}

export interface PracticeActivity {
  id: string;
  session_id: string;
  user_id: string;
  card_id: string | null;
  related_card_ids: string[];
  activity_type: ActivityType;
  prompt_payload: ActivityPromptPayload;
  template_id: string | null;
  user_response: string | null;
  user_audio_url: string | null;
  response_time_ms: number | null;
  is_correct: boolean | null;
  score: number | null;
  ai_feedback: string | null;
  affected_dimensions: ProficiencyDimension[];
  created_at: string;
}

export interface CardProficiency {
  card_id: string;
  deck_id: string;
  recognition_score: number;
  recall_score: number;
  listening_score: number;
  production_score: number;
  pronunciation_score: number;
  learning_stage: LearningStage;
  consecutive_failures: number;
  total_attempts: number;
  last_practiced_at: string | null;
}

export interface CardProgressSnapshot {
  leitner_box?: number | null;
  easiness_factor?: number | null;
  sm2_interval?: number | null;
  sm2_repetitions?: number | null;
  fsrs_stability?: number | null;
  fsrs_difficulty?: number | null;
  fsrs_state?: string | null;
  last_reviewed?: string | null;
}

export interface NextActivityResponse {
  activity: PracticeActivity;
  card_meta: {
    card_id: string;
    front_text: string;
    back_text: string;
    deck_id: string;
    deck_title: string;
    notes: CardNotes | null;
    /** The language the deck's words are written in. */
    deck_language?: string;
    deck_native_language?: string | null;
  } | null;
  srs_algorithm: SRSAlgorithm;
  card_progress: CardProgressSnapshot | null;
  requeue_count: number;
  remaining: number;
  total: number;
}

export interface SentenceCoaching {
  corrected: string | null;
  corrections: { wrong: string; right: string; kind: 'spelling' | 'grammar'; note: string }[];
  examples: string[];
}

export interface SubmitActivityBody {
  session_id: string;
  activity_id: string;
  user_response?: string;
  user_audio_url?: string;
  response_time_ms?: number;
  is_correct?: boolean;
  self_rating?: 1 | 2 | 3 | 4 | 5;
}

/** The answer judge's scorecard for a written sentence (the website's `Scorecard`). */
export interface Scorecard {
  accepted: boolean;
  /** 0-100. */
  score: number;
  criteria: {
    meaning: boolean;
    grammar: boolean;
    spelling: 'ok' | 'accents' | 'typos';
    elision: boolean | null;
  };
  /** Only what the judge was confident about; a hint never changes the verdict. */
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
}

export interface SubmitResponse {
  activity: PracticeActivity;
  proficiency: CardProficiency;
  coaching: SentenceCoaching | null;
  /** Null when no model graded it (the one-line `activity.ai_feedback` stands in). */
  judgement: Scorecard | null;
}

/** One card of a shadowing run (`study_session_cards`). */
export interface SessionCard {
  card_id: string;
  deck_id: string;
  front_text: string;
  back_text: string;
  notes: CardNotes | null;
  /** The language the front is written in (the deck's). */
  language: string;
  native_language: string | null;
}

/** The end-of-session report's data, counted per CARD (the Rust `study::insights`). */
export interface SessionInsights {
  unique_cards: number;
  attempts: number;
  first_try_correct: number;
  ended_correct: number;
  active_seconds: number;
  struggles: { card_id: string; front_text: string; attempts: number; ended_correct: boolean }[];
  by_level: { level: string; seen: number; missed: number }[];
  /** day_offset 0 = today. */
  forecast: { day_offset: number; count: number }[];
}

export interface SessionSummaryResponse {
  session: PracticeSession;
  per_dimension_delta: Partial<Record<ProficiencyDimension, number>>;
  per_deck_counts: { deck_id: string; deck_title: string; count: number }[];
  recommendations: { type: string; message: string }[];
  srs_stats?: {
    promotions: number;
    demotions: number;
    newly_mastered: number;
    dues_reviewed: number;
    new_learned: number;
    tomorrow_forecast: number;
  };
  /** XP awarded for this session. */
  xp_earned?: number;
  /** The per-card view; absent when the backend could not build it. */
  session_insights?: SessionInsights;
}

export interface DeckStatus {
  user_id: string;
  deck_id: string;
  deck_title: string;
  total_cards: number;
  leech_count: number;
  mature_count: number;
  new_count: number;
  due_count: number;
  untouched_count: number;
  last_practiced_at: string | null;
  days_since_practice: number | null;
  avg_recognition: number | null;
  avg_recall: number | null;
  avg_production: number | null;
  avg_listening: number | null;
  avg_pronunciation: number | null;
  health_status: HealthStatus;
  weekly_coverage_pct: number | null;
}

export interface StartSessionArgs {
  deck_ids?: string[];
  goal_minutes?: number;
  study_ahead?: boolean;
  scope?: StudyScope;
}

// ─── Focus presets (ported from front useStartStudy) ─────────────────────────

/** Active study methods (speak_test stays dormant). */
export const ACTIVE_METHODS: ActivityType[] = [
  'recall',
  'cloze',
  'type_test',
  'listen_again',
  'synonym_discrim',
  'mini_reading',
  'use_in_sentence',
];

export const FOCUS_PRESETS: StudyFocus[] = ['balanced', 'listening', 'production', 'recognition'];

export const FOCUS_WEIGHTS: Record<StudyFocus, Partial<Record<ActivityType, number>>> = {
  balanced: {
    recall: 1,
    cloze: 1,
    type_test: 1,
    listen_again: 1,
    synonym_discrim: 1,
    mini_reading: 1,
    use_in_sentence: 1,
  },
  listening: {
    listen_again: 2.5,
    recall: 1,
    cloze: 1,
    type_test: 1,
    synonym_discrim: 1,
    mini_reading: 1,
    use_in_sentence: 1,
  },
  production: {
    type_test: 2,
    cloze: 1.5,
    use_in_sentence: 2,
    recall: 1,
    listen_again: 1,
    synonym_discrim: 1,
    mini_reading: 1,
  },
  recognition: {
    recall: 2,
    synonym_discrim: 1.5,
    cloze: 1,
    type_test: 1,
    listen_again: 1,
    mini_reading: 1,
    use_in_sentence: 1,
  },
};

export function focusFromWeights(
  weights: Partial<Record<ActivityType, number>> | undefined,
): StudyFocus | 'custom' {
  const matches = (preset: Partial<Record<ActivityType, number>>) =>
    ACTIVE_METHODS.every((a) => (weights?.[a] ?? 1) === (preset[a] ?? 1));
  return FOCUS_PRESETS.find((f) => matches(FOCUS_WEIGHTS[f])) ?? 'custom';
}
