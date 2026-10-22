import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { forgetPreference } from '../src/pages/study/lib/persistedPreference';
import {
  hasSeenStudyTour,
  markStudyTourSeen,
  shouldAutoStartTour,
  STUDY_TOUR_STEPS,
  stepsFor,
} from '../src/pages/study/lib/studyTour';
import { StudyTour } from '../src/pages/study/components/StudyTour';
import en from '../src/i18n/locales/en/study.json';

const SEEN = 'flexi.study.tourSeen';

describe('the Study guided tour opens once', () => {
  beforeEach(() => {
    localStorage.clear();
    forgetPreference(SEEN);
  });
  afterEach(() => {
    localStorage.clear();
    forgetPreference(SEEN);
  });

  it('starts by itself on the first visit with decks — and never again once it has been seen', () => {
    expect(hasSeenStudyTour()).toBe(false);
    expect(shouldAutoStartTour(true, false)).toBe(true);
    markStudyTourSeen();
    expect(hasSeenStudyTour()).toBe(true);
    expect(localStorage.getItem(SEEN)).toBe('1');
    expect(shouldAutoStartTour(true, false)).toBe(false);
    // ...and it stays seen after a restart, which only keeps what storage kept.
    forgetPreference(SEEN);
    expect(shouldAutoStartTour(true, false)).toBe(false);
  });

  it('waits for the deck list to answer, and for there to be a deck to point at', () => {
    expect(shouldAutoStartTour(true, true)).toBe(false);
    expect(shouldAutoStartTour(false, false)).toBe(false);
  });

  it('drops the steps that point at a deck when there is none', () => {
    const withoutDecks = stepsFor(false);
    expect(withoutDecks.length).toBeLessThan(STUDY_TOUR_STEPS.length);
    expect(withoutDecks.some((s) => s.requiresDecks)).toBe(false);
    expect(stepsFor(true)).toHaveLength(STUDY_TOUR_STEPS.length);
    // It reaches the scope sheet and each of the three settings tabs, then ends on a centred slide.
    expect(stepsFor(true).filter((s) => s.needsSheet)).toHaveLength(4);
    expect(new Set(stepsFor(true).flatMap((s) => (s.dialogTab ? [s.dialogTab] : [])))).toEqual(
      new Set(['pace', 'activities', 'prefs']),
    );
    expect(STUDY_TOUR_STEPS[0].target).toBeNull();
    expect(STUDY_TOUR_STEPS.at(-1)?.target).toBeNull();
  });
});

describe('<StudyTour> walks the steps and can be skipped', () => {
  beforeEach(async () => {
    if (!i18n.isInitialized) await i18n.init({ lng: 'en', resources: { en: { study: en } }, interpolation: { escapeValue: false } });
    else i18n.addResourceBundle('en', 'study', en, true, true);
    await i18n.changeLanguage('en');
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  afterEach(() => vi.unstubAllGlobals());

  function Host({ onClose }: { onClose: () => void }) {
    const [index, setIndex] = useState(0);
    return (
      <I18nextProvider i18n={i18n}>
        <div data-tour="hero">hero</div>
        <StudyTour open steps={stepsFor(false)} stepIndex={index} onStepChange={setIndex} onClose={onClose} />
      </I18nextProvider>
    );
  }

  it('shows the first step, steps forward and back, and reports the count', async () => {
    render(<Host onClose={() => {}} />);
    expect(await screen.findByText('Welcome to Study')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 11')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText("Today's practice")).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 11')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Welcome to Study')).toBeInTheDocument();
  });

  it('Skip and Escape close it', async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    await screen.findByText('Welcome to Study');
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip' })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
