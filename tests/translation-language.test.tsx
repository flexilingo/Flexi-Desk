import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/**
 * The translation language is ONE global choice. Front stores it under
 * `flexi_native_language` so the player, the dictionary and the deck builder
 * never disagree. Desk stores it in the `settings` table.
 *
 * The old `useLanguageSettings` kept per-instance `useState` behind a module
 * cache — readable, but unchangeable: a picker in one dialog could never move the
 * subtitle bar. These tests pin the store behaviour that replaced it.
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

import { useLanguageStore, useLanguageSettings } from '@/hooks/useLanguageSettings';
import { TranslationLanguagePicker } from '@/components/common/TranslationLanguagePicker';

/** Two independent consumers, like the dictionary and the subtitle bar. */
function ConsumerA() {
  const { nativeLang } = useLanguageSettings();
  return <span data-testid="a">{nativeLang}</span>;
}
function ConsumerB() {
  const { nativeLang } = useLanguageSettings();
  return <span data-testid="b">{nativeLang}</span>;
}

describe('translation language store', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(null);
    setSetting.mockReset().mockResolvedValue(undefined);
    useLanguageStore.setState({ nativeLang: 'en', targetLang: 'en', hydrated: false });
  });

  it('hydrates from the settings table', async () => {
    getSetting.mockImplementation(async (k: string) =>
      k === 'native_language' ? 'fa' : 'en',
    );
    await act(async () => {
      await useLanguageStore.getState().hydrate();
    });
    expect(useLanguageStore.getState().nativeLang).toBe('fa');
  });

  it('a language change reaches EVERY consumer, not just the one that changed it', async () => {
    render(
      <>
        <ConsumerA />
        <ConsumerB />
      </>,
    );
    expect(screen.getByTestId('a').textContent).toBe('en');

    await act(async () => {
      await useLanguageStore.getState().setNativeLang('fa');
    });

    expect(screen.getByTestId('a').textContent).toBe('fa');
    expect(screen.getByTestId('b').textContent).toBe('fa');
  });

  it('a slow settings read never clobbers a language the user just picked', async () => {
    // The real race: hydrate() is in flight when the user opens the picker.
    let resolveRead: (v: string | null) => void = () => {};
    getSetting.mockImplementation(
      (k: string) =>
        k === 'native_language'
          ? new Promise((r) => {
              resolveRead = r;
            })
          : Promise.resolve(null),
    );

    const hydration = useLanguageStore.getState().hydrate();
    await act(async () => {
      await useLanguageStore.getState().setNativeLang('fa');
    });
    expect(useLanguageStore.getState().nativeLang).toBe('fa');

    // The stored value finally arrives — it must lose to the explicit choice.
    await act(async () => {
      resolveRead('en');
      await hydration;
    });
    expect(useLanguageStore.getState().nativeLang).toBe('fa');
  });

  it('persists the choice so it survives a restart', async () => {
    await act(async () => {
      await useLanguageStore.getState().setNativeLang('tr');
    });
    expect(setSetting).toHaveBeenCalledWith('native_language', 'tr');
  });

  it('keeps the choice for this session even if the write fails', async () => {
    setSetting.mockRejectedValue(new Error('disk full'));
    await act(async () => {
      await useLanguageStore.getState().setNativeLang('de');
    });
    expect(useLanguageStore.getState().nativeLang).toBe('de');
  });

  it('a failed settings read still marks hydration done, so nothing hangs', async () => {
    getSetting.mockRejectedValue(new Error('no db'));
    await act(async () => {
      await useLanguageStore.getState().hydrate();
    });
    expect(useLanguageStore.getState().hydrated).toBe(true);
    expect(useLanguageStore.getState().nativeLang).toBe('en');
  });
});

describe('TranslationLanguagePicker', () => {
  beforeEach(() => {
    getSetting.mockReset().mockResolvedValue(null);
    setSetting.mockReset().mockResolvedValue(undefined);
    useLanguageStore.setState({ nativeLang: 'en', targetLang: 'en', hydrated: true });
  });

  it('offers all ten languages and marks the active one', async () => {
    render(<TranslationLanguagePicker />);
    fireEvent.click(screen.getByRole('button'));

    for (const native of ['English', 'العربية', 'Français', 'हिन्दी', '中文', 'Español', 'Deutsch', 'Русский', 'Türkçe', 'فارسی']) {
      expect(screen.getByText(native)).toBeTruthy();
    }
    expect(screen.getByText('English').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('picking a language updates the shared store', async () => {
    render(<TranslationLanguagePicker />);
    fireEvent.click(screen.getByRole('button'));

    await act(async () => {
      fireEvent.click(screen.getByText('فارسی'));
    });

    expect(useLanguageStore.getState().nativeLang).toBe('fa');
    expect(setSetting).toHaveBeenCalledWith('native_language', 'fa');
  });

  it('shows no flag emojis — desk uses the language code instead', () => {
    const { container } = render(<TranslationLanguagePicker />);
    fireEvent.click(screen.getByRole('button'));
    // Regional-indicator pairs are how flag emojis are encoded.
    expect(document.body.textContent).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    expect(container).toBeTruthy();
  });
});

describe('the player word dialog offers the language picker', () => {
  /**
   * The regression this pins: SubtitleBar/TranscriptPanel used to read the global
   * nativeLang and pass it BACK into WordDialog as `targetLang`. WordDialog treats
   * an explicit targetLang as "the caller pinned the language" and hides the
   * TRANSLATION LANGUAGE picker — so the picker never appeared anywhere in the
   * player, even though every caller was just forwarding the default.
   *
   * Passing `targetLang` to WordDialog is reserved for a caller that genuinely
   * forces a language. Forwarding the store value is never that.
   */
  it('no podcast component pins targetLang on WordDialog', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src/pages/podcast/components');

    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      if (f === 'WordDialog.tsx') continue; // internal use of its own resolved value
      const src = readFileSync(join(dir, f), 'utf8');
      // Find <WordDialog ... > openings and check their prop block.
      const matches = src.match(/<WordDialog[\s\S]*?>/g) ?? [];
      for (const m of matches) {
        if (/\btargetLang=/.test(m)) offenders.push(`${f}: ${m.slice(0, 60)}...`);
      }
    }
    expect(offenders, `these pin targetLang and hide the picker:\n${offenders.join('\n')}`).toEqual([]);
  });
});
