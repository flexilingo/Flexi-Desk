import { describe, it, expect } from 'vitest';
import {
  CEFR_LEVELS,
  TCF_ITEM_BANDS,
  cefrIndexFromRaw,
  cefrOverallIndex,
  examBase,
  formatBand,
  getExamProfile,
  isSupportedExamType,
  quebecPointsFor,
  sectionClockSeconds,
} from '@/pages/celpip/examProfiles';
import { scaleFromProfile } from '@/pages/celpip/results/shared';
import {
  accrueTcfClock,
  initialTimeLeft,
  restoreTcfClock,
  resumeAudio,
  tcfTimeLeft,
} from '@/pages/celpip/utils/examClocks';

/**
 * The exam-profile layer: one table of what differs per exam type. CELPIP's entry
 * must reproduce what the desk engine did before profiles existed.
 */

describe('profile resolution', () => {
  it('knows the four exam types and falls back to CELPIP for anything else', () => {
    for (const t of ['celpip', 'tcf', 'tcf_quebec', 'tcf_irn'])
      expect(isSupportedExamType(t)).toBe(true);
    expect(isSupportedExamType('toefl')).toBe(false);
    expect(getExamProfile('toefl').examType).toBe('celpip');
    expect(getExamProfile(undefined).examType).toBe('celpip');
    expect(getExamProfile(null).examType).toBe('celpip');
    expect(getExamProfile('tcf_quebec').examType).toBe('tcf_quebec');
  });

  it('keeps CELPIP exactly as it was: parts, 55-minute clocks, CLB, learning mode', () => {
    const p = getExamProfile('celpip');
    expect(p.ns).toBe('celpip');
    expect(p.listeningMode).toBe('parts');
    expect(p.readingMode).toBe('parts');
    expect(p.writingClock).toBe('per_task');
    expect(p.sectionTimeLimitSec.listening).toBe(55 * 60);
    expect(p.sectionTimeLimitSec.reading).toBe(55 * 60);
    expect(p.sectionPartCount).toEqual({ listening: 6, reading: 4, writing: 2, speaking: 8 });
    expect(p.band).toMatchObject({ label: 'CLB', max: 12, kind: 'number' });
    expect(p.taskIndexBase).toBe(0);
    expect(p.recordingSegment).toBe('celpip');
    expect(p.contentLang).toBe('en');
    expect(p.features).toEqual({
      practice: true,
      learning: true,
      coach: true,
      insight: true,
      vocab: true,
    });
    expect(p.practiceParts).toBeUndefined();
  });

  it('runs TCF Canada as items with a shared writing clock, in French, without learning mode', () => {
    const p = getExamProfile('tcf');
    expect(p.ns).toBe('exam');
    expect(p.listeningMode).toBe('items');
    expect(p.readingMode).toBe('items');
    expect(p.writingClock).toBe('shared');
    expect(p.speakingStartsWithoutPrep).toBe(true);
    expect(p.sectionTimeLimitSec).toEqual({
      listening: 35 * 60,
      reading: 60 * 60,
      writing: 60 * 60,
      speaking: null,
    });
    expect(p.sectionPartCount).toEqual({ listening: 39, reading: 39, writing: 3, speaking: 3 });
    expect(p.totalMinutes).toBe(167);
    expect(p.taskIndexBase).toBe(1);
    expect(p.recordingSegment).toBe('tcf');
    expect(p.contentLang).toBe('fr');
    expect(p.rawScoreMax).toEqual({ listening: 699, reading: 699, writing: 20, speaking: 20 });
    expect(p.band).toMatchObject({ label: 'NCLC', min: 3, max: 10, belowTableValue: 3 });
    expect(p.features.learning).toBe(false);
    // Insight runs on the user's own AI with TCF-aware prompts (the cloud has none for TCF).
    expect(p.features.insight).toBe(true);
    expect(p.features.vocab).toBe(false);
    expect(p.hubStatus).toBe('available');
  });

  it('inherits the paper for Québec but reports a CEFR level and the province points', () => {
    const p = getExamProfile('tcf_quebec');
    expect(p.sectionTimeLimitSec).toEqual(getExamProfile('tcf').sectionTimeLimitSec);
    expect(p.recordingSegment).toBe('tcf_quebec');
    expect(p.band.kind).toBe('level');
    expect(p.cefrIndexFromRaw).toBeTypeOf('function');
    expect(p.quebecPoints?.max).toBe(16);
    expect(getExamProfile('tcf').quebecPoints).toBeUndefined();
  });

  it('gives IRN its own shorter paper and keeps it "coming soon" like the web', () => {
    const p = getExamProfile('tcf_irn');
    expect(p.sectionTimeLimitSec).toEqual({
      listening: 20 * 60,
      reading: 35 * 60,
      writing: 30 * 60,
      speaking: null,
    });
    expect(p.sectionPartCount).toEqual({ listening: 25, reading: 25, writing: 3, speaking: 3 });
    expect(p.rawScoreMax.listening).toBe(499);
    expect(p.recordingSegment).toBe('tcf_irn');
    expect(p.hubStatus).toBe('comingSoon');
    expect(p.features.practice).toBe(false);
    expect(p.quebecPoints).toBeUndefined();
  });

  it('routes every exam under /exam/:type', () => {
    expect(examBase('tcf')).toBe('/exam/tcf');
    expect(examBase('tcf_quebec')).toBe('/exam/tcf_quebec');
    expect(examBase('nope')).toBe('/exam/celpip');
  });
});

