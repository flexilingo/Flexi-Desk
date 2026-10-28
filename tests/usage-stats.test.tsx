import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '0.7.1') }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import {
  osName,
  screenName,
  sendUsage,
  setUsageEnabled,
  usagePayload,
  type UsageContext,
} from '@/lib/usage';
import { useUsageStats } from '@/hooks/useUsageStats';
import { useAuthStore } from '@/stores/authStore';

const fetchMock = vi.fn(async () => new Response('{}'));
const sent = () =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  useAuthStore.setState({ session: null, isLoading: false });
});
afterEach(() => vi.unstubAllGlobals());

const ctx: UsageContext = { device: 'dev-1', userId: null, appVersion: '0.7.1', os: 'windows', locale: 'en' };

describe('what the usage counts may contain', () => {
  it('a screen is named by its first two parts, never an id', () => {
    expect(screenName('/')).toBe('/');
    expect(screenName('/reader/library/series/fr/le-cafe')).toBe('/reader/library');
    expect(screenName('/reader/pdf/3f2a9c1e-7d4b-4e1a-9f00-1b2c3d4e5f60')).toBe('/reader/pdf');
    expect(screenName('/podcast/1234/episode')).toBe('/podcast');
    expect(screenName('/celpip/session/abc')).toBe('/celpip/session');
  });

  it('the system, from the user agent', () => {
    expect(osName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/156')).toBe('windows');
    expect(osName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('mac');
    expect(osName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
  });

  it('signed out: the computer’s random id and no person profile; signed in: the account', () => {
    const out = usagePayload('desk_app_opened', ctx);
    expect(out.distinct_id).toBe('dev-1');
    expect(out.properties.$process_person_profile).toBe(false);
    expect(out.properties.signed_in).toBe(false);
    const signedIn = usagePayload('desk_app_opened', { ...ctx, userId: 'user-9' });
    expect(signedIn.distinct_id).toBe('user-9');
    expect(signedIn.properties.device_id).toBe('dev-1');
    expect(signedIn.properties.platform).toBe('desktop');
    expect(signedIn.properties.$process_person_profile).toBe(true);
  });

  it('switched off: nothing is sent', () => {
    setUsageEnabled(false);
    sendUsage('desk_app_opened', ctx);
    expect(fetchMock).not.toHaveBeenCalled();
    setUsageEnabled(true);
    sendUsage('desk_app_opened', ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

let go: (to: string) => void = () => {};
function Probe({ ready }: { ready: boolean }) {
  useUsageStats(ready);
  go = useNavigate();
  return null;
}

describe('the app counts its launches and screens', () => {
  it('one launch (first open), then one count per screen change', async () => {
    render(
      <MemoryRouter initialEntries={['/reader/pdf/42']}>
        <Probe ready />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(sent().length).toBe(2));
    const [opened, screen] = sent();
    expect(opened.event).toBe('desk_app_opened');
    expect(opened.properties).toMatchObject({ first_open: true, updated_from: null, app_version: '0.7.1', locale: 'fr' });
    expect(screen).toMatchObject({ event: 'desk_screen_viewed', properties: { screen: '/reader/pdf' } });

    act(() => go('/reader/pdf/43'));
    act(() => go('/podcast'));
    await vi.waitFor(() => expect(sent().length).toBe(3));
    expect(sent()[2].properties.screen).toBe('/podcast');
  });

  it('the next launch is not a first open, and an update says where it came from', async () => {
    localStorage.setItem('flexi.usage.device', 'dev-old');
    localStorage.setItem('flexi.usage.version', '0.7.0');
    render(
      <MemoryRouter>
        <Probe ready={false} />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(sent().length).toBe(1));
    expect(sent()[0].properties).toMatchObject({ first_open: false, updated_from: '0.7.0', device_id: 'dev-old' });
  });

  it('switched off in Settings: the app sends nothing at all', async () => {
    setUsageEnabled(false);
    render(
      <MemoryRouter>
        <Probe ready />
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
