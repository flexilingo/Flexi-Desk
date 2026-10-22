import { beforeEach, describe, it, expect } from 'vitest';
import {
  announcementText,
  dismissAnnouncement,
  dismissLocale,
  dismissedIds,
  dismissedLocales,
  localeOffer,
  pickAnnouncement,
} from '@/lib/account/notices';
import type { PublicAnnouncement } from '@/lib/account/types';
import { googleErrorKey } from '@/components/auth/authError';

const ann = (o: Partial<PublicAnnouncement> = {}): PublicAnnouncement => ({
  id: 'a1',
  slot: 'dashboard_banner',
  title: null,
  message: 'm',
  button_text: null,
  dismiss_type: 'button',
  auto_dismiss_seconds: 0,
  ...o,
});

beforeEach(() => localStorage.clear());

describe('announcements', () => {
  it('picks the slot and hides a dismissed one for good', () => {
    const list = [ann({ id: 'x', slot: 'other' }), ann()];
    expect(pickAnnouncement(list, 'dashboard_banner', new Set())?.id).toBe('a1');
    const dismissed = dismissAnnouncement('a1');
    expect(pickAnnouncement(list, 'dashboard_banner', dismissed)).toBeNull();
    expect(dismissedIds().has('a1')).toBe(true);
  });
  it('shows the words of operator HTML as plain text', () => {
    expect(announcementText('<p>Hello <b>world</b></p><p>Next &amp; last</p>')).toBe(
      'Hello world\nNext & last',
    );
    expect(announcementText('a<br>b')).toBe('a\nb');
    expect(announcementText(null)).toBe('');
  });
});

describe('UI language suggestion', () => {
  it('offers the first preferred language the app has and is not using', () => {
    expect(localeOffer(['fr-CA', 'en'], 'en', [])?.code).toBe('fr');
  });
  it('offers nothing when the app already speaks it', () => {
    expect(localeOffer(['fr-CA'], 'fr', [])).toBeNull();
    expect(localeOffer(['fr-CA'], 'fr-FR', [])).toBeNull();
  });
  it('skips unknown languages and respects a closed offer', () => {
    expect(localeOffer(['xx'], 'en', [])).toBeNull();
    expect(localeOffer(['fa'], 'en', ['fa'])).toBeNull();
    dismissLocale('fa');
    expect(dismissedLocales()).toEqual(['fa']);
  });
  it('writes the offer in the offered language, right-to-left where needed', () => {
    const o = localeOffer(['ar'], 'en', [])!;
    expect(o.dir).toBe('rtl');
    expect(o.copy.cta).toMatch(/[؀-ۿ]/);
  });
});

describe('Google sign-in errors', () => {
  it('reads the code Rust returns', () => {
    expect(googleErrorKey('GOOGLE_CANCELLED')).toBe('GOOGLE_CANCELLED');
    expect(googleErrorKey('GOOGLE_LISTEN_FAILED: Address in use')).toBe('GOOGLE_LISTEN_FAILED');
    expect(googleErrorKey(new Error('GOOGLE_TIMEOUT'))).toBe('GOOGLE_TIMEOUT');
  });
  it('falls back to a generic failure', () => {
    expect(googleErrorKey('something odd')).toBe('GOOGLE_SIGN_IN_FAILED');
    expect(googleErrorKey('GOOGLE_NEW_ONE')).toBe('GOOGLE_SIGN_IN_FAILED');
  });
});
