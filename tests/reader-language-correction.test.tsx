import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const settings = new Map<string, string>();
const setLang = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/tauri-bridge', () => ({
  getSetting: vi.fn(async (k: string) => settings.get(k) ?? null),
  setSetting: vi.fn(async (k: string, v: string) => void settings.set(k, v)),
}));
vi.mock('@/pages/reader/services/readerService', () => ({
  setReaderLanguage: (...a: unknown[]) => setLang(...(a as [])),
}));
vi.mock('@/hooks/useLanguageSettings', () => ({ useLanguageSettings: () => ({ targetLang: 'en' }) }));

import { useLanguageCorrection } from '@/pages/reader/lib/use-language-correction';

const FR =
  "Aujourd'hui, nous allons au marché avec les enfants. Il y a des fruits, des légumes et du pain frais pour toute la famille. " +
  "Elle dit que le temps est très beau et qu'ils ont envie de se promener dans le parc avant de rentrer à la maison. " +
  'Les jeux sont dans la cour et nous sommes tous contents de la journée.';

beforeEach(() => {
  settings.clear();
  setLang.mockClear();
});

describe('useLanguageCorrection', () => {
  it('corrects an English-stored French document once, notes it, and remembers', async () => {
    const onCorrected = vi.fn();
    const { result, rerender } = renderHook(
      (p: { text: string }) =>
        useLanguageCorrection({ documentId: 'd1', language: 'en', pageText: p.text, onCorrected }),
      { initialProps: { text: FR } },
    );
    await waitFor(() => expect(result.current.note).toEqual({ code: 'fr' }));
    expect(setLang).toHaveBeenCalledWith({ document_id: 'd1', language: 'fr' });
    expect(onCorrected).toHaveBeenCalledWith('fr');
    expect(settings.get('reader_lang_checked_d1')).toBe('1');
    // Another page later: never asked again.
    rerender({ text: `${FR} Encore une page.` });
    await new Promise((r) => setTimeout(r, 20));
    expect(setLang).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a document already checked, or for a short page', async () => {
    settings.set('reader_lang_checked_d1', '1');
    const a = renderHook(() =>
      useLanguageCorrection({ documentId: 'd1', language: 'en', pageText: FR, onCorrected: vi.fn() }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(a.result.current.note).toBeNull();
    const b = renderHook(() =>
      useLanguageCorrection({ documentId: 'd2', language: 'en', pageText: 'Bonjour le monde', onCorrected: vi.fn() }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(b.result.current.note).toBeNull();
    expect(setLang).not.toHaveBeenCalled();
  });
});
