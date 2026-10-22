// Types for the CELPIP AI Coach Report.
//
// Kept separate from `types.ts` because the report is a big, deeply nested
// document and it would swamp that file.
//
// One convention runs through everything here and matters for rendering:
//
//   PROSE fields are in the learner's own language (fa/ar/fr/…), and may be
//   right-to-left. Anything quoted — exam questions, passage spans, their own
//   sentences, corrections, drills, vocabulary — stays in ENGLISH and must be
//   rendered in its own `dir="ltr"` container, or an RTL page scrambles it.
//
// Every field is optional in practice: the report is model-generated, and a
// component that assumes a key exists will blank the page for one learner and
// nobody will know why. Render defensively.

export type CoachSkill = 'listening' | 'reading' | 'writing' | 'speaking';
export type CoachConfidence = 'high' | 'medium' | 'low';

/** A real question this learner actually got wrong. */
export interface CoachEvidence {
  ref?: string;
  session_id?: string;
  date?: string;
  /** English, verbatim. */
  question?: string;
  /** English, verbatim — the span of the passage or script that decides it. */
  passage_span?: string;
  your_answer?: string;
  correct_answer?: string;
  /** Prose. The specific word in passage_span that settles it. */
  the_tell?: string;
}

export interface CoachDrill {
  instruction?: string;
  /** English. */
  items?: string[];
  /** English. */
  answers?: string[];
  minutes?: number;
}

export interface CoachErrorPattern {
  pattern_id?: string;
  /** Prose — a name the learner will remember. */
  name?: string;
  times_seen?: number;
  first_seen?: string;
  sessions?: string[];
  what_happens?: string;
  why_you_fall_for_it?: string;
  evidence?: CoachEvidence[];
  the_rule?: string;
  drill?: CoachDrill;
}

export interface CoachPartAccuracy {
  part_type?: string;
  correct?: number;
  total?: number;
  verdict?: string;
}

/** One line of the writing/speaking clinic: their sentence, repaired. */
export interface CoachClinicLine {
  yours?: string;
  better?: string;
  why?: string;
}

export interface CoachClinic {
  session_id?: string;
  date?: string;
  task_type?: string;
  /** English, verbatim — their own paragraph. */
  your_paragraph?: string;
  line_by_line?: CoachClinicLine[];
  /** English — recognisably theirs, repaired. Not a replacement essay. */
  upgraded_paragraph?: string;
  band_delta?: string;
}

export interface CoachSkillReport {
  clb_now?: number;
  clb_trend?: number[];
  diagnosis?: string;
  root_causes?: Array<{ cause?: string; evidence_refs?: string[]; confidence?: CoachConfidence }>;
  error_patterns?: CoachErrorPattern[];
  // listening / reading
  accuracy_by_part_type?: CoachPartAccuracy[];
  timing?: { observed?: string; recommendation?: string };
  // writing / speaking
  criteria_profile?: Array<{ criterion?: string; avg?: number; verdict?: string }>;
  clinic?: CoachClinic[];
  phrase_bank?: Array<{ function?: string; phrases?: string[] }>;
  delivery?: { wpm?: number; filler_rate?: number; note?: string };
}

export interface CoachCoverage {
  sessions_total?: number;
  sessions_new?: number;
  from?: string;
  to?: string;
  exam_sessions?: number;
  practice_sessions?: number;
  mcq_questions_reviewed?: number;
  writing_tasks?: number;
  speaking_tasks?: number;
}

export interface CoachProgress {
  period?: { from?: string; to?: string };
  moved?: Array<{ metric?: string; from?: number; to?: number; note?: string }>;
  /** Patterns that stopped recurring. The most motivating block in the report. */
  fixed?: Array<{ pattern_id?: string; evidence?: string }>;
  still_broken?: Array<{ pattern_id?: string; times_seen?: number; note?: string }>;
  new_problems?: Array<{ pattern_id?: string; note?: string }>;
  adherence?: string;
}

export interface CoachBlocker {
  rank?: number;
  title?: string;
  costing_you?: string;
  skills?: string[];
  pattern_ids?: string[];
  fix?: string;
  time_to_fix?: string;
}

export interface CoachPlanTask {
  what?: string;
  minutes?: number;
  /** A real surface in the app, e.g. "FlexiLingo → CELPIP → Practice → Reading Part 4". */
  where?: string;
  success_looks_like?: string;
}

