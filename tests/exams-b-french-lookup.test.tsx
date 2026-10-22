import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const seen: Array<{ word: string; sourceLang?: string }> = [];
vi.mock('@/components/WordDialog', () => ({
  WordDialog: (p: { word: string; sourceLang?: string }) => {
    seen.push({ word: p.word, sourceLang: p.sourceLang });
    return <div role="dialog">{p.word}</div>;
  },
}));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', exists: () => true } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { LookupText, WordLookupProvider } from '@/pages/celpip/components/session/WordLookup';
import { getExamProfile } from '@/pages/celpip/examProfiles';

describe('word lookup source language', () => {
  it('CELPIP content is looked up as English (the default)', () => {
    seen.length = 0;
    render(
      <WordLookupProvider>
        <LookupText text="cohort" />
      </WordLookupProvider>,
    );
    fireEvent.click(screen.getByText('cohort'));
    expect(seen.at(-1)).toEqual({ word: 'cohort', sourceLang: 'en' });
  });

  it('TCF content is looked up as French, from the exam profile', () => {
    seen.length = 0;
    for (const type of ['tcf', 'tcf_quebec', 'tcf_irn']) {
      const { unmount } = render(
        <WordLookupProvider contentLang={getExamProfile(type).contentLang}>
          <LookupText text="chambre" />
        </WordLookupProvider>,
      );
      fireEvent.click(screen.getByText('chambre'));
      expect(seen.at(-1)).toEqual({ word: 'chambre', sourceLang: 'fr' });
      unmount();
    }
  });
});

describe('TCF results review', () => {
  it('a French option word opens the dialog with source fr', async () => {
    const { McqResultTab } = await import('@/pages/celpip/results/McqResultTab');
    seen.length = 0;
    const content = {
      parts: [
        {
          part_index: 3,
          questions: [
            {
              question_index: 0,
              question: 'Quand la salle ouvre-t-elle ?',
              options: ['À neuf heures', 'À midi'],
              correct_index: 0,
            },
          ],
        },
      ],
    } as never;
    const result = {
      section_type: 'reading',
      status: 'scored',
      answers: { part_0_q_0: 1 },
    } as never;
    render(
      <WordLookupProvider contentLang={getExamProfile('tcf').contentLang}>
        <McqResultTab
          result={result}
          examContent={content}
          yourAnswerLabel="x"
          itemsMode
          contentLang="fr"
        />
      </WordLookupProvider>,
    );
    fireEvent.click(screen.getByText('midi'));
    expect(seen.at(-1)).toEqual({ word: 'midi', sourceLang: 'fr' });
  });
});
