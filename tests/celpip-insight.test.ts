import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn() }));

import {
  buildSkillContext,
  takenSectionsOf,
  localInsightProvider,
  InsightError,
} from '@/pages/celpip/hooks/insightProviders';
import type { ExamResults } from '@/pages/celpip/types';

/**
 * The local provider must be indistinguishable from the cloud's `?skill=status`
 * response, or the shared results UI silently renders nothing.
 */

function results(overrides: Partial<ExamResults> = {}): ExamResults {
  return {
    session: {
      id: 's1',
      user_id: 'u1',
      exam_type: 'celpip',
      status: 'completed',
      current_section: 4,
      listening_score: 8,
      reading_score: 9,
      writing_score: null,
      speaking_score: null,
      m_score: 8,
      started_at: null,
      completed_at: null,
      created_at: '',
    },
    section_results: [
      {
        section_type: 'listening',
        section_index: 0,
        status: 'scored',
        clb_score: 8,
        raw_score: 6,
        max_raw_score: 8,
        time_spent_sec: 100,
        answers: { part_0_q_0: 1, part_0_q_1: 0 },
        transcripts: null,
        ai_feedback: null,
      },
    ],
    exam_set: {
      listening_content: {
        parts: [
          {
            part_index: 0,
            title: 'Part 1',
            questions: [
              { question_index: 0, question: 'Q0?', options: ['A', 'B'], correct_index: 0 },
              { question_index: 1, question: 'Q1?', options: ['C', 'D'], correct_index: 0 },
            ],
          },
        ],
      },
      reading_content: { parts: [] },
    },
    ...overrides,
  } as ExamResults;
}

describe('celpip insight context', () => {
  it('counts only scored sections as taken', () => {
    expect(takenSectionsOf(results())).toEqual(['listening']);
  });

  it('sends the model ONLY the questions the user got wrong', () => {
    const ctx = JSON.parse(buildSkillContext(results(), 'listening'));
    // q0: picked 1, correct 0 -> wrong. q1: picked 0, correct 0 -> right.
    expect(ctx.wrong_answers).toHaveLength(1);
    expect(ctx.wrong_answers[0]).toMatchObject({
      question_index: 0,
      question_text: 'Q0?',
      user_choice: 'B',
      correct_choice: 'A',
    });
    expect(ctx.clb_score).toBe(8);
  });

  it('never marks an unanswered question as wrong', () => {
    const r = results();
    r.section_results[0].answers = {}; // nothing answered
    const ctx = JSON.parse(buildSkillContext(r, 'listening'));
    expect(ctx.wrong_answers).toEqual([]);
  });

  it('summary context carries the per-section scores and the overall CLB', () => {
    const ctx = JSON.parse(buildSkillContext(results(), 'summary'));
    expect(ctx.overall_clb).toBe(8);
    expect(ctx.section_scores).toEqual({ listening: 8 });
    expect(ctx.sections_taken).toEqual(['listening']);
  });
});

describe('local insight provider', () => {
  beforeEach(() => invoke.mockReset());

  it('reports untaken sections as not_taken, exactly like the cloud', async () => {
    invoke.mockResolvedValue([]);
    const status = await localInsightProvider('s1', results()).fetchStatus();

    expect(status.skills.listening).toBe('pending');
    expect(status.skills.reading).toBe('not_taken');
    expect(status.skills.writing).toBe('not_taken');
    expect(status.skills.speaking).toBe('not_taken');
    expect(status.taken_sections).toEqual(['listening']);
  });

  it('hydrates a stored fragment into the shared ExamInsight shape', async () => {
    invoke.mockResolvedValue([
      { skill: 'listening', status: 'ready', result: '{"wrong_count":1,"_v":2}', error: null },
    ]);
    const status = await localInsightProvider('s1', results()).fetchStatus();

    expect(status.skills.listening).toBe('ready');
    expect(status.insight.listening).toEqual({ wrong_count: 1, _v: 2 });
  });

  it('a corrupt cached row degrades to "not generated" rather than throwing', async () => {
    invoke.mockResolvedValue([
      { skill: 'listening', status: 'ready', result: 'not json', error: null },
    ]);
    const status = await localInsightProvider('s1', results()).fetchStatus();

    // unreadable (or from before answers were keyed by position): made again, never shown
    expect(status.skills.listening).toBe('pending');
    expect(status.insight.listening).toBeUndefined();
  });

  it('refuses to generate the summary before every taken skill is ready', async () => {
    invoke.mockResolvedValue([]); // nothing ready yet
    const provider = localInsightProvider('s1', results());

    await expect(provider.generate('summary')).rejects.toThrow(InsightError);
    await expect(provider.generate('summary')).rejects.toMatchObject({
      code: 'INSIGHT_SUMMARY_NOT_READY',
    });
    expect(invoke).not.toHaveBeenCalledWith('celpip_generate_local_insight', expect.anything());
  });

  it('generates the summary once the taken skills are ready', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'celpip_local_insight_all')
        return [{ skill: 'listening', status: 'ready', result: '{}', error: null }];
      if (cmd === 'celpip_generate_local_insight') return '{"summary":{},"improvement_plan":[]}';
      return [];
    });

    const out = await localInsightProvider('s1', results()).generate('summary');
    expect(out.result).toEqual({ summary: {}, improvement_plan: [] });
  });

  it('passes the awarded CLB so local feedback cannot contradict the cloud score', async () => {
    invoke.mockImplementation(async (cmd: string) =>
      cmd === 'celpip_generate_local_insight' ? '{}' : [],
    );

    await localInsightProvider('s1', results()).generate('listening');

    expect(invoke).toHaveBeenCalledWith(
      'celpip_generate_local_insight',
      expect.objectContaining({ sessionId: 's1', skill: 'listening', clbScore: 8 }),
    );
  });

  it('surfaces a Rust error code as an InsightError the UI can translate', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'celpip_generate_local_insight') throw 'MODEL_RETURNED_NO_JSON';
      return [];
    });

    await expect(localInsightProvider('s1', results()).generate('listening')).rejects.toMatchObject(
      { code: 'MODEL_RETURNED_NO_JSON' },
    );
  });
});
