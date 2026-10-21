import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

/**
 * In-exam text size. Ported from `flexi-lingo-mobile`, which was the only app that
 * had it — neither the web app nor desk did.
 *
 * The rule that matters: the scale multiplies *content* text (questions, options,
 * passages, prompts, transcripts) and nothing else. If chrome scaled too, a 1.5×
 * setting would break the layout of a 55-minute timed section.
 */

const getSetting = vi.fn();
const setSetting = vi.fn();

vi.mock('@/lib/tauri-bridge', () => ({
  getSetting: (...a: unknown[]) => getSetting(...a),
  setSetting: (...a: unknown[]) => setSetting(...a),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', exists: () => true } }),
}));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import {
  DEFAULT_FONT_SCALE,
  ExamSettingsProvider,
  FONT_SCALE_STEPS,
} from '@/pages/celpip/components/session/ExamSettingsContext';
import { ExamText } from '@/pages/celpip/components/session/ExamText';
import { ExamSettingsPopover } from '@/pages/celpip/components/session/ExamSettingsPopover';

describe('exam text scale', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(null);
    setSetting.mockReset().mockResolvedValue(undefined);
  });

  it('starts a notch larger than 1.0 — exam text is tiny at 13px', () => {
    expect(DEFAULT_FONT_SCALE).toBe(1.15);
    expect(FONT_SCALE_STEPS).toContain(DEFAULT_FONT_SCALE);
  });

  it('ExamText multiplies its base size by the scale', () => {
    render(
      <ExamSettingsProvider>
        <ExamText base={14}>passage</ExamText>
      </ExamSettingsProvider>,
    );
    // 14 * 1.15 = 16.1
    expect(screen.getByText('passage')).toHaveStyle({ fontSize: '16.1px' });
  });

  it('restores a saved scale', async () => {
    getSetting.mockResolvedValue('1.5');
    render(
      <ExamSettingsProvider>
        <ExamText base={10}>q</ExamText>
      </ExamSettingsProvider>,
    );
    await waitFor(() => expect(screen.getByText('q')).toHaveStyle({ fontSize: '15px' }));
  });

  it('ignores a stored value that is not one of the steps', async () => {
    // A hand-edited settings row must not make the exam unreadable.
    getSetting.mockResolvedValue('9');
    render(
      <ExamSettingsProvider>
        <ExamText base={10}>q</ExamText>
      </ExamSettingsProvider>,
    );
    await waitFor(() => expect(getSetting).toHaveBeenCalled());
    expect(screen.getByText('q')).toHaveStyle({ fontSize: `${10 * DEFAULT_FONT_SCALE}px` });
  });

  it('a failed settings read leaves the default in place', async () => {
    getSetting.mockRejectedValue(new Error('no db'));
    render(
      <ExamSettingsProvider>
        <ExamText base={10}>q</ExamText>
      </ExamSettingsProvider>,
    );
    await waitFor(() => expect(screen.getByText('q')).toHaveStyle({ fontSize: '11.5px' }));
  });
});

describe('exam settings popover', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(null);
    setSetting.mockReset().mockResolvedValue(undefined);
  });

  function setup(learningMode: boolean, onToggle = vi.fn()) {
    render(
      <ExamSettingsProvider>
        <ExamSettingsPopover learningMode={learningMode} translateOn={false} onToggleTranslate={onToggle} />
        <ExamText base={20}>content</ExamText>
      </ExamSettingsProvider>,
    );
    fireEvent.click(screen.getByLabelText('examSettingsTitle'));
    return onToggle;
  }

  it('offers every scale step and persists the choice', async () => {
    setup(false);
    const steps = screen.getAllByRole('button', { name: 'A' });
    expect(steps).toHaveLength(FONT_SCALE_STEPS.length);

    await act(async () => {
      fireEvent.click(steps[FONT_SCALE_STEPS.indexOf(1.5)]);
    });

    expect(setSetting).toHaveBeenCalledWith('celpip_exam_font_scale', '1.5');
    expect(screen.getByText('content')).toHaveStyle({ fontSize: '30px' });
  });

  it('hides tap-to-translate in a timed exam — there is no dictionary there', () => {
    setup(false);
    expect(screen.queryByText('examSettingsTranslate')).toBeNull();
    // Text size is still offered.
    expect(screen.getByText('examSettingsTextSize')).toBeTruthy();
  });

  it('offers tap-to-translate in learning mode', () => {
    const onToggle = setup(true);
    expect(screen.getByText('examSettingsTranslate')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('every piece of readable exam content scales', () => {
  /**
   * The bug this pins: five `<LookupText>` sites in Writing and Speaking rendered
   * inside a plain `<p>`/`<li>` with a hard `text-sm`, so the text-size setting
   * silently did nothing to them. A word the candidate can tap to translate is by
   * definition content, so it must sit inside an `ExamText`.
   *
   * Source-level assertion on purpose: rendering every section needs the full exam
   * fixture, and this catches the next one at the moment it's written.
   */
  it('no <LookupText> renders inside an unscaled text element', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src/pages/celpip/components/session');
    const files = [
      ...readdirSync(join(dir, 'sections')).map((f) => `sections/${f}`),
      'McqQuestion.tsx',
    ].filter((f) => f.endsWith('.tsx'));

    const offenders: string[] = [];
    for (const rel of files) {
      const lines = readFileSync(join(dir, rel), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('<LookupText')) return;
        // Walk back to the nearest *enclosing* element — the one that carries the
        // font size. A line that opens and closes its own tag (`<span>•</span>`) is
        // a sibling bullet, not an ancestor, so it is skipped.
        for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
          const m = /<([A-Za-z][\w]*)\b/.exec(lines[j]);
          if (!m) continue;
          const tag = m[1];
          const complete = lines[j].includes(`</${tag}>`) || /\/>\s*$/.test(lines[j]);
          if (complete) continue;
          if (tag !== 'ExamText') {
            offenders.push(`${rel}:${i + 1} -> ${lines[j].trim().slice(0, 60)}`);
          }
          return;
        }
      });
    }

    expect(offenders, `unscaled lookup text:\n${offenders.join('\n')}`).toEqual([]);
  });
});
