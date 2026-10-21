import type {
  CardProgressSnapshot,
  NextActivityResponse,
  PracticeActivity,
  PracticeConfig,
  SRSAlgorithm,
  SubmitResponse,
} from '../../types';

/** Evidence the runner sends to `study_submit_activity`. */
export interface StudySubmitArgs {
  user_response?: string;
  is_correct?: boolean;
  self_rating?: 1 | 2 | 3 | 4 | 5;
  response_time_ms?: number;
}

export interface MethodProps {
  activity: PracticeActivity;
  cardMeta: NextActivityResponse['card_meta'];
  config: PracticeConfig | null;
  /** Drives the predicted next-review intervals on the rating buttons. */
  srsAlgorithm: SRSAlgorithm;
  cardProgress: CardProgressSnapshot | null;
  submitting: boolean;
  /** Grades the activity server-side and returns the result (null on failure). */
  onSubmit: (args: StudySubmitArgs) => Promise<SubmitResponse | null>;
  /** Advances to the next activity. */
  onNext: () => void;
  /** Opens the shared dictionary for a tapped word. */
  onLookup: (word: string, sentence: string) => void;
}
