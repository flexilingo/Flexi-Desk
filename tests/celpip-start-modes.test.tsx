import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The start dialog opens on PRACTICE and no longer offers Learning mode.
 *
 * Practice is what learners choose and finish — 330 practice sessions against 25
 * full exams in the 30 days to 2026-10-02, and zero Learning runs. This pins the
 * decision: the default mode, the order of the cards, and the fact that Learning
 * is hidden from the picker WITHOUT being deleted (the engine and
 * `learning_mode: true` still work, and a shared setup can still carry it).
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn(async () => ({})) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { StartExamDialog } from '@/pages/celpip/components/landing/StartExamDialog';

const open = () =>
  render(
    <MemoryRouter>
      <StartExamDialog open onClose={() => {}} />
    </MemoryRouter>,
  );

describe('celpip start dialog — modes', () => {
  it('offers practice and the full exam, in that order', () => {
    open();
    const modes = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((text) => text.includes('modePracticeDesc') || text.includes('modeFullDesc'));
    expect(modes).toHaveLength(2);
    expect(modes[0]).toContain('practice');
    expect(modes[1]).toContain('fullExam');
  });

  it('marks practice as the recommendation', () => {
    open();
    expect(screen.getByText('modeRecommended')).toBeTruthy();
  });

  it('opens on practice — the section picker is there without a click', () => {
    open();
    expect(screen.getByText('choosePracticeSections')).toBeTruthy();
  });

  it('does not offer learning mode as a third card', () => {
    open();
    expect(screen.queryByText('modeLearningDesc')).toBeNull();
    expect(screen.queryByText('chooseLearningSections')).toBeNull();
  });

  it('offers it instead as the untimed switch, off, inside practice', () => {
    open();
    const sw = screen.getAllByRole('switch').filter((e) => e.textContent?.includes('untimedMode'));
    expect(sw).toHaveLength(1);
    expect(sw[0].getAttribute('aria-checked')).toBe('false');
    expect(sw[0].textContent).toContain('untimedModeHint');
  });
});
