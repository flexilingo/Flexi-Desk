import { readRaw, writeRaw } from './persistedPreference';

/**
 * The guided tour of the Study page — the website's `studyTourSteps`. Steps are
 * declarative: the page derives "is the scope sheet open / the settings dialog open,
 * and on which tab" straight from the current step, so there is no imperative
 * open-and-close choreography to keep in step.
 */
export type StudySettingsTabId = 'pace' | 'activities' | 'prefs';

export type StudyTourStepId =
  | 'intro'
  | 'hero'
  | 'heroShortcuts'
  | 'deckList'
  | 'deckCard'
  | 'scopeOptions'
  | 'scopeFocus'
  | 'scopeForce'
  | 'scopeStart'
  | 'settingsTabs'
  | 'settingsDuration'
  | 'settingsDeckStrategy'
  | 'settingsDeckWeights'
  | 'settingsFocusChips'
  | 'settingsActivityList'
  | 'settingsSrs'
  | 'settingsAutoRead'
  | 'outro';

export interface StudyTourStep {
  id: StudyTourStepId;
  /** Matches a `data-tour="..."` attribute on the real page element. `null` = a centred slide. */
  target: string | null;
  /** Preferred side for the tooltip — the engine flips it when there is no room. */
  placement: 'top' | 'bottom' | 'center';
  /** Dropped when the learner has no decks yet. */
  requiresDecks?: boolean;
  /** Needs the scope sheet open (shown deckless, as "today's mix"). */
  needsSheet?: boolean;
  /** Needs the settings dialog open, on this tab. */
  dialogTab?: StudySettingsTabId;
}

export const STUDY_TOUR_STEPS: StudyTourStep[] = [
  { id: 'intro', target: null, placement: 'center' },
  { id: 'hero', target: 'hero', placement: 'bottom' },
  { id: 'heroShortcuts', target: 'hero-shortcuts', placement: 'bottom' },
  { id: 'deckList', target: 'deck-list', placement: 'top', requiresDecks: true },
  { id: 'deckCard', target: 'deck-study-btn', placement: 'top', requiresDecks: true },
  {
    id: 'scopeOptions',
    target: 'scope-options',
    placement: 'top',
    requiresDecks: true,
    needsSheet: true,
  },
  {
    id: 'scopeFocus',
    target: 'scope-focus',
    placement: 'top',
    requiresDecks: true,
    needsSheet: true,
  },
  {
    id: 'scopeForce',
    target: 'scope-force',
    placement: 'top',
    requiresDecks: true,
    needsSheet: true,
  },
  {
    id: 'scopeStart',
    target: 'scope-start',
    placement: 'top',
    requiresDecks: true,
    needsSheet: true,
  },
  { id: 'settingsTabs', target: 'settings-tabs', placement: 'bottom', dialogTab: 'pace' },
  { id: 'settingsDuration', target: 'settings-duration', placement: 'bottom', dialogTab: 'pace' },
  {
    id: 'settingsDeckStrategy',
    target: 'settings-deck-strategy',
    placement: 'bottom',
    dialogTab: 'pace',
  },
  {
    id: 'settingsDeckWeights',
    target: 'settings-deck-weights',
    placement: 'top',
    dialogTab: 'pace',
    requiresDecks: true,
  },
  {
    id: 'settingsFocusChips',
    target: 'settings-focus-chips',
    placement: 'bottom',
    dialogTab: 'activities',
  },
  {
    id: 'settingsActivityList',
    target: 'settings-activity-list',
    placement: 'top',
    dialogTab: 'activities',
  },
  { id: 'settingsSrs', target: 'settings-srs', placement: 'bottom', dialogTab: 'prefs' },
  { id: 'settingsAutoRead', target: 'settings-autoread', placement: 'bottom', dialogTab: 'prefs' },
  { id: 'outro', target: null, placement: 'center' },
];

/** The steps for a learner: the ones that need a deck are dropped when there are none. */
export const stepsFor = (hasDecks: boolean): StudyTourStep[] =>
  STUDY_TOUR_STEPS.filter((s) => !s.requiresDecks || hasDecks);

const SEEN_KEY = 'flexi.study.tourSeen';

/** The tour opens by itself ONCE — the first time the Study page is shown. */
export const hasSeenStudyTour = (): boolean => readRaw(SEEN_KEY) === '1';
export const markStudyTourSeen = (): void => writeRaw(SEEN_KEY, '1');

/** Whether the page should open the tour on its own right now. */
export function shouldAutoStartTour(hasDecks: boolean, loading: boolean): boolean {
  return !loading && hasDecks && !hasSeenStudyTour();
}
