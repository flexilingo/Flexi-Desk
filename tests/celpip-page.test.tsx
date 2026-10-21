import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * The CELPIP surfaces mount ~30 components. A prop declared in an interface but
 * never destructured is a ReferenceError that unmounts the whole React tree —
 * neither `vite build` (esbuild strips types) nor eslint's other rules see it.
 */

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/supabase', () => ({ supabaseCall: vi.fn(async () => ({})) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', exists: () => true },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { CelpipPage } from '@/pages/celpip/components/CelpipPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/celpip/*" element={<CelpipPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('celpip pages', () => {
  it('mounts the landing page without throwing', () => {
    expect(() => renderAt('/celpip')).not.toThrow();
  });

  it('mounts the results route without throwing', () => {
    expect(() => renderAt('/celpip/results/abc')).not.toThrow();
  });

  it('mounts the live-exam route without throwing', () => {
    expect(() => renderAt('/celpip/session/abc')).not.toThrow();
  });

  it('never calls an admin-only exam action', async () => {
    const { supabaseCall } = await import('@/lib/supabase');
    renderAt('/celpip');
    for (const call of (supabaseCall as ReturnType<typeof vi.fn>).mock.calls) {
      const path = String(call[1] ?? '');
      expect(path).not.toMatch(/action=(get_parts|create_part|generate_set|admin_|upload_image)/);
    }
  });
});
