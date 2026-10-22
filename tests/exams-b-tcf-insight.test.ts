import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
  convertFileSrc: (p: string) => p,
}));
import { invoke } from '@tauri-apps/api/core';
import {
  buildSkillContext,
  localInsightProvider,
  tcfLevelNote,
} from '@/pages/celpip/hooks/insightProviders';
import { getExamProfile } from '@/pages/celpip/examProfiles';
import type { ExamResults } from '@/pages/celpip/types';
import { readFileSync, readdirSync } from 'node:fs';

const tcfResults = (exam_type = 'tcf'): ExamResults =>
  ({
    session: { id: 's1', exam_type, m_score: null },
    section_results: [
      {
        section_type: 'listening',
        status: 'scored',
        clb_score: 7,
        raw_score: 412,
        max_raw_score: 699,
        answers: { part_0_q_0: 1, part_1_q_0: 0, part_2_q_0: 2 },
      },
      {
        section_type: 'writing',
        status: 'scored',
        clb_score: null,
        raw_score: 14,
        max_raw_score: 20,
        answers: { task_0: 'Bonjour' },
        transcripts: null,
        ai_feedback: {
          tasks: [{ task_index: 1, clb_score: 0, score: 14, criteria: {}, comment: 'ok' }],
        },
      },
    ],
    // TCF items: one question per part; part_index is the content's own number, NOT the answer-key position.
    exam_set: {
      listening_content: {
        parts: [
          {
            part_index: 7,
            questions: [
              { question_index: 0, question: 'Q1 ?', options: ['a', 'b'], correct_index: 1 },
            ],
          },
          {
            part_index: 8,
            questions: [
              { question_index: 0, question: 'Q2 ?', options: ['a', 'b'], correct_index: 1 },
            ],
          },
          {
            part_index: 9,
            questions: [
              { question_index: 0, question: 'Q3 ?', options: ['a', 'b', 'c'], correct_index: 2 },
            ],
          },
        ],
      },
      reading_content: null,
    },
  }) as unknown as ExamResults;

describe("TCF insight through the user's own AI", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it('is switched on for the whole TCF family, never CELPIP-only', () => {
    for (const t of ['tcf', 'tcf_quebec', 'tcf_irn'])
      expect(getExamProfile(t).features.insight).toBe(true);
    expect(getExamProfile('celpip').features.insight).toBe(true);
  });

  it('sends only the wrong items, keyed by position in the session', () => {
    const ctx = JSON.parse(buildSkillContext(tcfResults(), 'listening'));
    // item 2 (position 1) is the only miss; the content's own part_index (8) is not the key
    expect(ctx.wrong_answers).toHaveLength(1);
    expect(ctx.wrong_answers[0]).toMatchObject({
      part_index: 1,
      question_index: 0,
      user_choice: 'a',
      correct_choice: 'b',
    });
  });

  it('says the official result in a sentence so feedback cannot contradict it', () => {
    expect(tcfLevelNote(tcfResults(), 'listening')).toBe('NCLC 7, raw score 412 out of 699');
    expect(tcfLevelNote(tcfResults('tcf_quebec'), 'writing')).toBe('raw score 14 out of 20');
    expect(tcfLevelNote(tcfResults(), 'speaking')).toBeNull();
  });

  it('asks Rust for TCF-aware prompts, with the exam type and the level note', async () => {
    vi.mocked(invoke).mockResolvedValue('{"wrong_count":1}' as never);
    const provider = localInsightProvider('s1', tcfResults(), 'device');
    await provider.generate('listening');
    const [cmd, args] = vi.mocked(invoke).mock.calls[0] as [string, Record<string, unknown>];
    expect(cmd).toBe('celpip_generate_local_insight');
    expect(args.examType).toBe('tcf');
    expect(args.levelNote).toBe('NCLC 7, raw score 412 out of 699');
    expect(args.skill).toBe('listening');
  });

  it('a CELPIP session sends no level note (its prompts use the CLB)', async () => {
    vi.mocked(invoke).mockResolvedValue('{}' as never);
    await localInsightProvider('s2', tcfResults('celpip'), 'device').generate('listening');
    const args = vi.mocked(invoke).mock.calls[0][1] as Record<string, unknown>;
    expect(args.examType).toBe('celpip');
    expect(args.levelNote).toBeNull();
  });
});

describe('exam / celpip texts exist in all six languages', () => {
  const LOCALES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh'];
  const flat = (o: Record<string, unknown>, p = '', r: Record<string, string> = {}) => {
    for (const [k, v] of Object.entries(o))
      typeof v === 'object' && v !== null && !Array.isArray(v)
        ? flat(v as Record<string, unknown>, `${p}${k}.`, r)
        : (r[p + k] = String(v));
    return r;
  };
  const load = (l: string, ns: string) =>
    flat(JSON.parse(readFileSync(`src/i18n/locales/${l}/${ns}.json`, 'utf8')));

  it('every key of the English exam / celpip files has a translation, ', () => {
    for (const ns of ['exam', 'celpip']) {
      const en = load('en', ns);
      for (const l of LOCALES.slice(1)) {
        const other = load(l, ns);
        // plural forms differ per language; compare the base key
        const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
        const have = new Set(Object.keys(other).map(base));
        const missing = Object.keys(en).filter((k) => !have.has(base(k)));
        expect(missing, `${ns}/${l} lacks ${missing.slice(0, 8).join(', ')}`).toEqual([]);
      }
    }
  });

  it('has no typed-answer fallback wording left in the microphone copy', () => {
    for (const l of LOCALES) {
      expect(load(l, 'celpip')['errors.MIC_PERMISSION_DENIED']).toBeDefined();
    }
    expect(load('en', 'celpip')['errors.MIC_PERMISSION_DENIED']).not.toMatch(/type/i);
    expect(readdirSync('src/i18n/locales/en').includes('exam.json')).toBe(true);
  });
});

describe('cached local insights keyed by the old numbers', () => {
  it('ignores an old Listening/Reading row, keeps a current one and every other skill', async () => {
    const { isStaleMcqRow } = await import('@/pages/celpip/hooks/insightProviders');
    const old = { status: 'ready', result: '{"wrong_count":1}' };
    expect(isStaleMcqRow('listening', old)).toBe(true);
    expect(isStaleMcqRow('reading', { status: 'ready', result: 'garbled' })).toBe(true);
    expect(isStaleMcqRow('reading', { status: 'ready', result: '{"_v":2}' })).toBe(false);
    expect(isStaleMcqRow('writing', old)).toBe(false);
    expect(isStaleMcqRow('listening', { status: 'generating', result: null })).toBe(false);
  });
});
