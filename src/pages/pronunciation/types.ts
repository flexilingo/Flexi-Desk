export type PracticeMode = 'word' | 'sentence' | 'shadowing';
export type SessionStatus = 'idle' | 'recording' | 'analyzing' | 'completed' | 'failed';

export interface WordScore {
  expected: string;
  actual: string;
  score: number;
  status: 'correct' | 'substitution' | 'missing' | 'extra';
}

export interface PronunciationSession {
  id: string;
  mode: PracticeMode;
  language: string;
  targetText: string;
  referenceAudio?: string;
  status: SessionStatus;
  overallScore?: number;
  phonemeScore?: number;
  prosodyScore?: number;
  fluencyScore?: number;
  feedback: string[];
  attempts: number;
  bestScore?: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PronunciationAttempt {
  id: string;
  sessionId: string;
  attemptNumber: number;
  audioPath: string;
  durationMs: number;
  transcript?: string;
  overallScore?: number;
  phonemeScore?: number;
  prosodyScore?: number;
  fluencyScore?: number;
  wordScores: WordScore[];
  createdAt: string;
}

export interface PronunciationProgress {
  id: string;
  language: string;
  totalSessions: number;
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  practiceMinutes: number;
  weakPhonemes: string[];
  updatedAt: string;
}

// ── Raw IPC types (snake_case) ──────────────────────────

export interface RawPronunciationSession {
  id: string;
  mode: string;
  language: string;
  target_text: string;
  reference_audio: string | null;
  status: string;
  overall_score: number | null;
  phoneme_score: number | null;
  prosody_score: number | null;
  fluency_score: number | null;
  feedback_json: string;
  attempts: number;
  best_score: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RawPronunciationAttempt {
  id: string;
  session_id: string;
  attempt_number: number;
  audio_path: string;
  duration_ms: number;
  transcript: string | null;
  overall_score: number | null;
  phoneme_score: number | null;
  prosody_score: number | null;
  fluency_score: number | null;
  word_scores_json: string;
  created_at: string;
}

export interface RawPronunciationProgress {
  id: string;
  language: string;
  total_sessions: number;
  total_attempts: number;
  average_score: number;
  best_score: number;
  practice_minutes: number;
  weak_phonemes: string;
  updated_at: string;
}

// ── Mappers ─────────────────────────────────────────────

export function mapSession(raw: RawPronunciationSession): PronunciationSession {
  let feedback: string[] = [];
  try {
    const parsed = JSON.parse(raw.feedback_json);
    if (Array.isArray(parsed)) feedback = parsed;
  } catch {
    /* empty */
  }

  return {
    id: raw.id,
    mode: raw.mode as PracticeMode,
    language: raw.language,
    targetText: raw.target_text,
    referenceAudio: raw.reference_audio ?? undefined,
    status: raw.status as SessionStatus,
    overallScore: raw.overall_score ?? undefined,
    phonemeScore: raw.phoneme_score ?? undefined,
    prosodyScore: raw.prosody_score ?? undefined,
    fluencyScore: raw.fluency_score ?? undefined,
    feedback,
    attempts: raw.attempts,
    bestScore: raw.best_score ?? undefined,
    errorMessage: raw.error_message ?? undefined,
    createdAt: raw.created_at,
    completedAt: raw.completed_at ?? undefined,
  };
}

export function mapAttempt(raw: RawPronunciationAttempt): PronunciationAttempt {
  let wordScores: WordScore[] = [];
  try {
    wordScores = JSON.parse(raw.word_scores_json);
  } catch {
    /* empty */
  }

  return {
    id: raw.id,
    sessionId: raw.session_id,
    attemptNumber: raw.attempt_number,
    audioPath: raw.audio_path,
    durationMs: raw.duration_ms,
    transcript: raw.transcript ?? undefined,
    overallScore: raw.overall_score ?? undefined,
    phonemeScore: raw.phoneme_score ?? undefined,
    prosodyScore: raw.prosody_score ?? undefined,
    fluencyScore: raw.fluency_score ?? undefined,
    wordScores,
    createdAt: raw.created_at,
  };
}

export function mapProgress(raw: RawPronunciationProgress): PronunciationProgress {
  let weakPhonemes: string[] = [];
  try {
    weakPhonemes = JSON.parse(raw.weak_phonemes);
  } catch {
    /* empty */
  }

  return {
    id: raw.id,
    language: raw.language,
    totalSessions: raw.total_sessions,
    totalAttempts: raw.total_attempts,
    averageScore: raw.average_score,
    bestScore: raw.best_score,
    practiceMinutes: raw.practice_minutes,
    weakPhonemes,
    updatedAt: raw.updated_at,
  };
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'text-[#8BB7A3]';
  if (score >= 70) return 'text-[#C58C6E]';
  if (score >= 50) return 'text-yellow-500';
  return 'text-error';
}

export function scoreBg(score: number): string {
  if (score >= 90) return 'bg-[#8BB7A3]/15';
  if (score >= 70) return 'bg-[#C58C6E]/15';
  if (score >= 50) return 'bg-yellow-500/15';
  return 'bg-error/15';
}
