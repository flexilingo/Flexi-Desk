import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The TCF flows on top of the exam-profile engine: the start dialog (practice
 * default, band/task picker, single-task tap), the shared-clock Writing section
 * with free navigation, Speaking tasks with no preparation time, and the score
 * display. `t` echoes the key (and its options) so assertions read the contract.
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const { invokeMock, callMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => null),
  callMock: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: callMock }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) =>
      opts && typeof opts === 'object' && Object.keys(opts as object).some((k) => k !== 'ns' && k !== 'defaultValue')
        ? `${key}${JSON.stringify(opts)}`
        : key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { StartExamDialog } from '@/pages/celpip/components/landing/StartExamDialog';
import { TcfWritingSection } from '@/pages/celpip/components/session/tcf/TcfWritingSection';
import SpeakingSection from '@/pages/celpip/components/session/sections/SpeakingSection';
import { HeroScoreCard } from '@/pages/celpip/results/HeroScoreCard';
import { QuebecPointsCard } from '@/pages/celpip/results/QuebecPointsCard';
import { getExamProfile } from '@/pages/celpip/examProfiles';
import { scaleFromProfile } from '@/pages/celpip/results/shared';
import type { SpeakingPrompts, WritingPrompts } from '@/pages/celpip/types';

beforeEach(() => {
  invokeMock.mockClear();
  callMock.mockClear();
  invokeMock.mockImplementation(async () => null);
  callMock.mockImplementation(async () => ({ session_id: undefined }));
});

const openDialog = (examType: string, preselect?: { section: 'listening' | 'reading' | 'writing' | 'speaking'; partIndex?: number }) =>
  render(
    <MemoryRouter>
      <StartExamDialog open onClose={() => {}} examType={examType} preselect={preselect} />
    </MemoryRouter>,
  );

const startCalls = () =>
  callMock.mock.calls.filter((c) => String(c[1]).includes('action=start_practice') || String(c[1]).includes('action=assemble_exam'));

describe('TCF start dialog', () => {
  it('opens on practice, with the recommended mark and a duration on the full exam', () => {
    openDialog('tcf');
    expect(screen.getByText('modeRecommended')).toBeTruthy();
    expect(screen.getByText('choosePracticeSections')).toBeTruthy();
    // practice first, full exam second
    const modes = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((text) => text.includes('modePracticeDesc') || text.includes('modeFullDesc'));
    expect(modes[0]).toContain('practice');
    expect(modes[1]).toContain('fullExam');
    expect(modes[1]).toContain('tcf.durationShort');
  });

  it('has no learning switch for TCF', () => {
    openDialog('tcf');
    expect(screen.queryAllByRole('switch').filter((e) => e.textContent?.includes('untimedMode'))).toHaveLength(0);
  });

  it('offers the TCF bands and sends the picked band\'s items to start_practice', async () => {
    openDialog('tcf');
    expect(screen.getByText('Questions 1–10 · A1–A2')).toBeTruthy();
    expect(screen.getByText('Questions 30–39 · C1–C2')).toBeTruthy();
    fireEvent.click(screen.getByText('Questions 11–19 · B1'));
    fireEvent.click(screen.getByText(/startPracticeOf/));
    await waitFor(() => expect(startCalls()).toHaveLength(1));
    const call = startCalls()[0];
    expect(String(call[1])).toContain('action=start_practice');
    expect(call[2]).toMatchObject({
      exam_type: 'tcf',
      sections: { listening: [11, 12, 13, 14, 15, 16, 17, 18, 19] },
    });
    expect(call[2]).not.toHaveProperty('learning_mode');
  });

  it('opened on a whole section, the first tap on a task practises just that task', async () => {
    openDialog('tcf', { section: 'writing' });
    // every Tâche is ticked: the whole section runs if Start is pressed now
    expect(screen.getByText('Tâche 2 — Article ou courrier')).toBeTruthy();
    fireEvent.click(screen.getByText('Tâche 2 — Article ou courrier'));
    fireEvent.click(screen.getByText(/startPracticeOf/));
    await waitFor(() => expect(startCalls()).toHaveLength(1));
    expect(startCalls()[0][2]).toMatchObject({ exam_type: 'tcf', sections: { writing: [2] } });
  });

  it('opened on one task, starts exactly that task', async () => {
    openDialog('tcf', { section: 'speaking', partIndex: 2 });
    fireEvent.click(screen.getByText(/startPracticeOf/));
    await waitFor(() => expect(startCalls()).toHaveLength(1));
    expect(startCalls()[0][2]).toMatchObject({ sections: { speaking: [3] } });
  });

  it('starts a full TCF Québec exam through assemble_exam with its own exam type', async () => {
    openDialog('tcf_quebec');
    const full = screen.getAllByRole('button').find((b) => b.textContent?.includes('modeFullDesc'))!;
    fireEvent.click(full);
    fireEvent.click(screen.getByText('startExam'));
    await waitFor(() => expect(startCalls()).toHaveLength(1));
    expect(String(startCalls()[0][1])).toContain('action=assemble_exam');
    expect(startCalls()[0][2]).toMatchObject({ exam_type: 'tcf_quebec' });
  });

  it('keeps CELPIP\'s named parts and learning switch', async () => {
    openDialog('celpip');
    expect(screen.getByText('Part 4 — News Item')).toBeTruthy();
    expect(screen.getAllByRole('switch').some((e) => e.textContent?.includes('untimedMode'))).toBe(true);
    fireEvent.click(screen.getByText('Part 4 — News Item'));
    fireEvent.click(screen.getByText(/startPracticeOf/));
    await waitFor(() => expect(startCalls()).toHaveLength(1));
    // CELPIP's choice position IS its part_index
    expect(startCalls()[0][2]).toMatchObject({ exam_type: 'celpip', sections: { listening: [3] } });
  });
});