describe('practice clocks (a slice gets the same pace for what it holds)', () => {
  const tcf = getExamProfile('tcf');
  const celpip = getExamProfile('celpip');

  it('a full sitting uses the whole section clock', () => {
    expect(sectionClockSeconds(tcf, 'listening', false, 10)).toBe(35 * 60);
    expect(sectionClockSeconds(tcf, 'reading', false, 39)).toBe(60 * 60);
  });

  it('ten CO items out of 39 get about nine minutes', () => {
    const sec = sectionClockSeconds(tcf, 'listening', true, 10);
    expect(sec).toBe(Math.round((35 * 60 * 10) / 39));
    expect(Math.round(sec / 60)).toBe(9);
  });

  it('a practice holding the whole paper keeps the full clock', () => {
    expect(sectionClockSeconds(tcf, 'reading', true, 39)).toBe(60 * 60);
    expect(sectionClockSeconds(tcf, 'reading', true, 40)).toBe(60 * 60);
  });

  it('never drops below a minute', () => {
    expect(sectionClockSeconds(tcf, 'listening', true, 1)).toBe(60);
  });

  it('one writing task out of three gets a third of the shared clock', () => {
    expect(sectionClockSeconds(tcf, 'writing', true, 1)).toBe(20 * 60);
  });

  it('IRN slices run on IRN numbers', () => {
    expect(sectionClockSeconds(getExamProfile('tcf_irn'), 'listening', true, 5)).toBe(4 * 60);
  });

  it('CELPIP counts parts, so a one-part practice is a slice, not the whole 55 minutes', () => {
    expect(sectionClockSeconds(celpip, 'reading', true, 1)).toBe(Math.round((55 * 60) / 4));
    expect(sectionClockSeconds(celpip, 'listening', true, 6)).toBe(55 * 60);
  });

  it('a clockless section (speaking, CELPIP writing) stays at 0', () => {
    expect(sectionClockSeconds(tcf, 'speaking', true, 1)).toBe(0);
    expect(sectionClockSeconds(celpip, 'writing', true, 1)).toBe(0);
  });
});

