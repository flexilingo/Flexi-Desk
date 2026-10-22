import { describe, it, expect, vi } from 'vitest';
import { languagePatch, localKeyFor, planLanguageSync, saveLanguage } from '@/lib/account/learning';

describe('language sync (account vs this computer)', () => {
  it('adopts the account when this computer has nothing yet', () => {
    expect(
      planLanguageSync({ native: null, target: null }, { native: 'fa', learning: 'fr' }),
    ).toEqual({ kind: 'adopt', native: 'fa', learning: 'fr' });
  });
  it('never overwrites a local pair that differs: it reports a conflict', () => {
    const r = planLanguageSync({ native: 'en', target: 'es' }, { native: 'fa', learning: 'fr' });
    expect(r.kind).toBe('conflict');
  });
  it('offers to push local languages to an empty account', () => {
    expect(
      planLanguageSync({ native: 'en', target: 'fr' }, { native: null, learning: null }).kind,
    ).toBe('offer-push');
  });
  it('is in sync when both agree, or both are empty', () => {
    expect(
      planLanguageSync({ native: 'en', target: 'fr' }, { native: 'en', learning: 'fr' }).kind,
    ).toBe('in-sync');
    expect(
      planLanguageSync({ native: null, target: null }, { native: null, learning: null }).kind,
    ).toBe('in-sync');
  });
  it('maps fields to account patches and local keys', () => {
    expect(languagePatch('learning', 'fr')).toEqual({ learning_language: 'fr' });
    expect(languagePatch('native', 'fa')).toEqual({ native_language: 'fa' });
    expect(localKeyFor('learning')).toBe('target_language');
    expect(localKeyFor('native')).toBe('native_language');
  });
});

describe('saveLanguage', () => {
  it('signed out: local only', async () => {
    const patchAccount = vi.fn();
    const setLocal = vi.fn().mockResolvedValue(undefined);
    await saveLanguage('learning', 'fr', { signedIn: false, patchAccount, setLocal });
    expect(patchAccount).not.toHaveBeenCalled();
    expect(setLocal).toHaveBeenCalledWith('target_language', 'fr');
  });
  it('signed in: account first, then the local mirror', async () => {
    const order: string[] = [];
    await saveLanguage('native', 'fa', {
      signedIn: true,
      patchAccount: async () => void order.push('account'),
      setLocal: async () => void order.push('local'),
    });
    expect(order).toEqual(['account', 'local']);
  });
  it('a failed account save leaves the local copy untouched', async () => {
    const setLocal = vi.fn();
    await expect(
      saveLanguage('learning', 'fr', {
        signedIn: true,
        patchAccount: () => Promise.reject(new Error('x')),
        setLocal,
      }),
    ).rejects.toThrow();
    expect(setLocal).not.toHaveBeenCalled();
  });
});