const writing: WritingPrompts = {
  tasks: [
    { task_index: 1, title: 'Task A', prompt: 'p1', time_limit_minutes: 60, word_limit_min: 60, word_limit_max: 120 },
    { task_index: 2, title: 'Task B', prompt: 'p2', time_limit_minutes: 60, word_limit_min: 120, word_limit_max: 150 },
    { task_index: 3, title: 'Task C', prompt: 'p3', time_limit_minutes: 60, word_limit_min: 120, word_limit_max: 180 },
  ],
};

describe('TCF writing — one shared clock, free navigation', () => {
  it('shows one clock for all three tasks and moves between them freely', async () => {
    render(
      <TcfWritingSection
        sessionId="s1"
        prompts={writing}
        timeLimitSec={3600}
        onSubmit={() => {}}
        isSubmitting={false}
      />,
    );
    const clock = await screen.findByTestId('tcf-clock');
    expect(clock.textContent).toMatch(/^(60:00|59:5\d)$/);
    expect(screen.getAllByTestId('tcf-clock')).toHaveLength(1);

    // type into task 1, jump straight to task 3, come back: the text is kept
    const box = () => screen.getByPlaceholderText('tcf.writingPlaceholder') as HTMLTextAreaElement;
    fireEvent.change(box(), { target: { value: 'Bonjour tout le monde' } });
    fireEvent.click(screen.getByText('task 3'));
    expect(screen.getByText('Task C')).toBeTruthy();
    expect(box().value).toBe('');
    fireEvent.click(screen.getByText('task 1'));
    expect(box().value).toBe('Bonjour tout le monde');
    // the clock did not restart on navigation
    expect(screen.getAllByTestId('tcf-clock')).toHaveLength(1);
  });

  it('reopens from a draft with its task, text and the time it had (practice pauses while away)', async () => {
    const draft = {
      partIndex: 0,
      currentQuestion: 0,
      taskIndex: 1,
      answers: { task_1: 'Un brouillon' },
      sectionStartedAt: Date.now() - 3 * 3600_000,
      activeSec: 600,
    };
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'celpip_load_draft' ? JSON.stringify(draft) : null));
    const onSubmit = vi.fn();
    render(
      <TcfWritingSection
        sessionId="s2"
        prompts={writing}
        timeLimitSec={3600}
        pauseClockWhileAway
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );
    const clock = await screen.findByTestId('tcf-clock');
    expect(clock.textContent).toMatch(/^(50:00|49:5\d)$/);
    expect((screen.getByPlaceholderText('tcf.writingPlaceholder') as HTMLTextAreaElement).value).toBe('Un brouillon');
    // an hours-old practice is NOT submitted blank the instant it opens
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

const speaking = (prep: number): SpeakingPrompts => ({
  tasks: [
    {
      task_index: 1,
      type: 'tcf_interview',
      title: 'Entretien dirigé',
      prompt: '',
      consigne: 'Présentez-vous.',
      guiding_questions: ['Quel est votre métier ?'],
      prep_seconds: prep,
      speaking_seconds: 120,
    },
  ],
});

describe('TCF speaking', () => {
  it('a task with no preparation time starts recording at once, in the exam folder\'s language', async () => {
    render(<SpeakingSection sessionId="s3" prompts={speaking(0)} startWithoutPrep contentLang="fr" recordingSegment="tcf" />);
    await waitFor(() => expect(invokeMock.mock.calls.some((c) => c[0] === 'celpip_record_start')).toBe(true));
    expect(screen.getByText('Présentez-vous.')).toBeTruthy();
    expect(screen.getByText('Quel est votre métier ?')).toBeTruthy();
    expect(screen.queryByText('speakingPreparing')).toBeNull();
  });

  it('a task with preparation time counts it down first', async () => {
    render(<SpeakingSection sessionId="s4" prompts={speaking(120)} startWithoutPrep contentLang="fr" recordingSegment="tcf" />);
    await screen.findByText('speakingPreparing');
    expect(invokeMock.mock.calls.some((c) => c[0] === 'celpip_record_start')).toBe(false);
  });

  it('CELPIP (no startWithoutPrep) still waits out a zero countdown the old way', async () => {
    render(<SpeakingSection sessionId="s5" prompts={speaking(0)} />);
    await screen.findByText('speakingPreparing');
  });
});

describe('score display', () => {
  const props = {
    totalTimeSec: null,
    avg: null,
    mScoreLabel: 'label',
    levelLabel: null,
    vsAvgPositive: () => '',
    vsAvgNegative: () => '',
    vsAvgEqual: '',
  };

  it('TCF Canada: an NCLC band out of 10', () => {
    const { container } = render(<HeroScoreCard {...props} score={7} scale={scaleFromProfile(getExamProfile('tcf'))} />);
    expect(container.textContent).toContain('7');
    expect(container.textContent).toContain('/ 10 NCLC');
  });

  it('TCF Canada: the below-table value reads "< 4"', () => {
    const { container } = render(<HeroScoreCard {...props} score={3} scale={scaleFromProfile(getExamProfile('tcf'))} />);
    expect(container.textContent).toContain('< 4');
  });

  it('TCF Québec: a CEFR letter with no denominator', () => {
    const { container } = render(<HeroScoreCard {...props} score={3} scale={scaleFromProfile(getExamProfile('tcf_quebec'))} />);
    expect(container.textContent).toContain('B2');
    expect(container.textContent).toContain('CEFR');
    expect(container.textContent).not.toContain('/ 5');
    expect(container.textContent).not.toContain('NCLC');
  });

  it('CELPIP: still "/ 12 CLB"', () => {
    const { container } = render(<HeroScoreCard {...props} score={9} />);
    expect(container.textContent).toContain('9');
    expect(container.textContent).toContain('/ 12 CLB');
  });

  it('a practice slice with no level shows right answers out of the items sat', () => {
    const { container } = render(
      <HeroScoreCard {...props} score={null} scale={scaleFromProfile(getExamProfile('tcf'))} count={{ correct: 6, total: 10, label: 'correct' }} />,
    );
    expect(container.textContent).toContain('6/10');
  });

  it('the Québec card lists each skill\'s level and points with the source', () => {
    const { container } = render(
      <QuebecPointsCard
        rows={[
          { skill: 'listening', label: 'CO', level: 'B2', points: 5 },
          { skill: 'reading', label: 'CE', level: 'B2', points: 1 },
          { skill: 'writing', label: 'EE', level: null, points: null },
        ]}
        total={6}
        max={16}
        source="Source: grid"
      />,
    );
    expect(container.textContent).toContain('tcfQuebec.pointsTotal{"total":6,"max":16}');
    expect(container.textContent).toContain('"points":5');
    expect(container.textContent).toContain('Source: grid');
    // a skill that was not sat stays blank rather than scoring 0
    expect(container.textContent).toContain('–');
  });
});
