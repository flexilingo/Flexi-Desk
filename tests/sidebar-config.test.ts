import { describe, it, expect } from 'vitest';
import {
  NAV_GROUPS,
  findNavItem,
  routeTitle,
  subscriptionUrl,
  visibleGroups,
} from '@/components/layout/sidebarConfig';
import { ENABLED_MODULES, type ModuleKey } from '@/config/features';
import en from '@/i18n/locales/en/common.json';
import fa from '@/i18n/locales/fa/common.json';
import ar from '@/i18n/locales/ar/common.json';
import fr from '@/i18n/locales/fr/common.json';
import hi from '@/i18n/locales/hi/common.json';
import zh from '@/i18n/locales/zh/common.json';

const all = Object.fromEntries(Object.keys(ENABLED_MODULES).map((k) => [k, true])) as Record<
  ModuleKey,
  boolean
>;

describe('sidebar menu', () => {
  it('has the website groups in order, plus the desktop tools', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['home', 'study', 'exams', 'french', 'desk', 'personal']);
  });

  it('every entry is behind a flag that exists', () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(Object.keys(ENABLED_MODULES)).toContain(item.module);
    }
  });

  it('hides entries whose page is not ported yet', () => {
    const shown = visibleGroups().flatMap((g) => g.items.map((i) => i.to));
    expect(shown).toEqual(
      expect.arrayContaining(['/', '/podcast', '/videos', '/reader/library', '/study', '/review', '/explore', '/reader', '/celpip', '/exam/tcf', '/settings', '/tutor', '/caption', '/cheatsheet', '/notes', '/vocabulary']),
    );
    for (const off of ['/sentences']) {
      expect(shown).not.toContain(off);
    }
    // Switched on, every defined entry appears.
    expect(visibleGroups(all).flatMap((g) => g.items)).toHaveLength(NAV_GROUPS.flatMap((g) => g.items).length);
  });

  it('lights the entry you are on, not its neighbour', () => {
    expect(findNavItem('/')?.item.to).toBe('/');
    expect(findNavItem('/review/deck/abc')?.item.to).toBe('/review');
    expect(findNavItem('/reader/library')?.item.to).toBe('/reader/library');
    expect(findNavItem('/reader/book/b1')?.item.to).toBe('/reader/library');
    expect(findNavItem('/reader/pdf/d1')?.item.to).toBe('/reader');
    expect(findNavItem('/celpip/results/s1')?.item.to).toBe('/celpip');
    expect(findNavItem('/exam/celpip/session/s1')?.item.to).toBe('/celpip');
    expect(findNavItem('/exam/tcf/results/s1')?.item.to).toBe('/exam/tcf');
    expect(findNavItem('/exam/tcf_quebec')?.item.to).toBe('/exam/tcf');
    expect(findNavItem('/nowhere')).toBeNull();
  });

  it('names the page in the header', () => {
    const t = (k: string) => k;
    expect(routeTitle('/study/session/1', t)).toBe('nav.study');
    expect(routeTitle('/podcast/player/9', t)).toBe('nav.podcasts');
  });

  it('opens the subscription page in the learner language', () => {
    expect(subscriptionUrl('fa')).toBe('https://flexilingo.com/fa/dashboard/subscription');
    expect(subscriptionUrl('en-CA')).toBe('https://flexilingo.com/en/dashboard/subscription');
    expect(subscriptionUrl('de')).toBe('https://flexilingo.com/en/dashboard/subscription');
  });

  it('every label is translated in all six languages', () => {
    const keys = [
      ...NAV_GROUPS.map((g) => g.labelKey),
      ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.labelKey)),
      'nav.expandSidebar',
      'nav.collapseSidebar',
      'nav.reportBug',
      'nav.upgradeToPro',
      'nav.upgradeToProBody',
      'nav.planTitle',
      'nav.theme',
      'nav.themeLight',
      'nav.themeDark',
      'nav.themeSystem',
    ];
    const get = (obj: unknown, key: string) =>
      key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    for (const [lang, file] of Object.entries({ en, fa, ar, fr, hi, zh })) {
      for (const key of keys) {
        const value = get(file, key);
        expect(typeof value === 'string' && value.length > 0, `${lang}:${key}`).toBe(true);
      }
    }
  });
});
