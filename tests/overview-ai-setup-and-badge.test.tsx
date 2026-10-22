import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', exists: () => true } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
const { ownRef } = vi.hoisted(() => ({
  ownRef: { current: { kind: 'unconfigured' } as { kind: string } },
}));
vi.mock('@/stores/aiSourceStore', () => ({
  useAiSource: () => ({ own: ownRef.current, source: ownRef.current, refresh: vi.fn() }),
  useAiSourceStore: () => vi.fn(),
}));
vi.mock('@/components/ai/AiSetupCard', () => ({ AiSetupCard: () => <div>ai-setup-card</div> }));

import { OverviewTab } from '@/pages/celpip/results/OverviewTab';

const base = {
  mScore: 7,
  mScoreAvg: null,
  totalTimeSec: 60,
  levelLabel: null,
  takenSections: ['listening'] as ('listening' | 'reading' | 'writing' | 'speaking')[],
  sectionScores: { listening: 7 },
  sectionAvgs: {},
  sectionLabels: { listening: 'L' },
  onOpenSkill: () => {},
  insight: {},
  insightOrigin: 'device' as const,
  progress: { done: 0, total: 1 },
  limitReached: false,
  onRetrySummary: () => {},
  vsAvgT: () => '',
};

beforeEach(() => {
  ownRef.current = { kind: 'unconfigured' };
});

describe('results overview without AI', () => {
  it('shows the AI setup card, no red error and no "analysed" badge', () => {
    const { container } = render(
      <OverviewTab
        {...(base as never)}
        summaryState="error"
        erroredSkills={['listening']}
      />,
    );
    expect(screen.getByText('ai-setup-card')).toBeTruthy();
    expect(screen.queryByText('insightSummaryFailed')).toBeNull();
    expect(container.querySelector('.text-error')).toBeNull();
    expect(screen.queryByText(/aiAnalyzed/)).toBeNull();
  });

  it('shows the badge with its origin only once an analysis exists', () => {
    ownRef.current = { kind: 'own' };
    render(
      <OverviewTab
        {...(base as never)}
        insightOrigin="own_key"
        insight={{ summary: { overall_assessment: 'x', strengths: [], areas_to_improve: [] }, improvement_plan: [] }}
        summaryState="ready"
      />,
    );
    expect(screen.getByText(/aiAnalyzed · origin\.ownKey/)).toBeTruthy();
  });
});
