import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { useAuthStore } from '@/stores/authStore';
import {
  deviceId,
  osName,
  previousVersion,
  screenName,
  sendUsage,
  usageEnabled,
  type UsageContext,
} from '@/lib/usage';

interface Launch {
  device: string;
  firstOpen: boolean;
  appVersion: string;
  updatedFrom: string | null;
}

/**
 * The app's anonymous usage counts (see `lib/usage.ts`), mounted once in `App`:
 * `desk_app_opened` once per launch — with whether this is the computer's first launch and the
 * version it was updated from — and `desk_screen_viewed` each time the screen changes, once the
 * setup wizard is done (`ready`). Both wait for the stored session, so `signed_in` is right.
 */
export function useUsageStats(ready: boolean) {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const userId = useAuthStore((s) => s.session?.user_id ?? null);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const opened = useRef(false);
  const lastScreen = useRef<string | null>(null);

  useEffect(() => {
    if (!usageEnabled()) return;
    let alive = true;
    void getVersion()
      .catch(() => 'unknown')
      .then((appVersion) => {
        if (!alive) return;
        const device = deviceId();
        setLaunch({
          device: device.id,
          firstOpen: device.created,
          appVersion,
          updatedFrom: previousVersion(appVersion),
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const context = (l: Launch): UsageContext => ({
    device: l.device,
    userId,
    appVersion: l.appVersion,
    os: osName(navigator.userAgent),
    locale: i18n.language,
  });
  const latest = useRef(context);
  latest.current = context;

  useEffect(() => {
    if (!launch || authLoading || opened.current) return;
    opened.current = true;
    sendUsage('desk_app_opened', latest.current(launch), {
      first_open: launch.firstOpen,
      updated_from: launch.updatedFrom,
    });
  }, [launch, authLoading]);

  useEffect(() => {
    if (!launch || authLoading || !ready) return;
    const screen = screenName(pathname);
    if (screen === lastScreen.current) return;
    lastScreen.current = screen;
    sendUsage('desk_screen_viewed', latest.current(launch), { screen });
  }, [launch, authLoading, ready, pathname]);
}
