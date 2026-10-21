import { describe, it, expect, vi } from 'vitest';

/**
 * A throw at module scope (or in the root render) blanks the entire window, not
 * just one page. `vite build` won't catch it because esbuild never evaluates the
 * modules. This boots the real module graph with the Tauri bridge stubbed.
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
vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }), { virtual: true } as never);

describe('app boot', () => {
  it('imports the root App module without throwing', async () => {
    await expect(import('@/App')).resolves.toBeDefined();
  });

  it('imports the Shell layout without throwing', async () => {
    await expect(import('@/components/layout/Shell')).resolves.toBeDefined();
  });

  it('imports the player store (module-scope side effects) without throwing', async () => {
    const mod = await import('@/pages/podcast/stores/playerStore');
    expect(mod.usePlayerStore).toBeDefined();
  });

  it('imports i18n config without throwing', async () => {
    await expect(import('@/i18n/config')).resolves.toBeDefined();
  });
});
