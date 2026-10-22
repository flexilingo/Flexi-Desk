import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'band' in o ? `${k}:${o.band}` : k),
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { ModelAnswerLadder } from '@/pages/celpip/results/ModelAnswerLadder';
import { McqResultTab } from '@/pages/celpip/results/McqResultTab';
import { AiInsightTab } from '@/pages/celpip/results/AiInsightTab';
import { SkillProfileCard } from '@/pages/celpip/components/landing/SkillProfileCard';
import { buildSkillProfile, overallEstimate } from '@/pages/celpip/utils/skillProfile';
import type { ExamSession, SectionResult } from '@/pages/celpip/types';

describe('model answer ladder CLB 5 / 7 / 9', () => {
  const bands = [
    { clb: 5, answer: 'Band five answer text', words: 80 },
    { clb: 7, locked: true },
    { clb: 9, locked: true },
  ];

  it('shows the free band and only the existence of the locked ones', () => {
    render(<ModelAnswerLadder bands={bands} taskClb={4} />);
    expect(screen.getByText('Band five answer text')).toBeInTheDocument();
    // two Pro chips and their benefit lines, no text for 7 or 9
    expect(screen.getAllByText('Pro')).toHaveLength(2);
    expect(screen.getByText('results.lockedBenefit7')).toBeInTheDocument();
    expect(screen.getByText('results.lockedBenefit9')).toBeInTheDocument();
  });

  it('a locked band opens the upgrade dialog on click and reveals nothing', () => {
    render(<ModelAnswerLadder bands={bands} taskClb={6} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(screen.getByText('results.lockedBenefit7'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('results.lockedBandDialogTitle:7');
    expect(dialog?.textContent).not.toContain('answer');
  });

  it('marks the rung just above the learner as the next step', () => {
    render(
      <ModelAnswerLadder
        bands={[
          { clb: 5, answer: 'a' },
          { clb: 7, answer: 'b' },
          { clb: 9, answer: 'c' },
        ]}
        taskClb={5}
      />,
    );
    expect(screen.getAllByText('results.yourNextStep')).toHaveLength(1);
  });
});

const mcqResult = (answers: Record<string, number>): SectionResult =>
  ({
    section_type: 'listening',
    section_index: 0,
    status: 'scored',
    clb_score: 6,
    raw_score: 1,
    max_raw_score: 2,
    time_spent_sec: 10,
    answers,
    transcripts: null,
    ai_feedback: null,
  }) as SectionResult;

const content = {
  parts: [
    {
      part_index: 0,
      title: 'Part 1',
      script: [{ speaker: 'Ana', text: 'The meeting moved to Tuesday.' }],
      questions: [
        {
          question_index: 0,
          question: 'When is the meeting?',
          options: ['Monday', 'Tuesday', 'Friday'],
          correct_index: 1,
        },
        { question_index: 1, question: 'Who called?', options: ['Ana', 'Bo'], correct_index: 0 },
      ],
    },
  ],
} as never;

describe('Listening / Reading review', () => {
  it('shows wrong answers first with the lock where a free account has no explanation, and the transcript', () => {
    render(
      <McqResultTab
        result={mcqResult({ part_0_q_0: 0, part_0_q_1: 0 })}
        examContent={content}
        yourAnswerLabel="your answer"
        celpipExplanations={{ part_0_q_0: { locked: true } }}
        listeningAudio={{ '0': 'https://example.test/part1.mp3' }}
        sessionId="s1"
      />,
    );
    expect(screen.getByText('When is the meeting?')).toBeInTheDocument();
    expect(screen.queryByText('Who called?')).toBeNull(); // answered right: waits on the Right tab
    expect(screen.getByText('results.tcfHelp.lockedExplanation')).toBeInTheDocument();
    // the item's own recording can be replayed
    expect(document.querySelector('audio')?.getAttribute('src')).toBe(
      'https://example.test/part1.mp3',
    );
    fireEvent.click(screen.getByText('results.reviewTabs.right'));
    expect(screen.getByText('Who called?')).toBeInTheDocument();
  });

  it('a locked result says once where the recordings and transcripts are', () => {
    render(
      <McqResultTab
        result={mcqResult({ part_0_q_0: 0 })}
        examContent={content}
        yourAnswerLabel="your answer"
        reviewLocked
        reviewLockedText="Recordings and transcripts are in full results"
      />,
    );
    expect(screen.getAllByText('Recordings and transcripts are in full results')).toHaveLength(1);
  });
});

const speakingResult = (task: Record<string, unknown>): SectionResult =>
  ({
    section_type: 'speaking',
    section_index: 3,
    status: 'scored',
    clb_score: 1,
    raw_score: null,
    max_raw_score: null,
    time_spent_sec: 5,
    answers: { task_0: 'x' },
    transcripts: { task_0: '' },
    ai_feedback: { tasks: [{ task_index: 0, clb_score: 1, criteria: {}, ...task }] },
    recording_paths: { task_0: 'u/celpip/s/task_0.wav' },
  }) as SectionResult;

describe('Speaking review', () => {
  it('says plainly that nothing was heard, instead of only the examiner critique', () => {
    render(
      <AiInsightTab result={speakingResult({ no_speech: true })} sessionId="s" taskLabel="Task" />,
    );
    expect(screen.getByText('results.noSpeechTitle')).toBeInTheDocument();
    expect(screen.getByText('results.noSpeechBody')).toBeInTheDocument();
  });

  it('a result not read in full gets one lock note on the answer tab, and no recording player', () => {
    render(
      <AiInsightTab
        result={speakingResult({})}
        sessionId="s"
        taskLabel="Task"
        mediaLocked={true}
      />,
    );
    fireEvent.click(screen.getByText('results.viewAnswer'));
    expect(screen.getByText('results.proOnlyMedia')).toBeInTheDocument();
  });
});

describe('skill profile (coverage-weighted)', () => {
  const session = (over: Partial<ExamSession>): ExamSession =>
    ({
      id: 'a',
      exam_type: 'celpip',
      status: 'completed',
      mode: 'practice',
      current_section: 4,
      listening_score: null,
      reading_score: null,
      writing_score: null,
      speaking_score: null,
      m_score: null,
      started_at: null,
      completed_at: null,
      created_at: '2026-10-01T00:00:00Z',
      ...over,
    }) as ExamSession;

  it('a partial practice weakens the confidence, not the score, and the overall is a ceiling', () => {
    const profile = buildSkillProfile([
      session({ reading_score: 9, practice_config: { reading: [0] } as never }),
    ]);
    expect(profile.reading.estimate).toBe(9);
    expect(profile.reading.partsDone).toBe(1);
    expect(profile.reading.partsTotal).toBe(4);
    const overall = overallEstimate(profile);
    expect(overall.bound).toBe('upper');
    expect(overall.missing).toContain('listening');
  });

  it('renders the "≤" only while a skill is unmeasured', () => {
    const partial = [session({ reading_score: 8 })];
    const { container, rerender } = render(<SkillProfileCard sessions={partial} />);
    expect(container.textContent).toContain('≤');
    rerender(
      <SkillProfileCard
        sessions={[
          session({
            mode: 'exam',
            listening_score: 8,
            reading_score: 8,
            writing_score: 7,
            speaking_score: 7,
            m_score: 7,
          }),
        ]}
      />,
    );
    expect(container.textContent).not.toContain('≤');
  });
});
