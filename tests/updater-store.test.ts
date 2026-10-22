import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkMock = vi.fn();
const relaunchMock = vi.fn();
vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...a: unknown[]) => checkMock(...a) }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: () => relaunchMock() }));

import { nextProgress, progressPercent, useUpdaterStore } from '@/stores/updaterStore';

beforeEach(() => {
  checkMock.mockReset();
  relaunchMock.mockReset();
  useUpdaterStore.setState({ status: 'idle', version: null, error: null, dismissed: false });
});

describe('download progress', () => {
  it('accumulates chunks against the announced size', () => {
    let p = nextProgress(
      { downloaded: 0, total: null },
      { event: 'Started', data: { contentLength: 200 } },
    );
    p = nextProgress(p, { event: 'Progress', data: { chunkLength: 50 } });
    p = nextProgress(p, { event: 'Progress', data: { chunkLength: 50 } });
    expect(progressPercent(p)).toBe(50);
  });
  it('has no percent while the size is unknown and never passes 100', () => {
    expect(progressPercent({ downloaded: 10, total: null })).toBeNull();
    expect(progressPercent({ downloaded: 300, total: 200 })).toBe(100);
  });
});

describe('updater store', () => {
  it('reports an available version', async () => {
    checkMock.mockResolvedValue({ version: '0.8.0', downloadAndInstall: vi.fn() });
    await useUpdaterStore.getState().check();
    expect(useUpdaterStore.getState()).toMatchObject({ status: 'available', version: '0.8.0' });
  });
  it('reports up to date', async () => {
    checkMock.mockResolvedValue(null);
    await useUpdaterStore.getState().check();
    expect(useUpdaterStore.getState().status).toBe('upToDate');
  });
  it('shows a manual-check error but swallows a silent one', async () => {
    checkMock.mockRejectedValue(new Error('offline'));
    await useUpdaterStore.getState().check({ silent: true });
    expect(useUpdaterStore.getState()).toMatchObject({ status: 'idle', error: null });
    await useUpdaterStore.getState().check();
    expect(useUpdaterStore.getState()).toMatchObject({ status: 'error', error: 'offline' });
  });
  it('downloads with progress, then waits for the restart', async () => {
    const download = vi.fn(async (cb: (e: unknown) => void) => {
      cb({ event: 'Started', data: { contentLength: 100 } });
      cb({ event: 'Progress', data: { chunkLength: 100 } });
    });
    checkMock.mockResolvedValue({ version: '0.8.0', downloadAndInstall: download });
    await useUpdaterStore.getState().check();
    await useUpdaterStore.getState().install();
    expect(useUpdaterStore.getState().status).toBe('ready');
    expect(progressPercent(useUpdaterStore.getState().progress)).toBe(100);
    expect(relaunchMock).not.toHaveBeenCalled();
    await useUpdaterStore.getState().restart();
    expect(relaunchMock).toHaveBeenCalledOnce();
  });
  it('keeps the error inline when the download fails', async () => {
    checkMock.mockResolvedValue({
      version: '0.8.0',
      downloadAndInstall: vi.fn().mockRejectedValue(new Error('signature mismatch')),
    });
    await useUpdaterStore.getState().check();
    await useUpdaterStore.getState().install();
    expect(useUpdaterStore.getState()).toMatchObject({
      status: 'error',
      error: 'signature mismatch',
    });
  });
});