describe('TCF practice picker', () => {
  it('offers the four listening/reading bands from A1–A2 to C1–C2', () => {
    const labels = TCF_ITEM_BANDS.map((b) => b.label);
    expect(labels).toEqual([
      'Questions 1–10 · A1–A2',
      'Questions 11–19 · B1',
      'Questions 20–29 · B2',
      'Questions 30–39 · C1–C2',
    ]);
  });

  it('maps a band to the items it holds, covering 1–39 exactly once', () => {
    expect(TCF_ITEM_BANDS[1].partIndices).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const all = TCF_ITEM_BANDS.flatMap((b) => b.partIndices);
    expect(all).toEqual(Array.from({ length: 39 }, (_, i) => i + 1));
  });

  it('offers Tâche 1/2/3 for writing and speaking, each its own part_index', () => {
    const p = getExamProfile('tcf').practiceParts!;
    expect(p.writing.map((c) => c.partIndices)).toEqual([[1], [2], [3]]);
    expect(p.speaking.map((c) => c.partIndices)).toEqual([[1], [2], [3]]);
    expect(p.writing[0].label).toContain('Tâche 1');
  });
});

describe('score display', () => {
  it('writes TCF Canada\'s below-table value as "< 4" and others as numbers', () => {
    const p = getExamProfile('tcf');
    expect(formatBand(p, 3)).toBe('< 4');
    expect(formatBand(p, 4)).toBe('4');
    expect(formatBand(p, 10)).toBe('10');
    expect(formatBand(p, null)).toBe('–');
    expect(formatBand(getExamProfile('celpip'), 9)).toBe('9');
  });

  it("writes a CEFR exam's level as its letter", () => {
    const p = getExamProfile('tcf_quebec');
    expect(formatBand(p, 0)).toBe('A1');
    expect(formatBand(p, 3)).toBe('B2');
    expect(formatBand(p, 5)).toBe('C2');
  });

  it("derives the CEFR level from FEI's official grid", () => {
    expect(cefrIndexFromRaw('listening', 100)).toBeNull(); // A1 non atteint
    expect(cefrIndexFromRaw('listening', 101)).toBe(0);
    expect(cefrIndexFromRaw('reading', 199)).toBe(0);
    expect(cefrIndexFromRaw('reading', 200)).toBe(1);
    expect(cefrIndexFromRaw('listening', 399)).toBe(2);
    expect(cefrIndexFromRaw('listening', 400)).toBe(3);
    expect(cefrIndexFromRaw('listening', 600)).toBe(5);
    expect(cefrIndexFromRaw('listening', 699)).toBe(5);
    expect(cefrIndexFromRaw('writing', 0)).toBeNull();
    expect(cefrIndexFromRaw('writing', 1)).toBe(0);
    expect(cefrIndexFromRaw('speaking', 5)).toBe(1);
    expect(cefrIndexFromRaw('speaking', 6)).toBe(2);
    expect(cefrIndexFromRaw('speaking', 14)).toBe(4);
    expect(cefrIndexFromRaw('speaking', 18)).toBe(5);
    expect(cefrIndexFromRaw('speaking', null)).toBeNull();
  });

  it('takes the LOWEST level for the whole sitting, and nothing when a skill is below A1', () => {
    expect(cefrOverallIndex([3, 4, 2, 5])).toBe(2);
    expect(cefrOverallIndex([3, null])).toBeNull();
    expect(cefrOverallIndex([])).toBeNull();
  });

  it('scores Québec points from the level each skill reached (max 16)', () => {
    const table = getExamProfile('tcf_quebec').quebecPoints!;
    // B2 listening (5) + C1 speaking (6) + B2 reading (1) + A2 writing (0)
    const points = [
      quebecPointsFor(table, 'listening', 3),
      quebecPointsFor(table, 'speaking', 4),
      quebecPointsFor(table, 'reading', 3),
      quebecPointsFor(table, 'writing', 1),
    ];
    expect(points).toEqual([5, 6, 1, 0]);
    // The best possible sitting: C2 everywhere = 7 + 7 + 1 + 1... capped by the grid at 16.
    const best = (['listening', 'speaking', 'reading', 'writing'] as const)
      .map((k) => quebecPointsFor(table, k, 5) ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(best).toBe(16);
    expect(quebecPointsFor(table, 'reading', null)).toBeNull();
  });

  it('builds the right scale per exam', () => {
    const celpip = scaleFromProfile(getExamProfile('celpip'));
    expect(celpip.bandLabel).toBe('CLB');
    expect(celpip.bandMax).toBe(12);
    expect(celpip.itemsMode).toBe(false);
    expect(celpip.taskIndexBase).toBe(0);

    const canada = scaleFromProfile(getExamProfile('tcf'));
    expect(canada.bandLabel).toBe('NCLC');
    expect(canada.bandMax).toBe(10);
    expect(canada.format(3)).toBe('< 4');
    expect(canada.format(7)).toBe('7');
    expect(canada.rawMax.listening).toBe(699);
    expect(canada.rawMax.writing).toBe(20);
    expect(canada.criterionMax).toBe(20);
    expect(canada.taskIndexBase).toBe(1);
    expect(canada.itemsMode).toBe(true);
    expect(canada.contentLang).toBe('fr');

    const quebec = scaleFromProfile(getExamProfile('tcf_quebec'));
    expect(quebec.bandKind).toBe('level');
    expect(quebec.format(3)).toBe('B2');
    expect(quebec.bandMax).toBe(CEFR_LEVELS.length - 1);
  });
});

describe('TCF listening clock (stands still while a recording plays)', () => {
  const T0 = 1_000_000_000_000;

  it('runs only while the candidate answers', () => {
    let clock = restoreTcfClock(null, T0);
    clock = accrueTcfClock(clock, T0 + 60_000, true); // a minute of recording
    clock = accrueTcfClock(clock, T0 + 90_000, false); // 30 s answering
    expect(tcfTimeLeft(clock, 35 * 60)).toBe(35 * 60 - 30);
  });

  it('credits a throttled tab by timestamp, not by ticks', () => {
    let clock = restoreTcfClock(null, T0);
    clock = accrueTcfClock(clock, T0 + 5 * 60_000, true);
    expect(tcfTimeLeft(clock, 35 * 60)).toBe(35 * 60);
  });

  it('restores from a draft: wall clock minus the time it stood still', () => {
    const clock = restoreTcfClock({ sectionStartedAt: T0, pausedSec: 120 }, T0 + 600_000);
    expect(tcfTimeLeft(clock, 35 * 60)).toBe(35 * 60 - (600 - 120));
  });

  it('never goes below zero', () => {
    const clock = accrueTcfClock(restoreTcfClock(null, T0), T0 + 99 * 60_000, false);
    expect(tcfTimeLeft(clock, 35 * 60)).toBe(0);
  });
});

describe('resume clocks and audio', () => {
  const now = 2_000_000_000_000;

  it('a practice only counts the time spent in the section', () => {
    const draft = { sectionStartedAt: now - 3 * 3600_000, activeSec: 100 };
    expect(initialTimeLeft(draft, 3600, true, now)).toBe(3500);
  });

  it('a full sitting keeps the wall clock', () => {
    const draft = { sectionStartedAt: now - 600_000, activeSec: 5 };
    expect(initialTimeLeft(draft, 3600, false, now)).toBe(3000);
  });

  it('opens a fresh section on the full limit', () => {
    expect(initialTimeLeft(null, 3600, true, now)).toBe(3600);
  });

  it('picks a cut-off recording up two seconds earlier, only for the same item', () => {
    expect(resumeAudio({ partIndex: 4, audio: { partIndex: 4, pos: 20, done: false } })).toEqual({
      startAt: 18,
      done: false,
    });
    expect(resumeAudio({ partIndex: 5, audio: { partIndex: 4, pos: 20, done: false } })).toEqual({
      startAt: 0,
      done: false,
    });
    expect(resumeAudio({ partIndex: 4, audio: { partIndex: 4, pos: 0, done: true } })).toEqual({
      startAt: 0,
      done: true,
    });
    expect(resumeAudio(null)).toEqual({ startAt: 0, done: false });
  });
});
