import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabaseCall: call }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null), convertFileSrc: (p: string) => p }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', exists: () => true } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
const lookup = vi.hoisted(() => vi.fn());
vi.mock('@/components/lookup/lookup-context', () => ({ useLookup: () => lookup }));

import {
  LOCAL_CAP,
  addLookedUp,
  isLookedUp,
  languageKey,
  loadLookedUp,
  localLookedUp,
  lookedUpForm,
  pushRecent,
  resetLookedUp,
} from '@/components/lookup/looked-up-words';
import { TappableText } from '@/components/lookup/TappableText';
import { useAuthStore } from '@/stores/authStore';

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  window.localStorage.clear();
  call.mockReset();
  lookup.mockReset();
  useAuthStore.setState({ session: null, isLoading: false });
  resetLookedUp();
});

describe('the looked-up form of a word', () => {
  it('the page’s word, cleaned of joiners at its edges, lowercased', () => {
    expect(lookedUpForm('Don’t')).toBe('don’t');
    expect(lookedUpForm('well-known')).toBe('well-known');
    expect(lookedUpForm('word-')).toBe('word');
    expect(lookedUpForm('  Étoile ')).toBe('étoile');
    expect(lookedUpForm("'tis")).toBe('tis');
  });

  it('languages are kept by their base code', () => {
    expect(languageKey('en-US')).toBe('en');
    expect(languageKey('FR')).toBe('fr');
    expect(languageKey('pt_BR')).toBe('pt');
  });

  it('matches exactly, per language', () => {
    addLookedUp('en', 'Notebook');
    expect(isLookedUp('en', 'notebook')).toBe(true);
    expect(isLookedUp('en-GB', 'NOTEBOOK')).toBe(true);
    expect(isLookedUp('en', 'notebooks')).toBe(false);
    expect(isLookedUp('fr', 'notebook')).toBe(false);
  });
});

describe('the list on this machine (signed out)', () => {
  it('newest first, once, and never more than the cap', () => {
    expect(pushRecent(['b', 'a'], 'a')).toEqual(['a', 'b']);
    expect(pushRecent(['b', 'a'], 'c', 2)).toEqual(['c', 'b']);
    for (let i = 0; i < LOCAL_CAP + 5; i++) addLookedUp('en', `word${i}`);
    const kept = localLookedUp('en');
    expect(LOCAL_CAP).toBe(2000);
    expect(kept).toHaveLength(LOCAL_CAP);
    expect(kept[0]).toBe(`word${LOCAL_CAP + 4}`);
    expect(kept).not.toContain('word0');
  });

  it('survives the session, and keeps phrases out', () => {
    addLookedUp('fr', 'Cahier');
    addLookedUp('fr', 'à la fois');
    resetLookedUp();
    expect(isLookedUp('fr', 'cahier')).toBe(true);
    expect(localLookedUp('fr')).toEqual(['cahier']);
  });

  it('signed out, the account is never asked', () => {
    loadLookedUp('en');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('the account’s list (signed in)', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: { user: { id: 'u' } } as never, isLoading: false });
    resetLookedUp();
  });

  it('is asked for once per language per session, and joins this machine’s list', async () => {
    addLookedUp('en', 'kettle');
    call.mockResolvedValue({ language: 'en', words: ['cat', ' dog ', 'l’eau'], truncated: false });
    loadLookedUp('en');
    loadLookedUp('en-US');
    await settle();
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('GET', '/vocabulary?action=looked-up-words&language=en');
    expect(['Cat', 'DOG', 'l’eau', 'kettle'].map((w) => isLookedUp('en', w))).toEqual([true, true, true, true]);
  });

  it('a failing answer leaves this machine’s list marking what it knows', async () => {
    addLookedUp('en', 'kettle');
    call.mockRejectedValue({ code: 'UNKNOWN_ERROR' });
    loadLookedUp('en');
    await settle();
    expect(isLookedUp('en', 'kettle')).toBe(true);
  });
});

describe('the marks on the page', () => {
  const marked = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-looked-up]')).map((el) => el.textContent);

  it('a word looked up before is marked — and stays marked after the page changes', () => {
    addLookedUp('en', 'cat');
    const view = render(<TappableText text="The cat sat on the mat." language="en" markLookedUp />);
    expect(marked()).toEqual(['cat']);
    expect(screen.getByText('cat').className).toContain('decoration-dotted');

    view.rerender(<TappableText text="A dog and a cat. The dog ran." language="en" markLookedUp />);
    expect(marked()).toEqual(['cat']);
  });

  it('a word looked up now is marked at once wherever it is on the page, with no re-render', () => {
    render(<TappableText text="The dog barked. Another dog answered." language="en" markLookedUp />);
    expect(marked()).toEqual([]);
    act(() => addLookedUp('en', 'Dog'));
    expect(marked()).toEqual(['dog', 'dog']);
  });

  it('opening a word marks it and every other copy of it', () => {
    render(<TappableText text="Tea first. Then more tea." language="en" markLookedUp />);
    fireEvent.click(screen.getAllByText(/tea/i)[0]);
    expect(lookup).toHaveBeenCalledWith('Tea', 'Tea first.');
    expect(marked()).toEqual(['Tea', 'tea']);
    expect(localLookedUp('en')).toEqual(['tea']);
  });

  it('only where the page asks for marks, and only in its own language', () => {
    addLookedUp('en', 'cat');
    const view = render(<TappableText text="The cat sat." language="en" />);
    expect(marked()).toEqual([]);
    view.rerender(<TappableText text="Le cat." language="fr" markLookedUp />);
    expect(marked()).toEqual([]);
  });
});
