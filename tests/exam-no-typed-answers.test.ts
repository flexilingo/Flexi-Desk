import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * "Continue with typed answers" in Speaking was removed on the web on 2026-10-20
 * (a mic problem is fixed with unblock steps, Try again and Skip — never by
 * typing the answer). Desk follows, and keeps its own offline recording + local
 * Whisper path. This pins the removal in the source and in the strings.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('typed speaking answers are gone', () => {
  const files = [
    'src/pages/celpip/components/session/sections/SpeakingSection.tsx',
    'src/pages/celpip/components/session/ExamEngine.tsx',
    'src/pages/celpip/components/session/SectionIntro.tsx',
    'src/pages/celpip/types.ts',
  ];

  it.each(files)('%s has no typed-answer mode', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/typedMode|onStartTyped|startTyping|finishTyping|TYPING_TIME/);
    expect(src).not.toMatch(/typedDraft|typedAnswer|micTypedFallback/);
  });

  it.each(['en', 'fa', 'ar', 'fr', 'hi', 'zh'])('%s locale drops the typed-answer strings', (loc) => {
    const celpip = JSON.parse(read(`src/i18n/locales/${loc}/celpip.json`));
    for (const key of [
      'micTypedFallback',
      'typedModeNotice',
      'speakingStartTyping',
      'typedAnswerLabel',
      'typedAnswerPlaceholder',
      'typedDone',
      'typingAutoStart',
    ]) {
      expect(celpip).not.toHaveProperty(key);
    }
  });

  it('keeps the offline recording and local Whisper path', () => {
    const src = read('src/pages/celpip/components/session/sections/SpeakingSection.tsx');
    expect(src).toContain('celpip_record_start');
    expect(src).toContain('celpip_transcribe_recording');
    expect(src).toContain('celpip_upload_recording');
    // A failed save still lets the learner retry or continue with what was captured.
    expect(src).toContain('speakingRetryUpload');
  });
});

describe('the exam namespace is translated into every UI language', () => {
  const need = [
    'tcf.itemOf',
    'tcf.timeLeft',
    'tcf.listeningOnce',
    'tcf.estimateNote',
    'tcfQuebec.pointsTitle',
    'tcfQuebec.pointsSource',
    'tcfIrn.hubDescription',
    'scoringInfo.title',
    'results.tcfHelp.translate',
    'results.nextSteps.title',
    'results.reviewTabs.wrong',
    'insightQa.whyCorrect',
  ];
  const get = (obj: Record<string, unknown>, path: string) =>
    path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

  it.each(['en', 'fa', 'ar', 'fr', 'hi', 'zh'])('%s has the TCF strings', (loc) => {
    const exam = JSON.parse(read(`src/i18n/locales/${loc}/exam.json`));
    for (const key of need) expect(get(exam, key), `${loc}:${key}`).toBeTypeOf('string');
    // i18next interpolation, never the web's ICU braces.
    expect(JSON.stringify(exam)).not.toMatch(/[^{]\{[a-zA-Z]+\}[^}]/);
    expect(JSON.stringify(exam)).not.toContain(', plural,');
  });
});
