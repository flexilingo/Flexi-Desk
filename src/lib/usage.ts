/**
 * Anonymous usage counts for the desktop app: how many people open it, on which version and
 * system, and which screens they use — so the app's visits are visible next to the website's.
 *
 * Sent to the website's own PostHog project as `desk_*` events, straight from the app (the
 * project token is the public write-only one the website ships in its pages too). What is sent:
 * the app version, the operating system, the app language, whether someone is signed in, and a
 * screen's NAME (`/reader/library`, never a book, file, document id, word or anything typed).
 * Never sent: file names, text, recordings, AI keys.
 *
 * On by default; Settings → General → "Share anonymous usage" turns it off, and then nothing
 * at all leaves the app. Failures are ignored — usage counts never get in the way of the app.
 */

const PROJECT_TOKEN = 'phc_srNsiAug4wsVmQvTHpvPvDgPwEnVfKtrQHXiVhAn7rbd';
const CAPTURE_URL = 'https://us.i.posthog.com/i/v0/e/';

const ENABLED_KEY = 'flexi.usage.enabled';
const DEVICE_KEY = 'flexi.usage.device';
const VERSION_KEY = 'flexi.usage.version';

export type UsageEvent = 'desk_app_opened' | 'desk_screen_viewed';

export function usageEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return false;
  }
}

export function setUsageEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable: nothing is sent anyway (usageEnabled reads false).
  }
}

/** This computer's random id — made on the first launch; `created` says it was just made. */
export function deviceId(): { id: string; created: boolean } {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return { id: existing, created: false };
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, id);
  return { id, created: true };
}

/** The version that ran last time, when it differs from this one (an update); remembers this one. */
export function previousVersion(current: string): string | null {
  const last = localStorage.getItem(VERSION_KEY);
  localStorage.setItem(VERSION_KEY, current);
  return last && last !== current ? last : null;
}

/** windows / mac / linux, from the web view's user agent. */
export function osName(userAgent: string): 'windows' | 'mac' | 'linux' | 'other' {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'mac';
  if (/Linux|X11/i.test(userAgent)) return 'linux';
  return 'other';
}

/**
 * A route as a screen NAME: its first two parts, ids replaced. `/reader/pdf/3f2a…` → `/reader/pdf`,
 * `/podcast/episode/1234` → `/podcast/episode`, `/` → `/`. Nothing that names a user's own thing.
 */
export function screenName(pathname: string): string {
  const parts = pathname
    .split('/')
    .filter(Boolean)
    .slice(0, 2)
    .filter((p) => !/^\d+$/.test(p) && !/^[0-9a-f-]{16,}$/i.test(p));
  return '/' + parts.join('/');
}

export interface UsageContext {
  device: string;
  userId: string | null;
  appVersion: string;
  os: string;
  locale: string;
}

/** The PostHog capture body for one event. */
export function usagePayload(
  event: UsageEvent,
  ctx: UsageContext,
  properties: Record<string, string | number | boolean | null> = {},
) {
  return {
    api_key: PROJECT_TOKEN,
    event,
    // Signed in: the account, so the desktop sits next to the same person's website visits.
    distinct_id: ctx.userId ?? ctx.device,
    timestamp: new Date().toISOString(),
    properties: {
      ...properties,
      platform: 'desktop',
      device_id: ctx.device,
      app_version: ctx.appVersion,
      os: ctx.os,
      locale: ctx.locale,
      signed_in: ctx.userId !== null,
      $lib: 'flexi-desk',
      $lib_version: ctx.appVersion,
      // No person profile for someone who is not signed in — a count, not a profile.
      $process_person_profile: ctx.userId !== null,
    },
  };
}

export function sendUsage(
  event: UsageEvent,
  ctx: UsageContext,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!usageEnabled()) return;
  try {
    void fetch(CAPTURE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usagePayload(event, ctx, properties)),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never in the app's way.
  }
}
