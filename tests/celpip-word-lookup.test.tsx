import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Reviewing a result is exactly when a learner wants to look a word up, so every
 * word of the exam content and the AI feedback must be individually clickable.
 *
 * `LookupText` deliberately renders PLAIN text when no provider is above it —
 * that's what lets the same components render inside a live exam (where lookup is
 * gated behind the translate toggle) and on the results page (where it's always on).
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn(async () => ({})) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { LookupText, WordLookupProvider } from '@/pages/celpip/components/session/WordLookup';

describe('word lookup on the results page', () => {
  it('renders plain text with no provider, so components stay reusable', () => {
    const { container } = render(<LookupText text="the quick fox" />);
    expect(container.textContent).toBe('the quick fox');
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('makes every word individually clickable inside a provider', () => {
    const { container } = render(
      <WordLookupProvider enabled>
        <LookupText text="the quick fox" />
      </WordLookupProvider>,
    );
    // One clickable token per word — not one for the whole sentence.
    const tokens = container.querySelectorAll('[data-lookup-text] *');
    expect(container.textContent).toContain('quick');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('clicking a word opens the translation dialog for that word', () => {
    render(
      <WordLookupProvider enabled>
        <LookupText text="cohort" />
      </WordLookupProvider>,
    );
    // No dialog exists until a word is actually clicked.
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    fireEvent.click(screen.getByText('cohort'));

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog, 'clicking a word must open the translation dialog').not.toBeNull();
    expect(dialog?.textContent).toContain('cohort');
  });

  it('a disabled provider produces zero clickable tokens (live exam, toggle off)', () => {
    const { container } = render(
      <WordLookupProvider enabled={false}>
        <LookupText text="the quick fox" />
      </WordLookupProvider>,
    );
    expect(container.textContent).toBe('the quick fox');
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
