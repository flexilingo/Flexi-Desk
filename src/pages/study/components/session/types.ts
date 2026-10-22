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

/** What the card shows and whether the session is fullscreen — the reading view handed to the active method. */
export interface StudyViewState {
  /** Focus mode drives the keyboard loop and the control strip. */
  focusMode: boolean;
  showWord: boolean;
  showMeaning: boolean;
  showExampleMeanings: boolean;
  /** The layout key: switches between the meaning-first and examples-first layouts. */
  onToggleShowMeaning: () => void;
}

/** Audio behaviour the learner chose in the menu. */
export interface StudyAutoPlay {
  autoPronounce: boolean;
  /** Under reverse: read the word when the reversed card is flipped to it. */
  pronounceWordOnReveal: boolean;
  accent: 'us' | 'uk';
}

export interface MethodProps {
  activity: PracticeActivity;
  cardMeta: NextActivityResponse['card_meta'];
  config: PracticeConfig | null;
  /** Drives the predicted next-review intervals on the rating buttons. */
  srsAlgorithm: SRSAlgorithm;
  cardProgress: CardProgressSnapshot | null;
  /** The rating buttons' days, computed by the scheduler itself (see `predicted_intervals`). */
  predictedIntervals?: Record<string, number> | null;
  /** How many times this card has already come round in this session. */
  requeueCount: number;
  submitting: boolean;
  /** Grades the activity server-side and returns the result (null on failure). */
  onSubmit: (args: StudySubmitArgs) => Promise<SubmitResponse | null>;
  /** Advances to the next activity. One card per call: extra presses while it loads are ignored. */
  onNext: () => void;
  /** The next card is being fetched — a Continue button shows it working. */
  advancing: boolean;
  /** Opens the shared dictionary for a tapped word. */
  onLookup: (word: string, sentence: string) => void;
  view: StudyViewState;
  autoPlay: StudyAutoPlay;
  /** Language of the deck being studied, and of the learner's own meanings. */
  deckLanguage: string;
  nativeLanguage: string;
}