export interface CoachReportBody {
  schema_ver?: number;
  language?: { prose?: string; artifacts?: string; dir?: 'ltr' | 'rtl' };
  meta?: {
    report_index?: number;
    covered?: CoachCoverage;
    confidence?: CoachConfidence;
    confidence_reason?: string;
  };
  headline?: {
    verdict?: string;
    current_estimate?: Partial<Record<CoachSkill | 'overall_clb', number>>;
    predicted_ceiling?: { clb?: number; by?: string; if?: string };
    single_biggest_blocker?: string;
    quick_wins?: Array<{ title?: string; expected_gain?: string; effort?: string }>;
  };
  /** null on a first report — there is nothing to compare against. */
  progress_since_last?: CoachProgress | null;
  skills?: Partial<Record<CoachSkill, CoachSkillReport | null>>;
  grammar_syllabus?: Array<{
    item?: string;
    pattern_id?: string;
    times_seen?: number;
    priority?: number;
    your_errors?: Array<{ yours?: string; fixed?: string; ref?: string }>;
    explanation?: string;
    drill?: CoachDrill;
  }>;
  vocabulary?: {
    gaps_observed?: Array<{
      word?: string;
      ref?: string;
      you_read_it_as?: string;
      actual?: string;
      cefr?: string;
    }>;
    must_learn?: Array<{ word?: string; why?: string; example?: string }>;
    upgrade_pairs?: Array<{ you_use?: string; use_instead?: string; register?: string }>;
    deck_suggestion?: string;
  };
  top_blockers?: CoachBlocker[];
  action_plan_14_day?: {
    principle?: string;
    days?: Array<{ day?: number; focus?: string; tasks?: CoachPlanTask[] }>;
    weekly_checkpoint?: string[];
  };
  exam_strategy?: Array<{ situation?: string; do?: string; dont?: string }>;
  encouragement?: string;
  /** Read by the next report's generator, not by the UI. */
  carry_forward?: Record<string, unknown>;
  /** Consumed by the email sender, not by the UI. */
  email?: Record<string, unknown>;
  /** The same figures the model was given, so the UI can chart them. */
  statistics?: {
    clb_trend?: Partial<Record<CoachSkill, number[]>>;
    accuracy_by_part_type?: Record<string, CoachPartAccuracy[]>;
    pattern_recurrence?: Array<{ pattern_id?: string; times_seen?: number; first_seen?: string }>;
  };
}

/** The denormalized columns — everything the card and history list need. */
export interface CoachReportSummary {
  id: string;
  report_index: number;
  report_locale?: string;
  summary_line?: string | null;
  overall_clb?: number | null;
  predicted_ceiling?: number | null;
  new_session_count: number;
  covered_from?: string | null;
  covered_to?: string | null;
  generated_at: string;
  read_at?: string | null;
}

export interface CoachReportRow extends CoachReportSummary {
  /**
   * The same report in a second language — a Pro perk. Null for free readers,
   * and not merely hidden: the server never sends it, so the toggle cannot be
   * forced open from the client.
   */
  report_alt?: CoachReportBody | null;
  report_alt_locale?: string | null;
  previous_report_id?: string | null;
  covered_session_ids?: string[];
  new_session_ids?: string[];
  email_sent_at?: string | null;
  report: CoachReportBody;
}

/** Sections the server withheld from a free reader, in tease order. */
export type CoachGatedSection =
  | 'skills'
  | 'top_blockers'
  | 'action_plan_14_day'
  | 'grammar_syllabus'
  | 'vocabulary'
  | 'exam_strategy';

export interface CoachReportResponse {
  report: CoachReportRow;
  prev_id: string | null;
  next_id: string | null;
  /**
   * True when the body has been stripped server-side. The client cannot
   * un-gate anything — the withheld content was never sent — so this flag is
   * only about what to render, never about what to hide.
   */
  gated?: boolean;
  gated_sections?: CoachGatedSection[];
  /** Counts of what is missing, so a lock can say "13 more days" rather than "more". */
  teaser?: {
    hidden_patterns?: number;
    hidden_skills?: number;
    hidden_blockers?: number;
    hidden_clinics?: number;
    plan_days_total?: number;
    plan_days_hidden?: number;
    grammar_items?: number;
    vocabulary_words?: number;
  };
  /**
   * False for mobile-sourced accounts (App Store purchase-steering rules). When
   * false the server does not gate at all, so this should never be paired with
   * gated: true — but the UI must still never render an upgrade CTA on it.
   */
  can_upsell?: boolean;
  tier?: string;
}

export interface CoachReportListResponse {
  reports: CoachReportSummary[];
  unread_count: number;
}
