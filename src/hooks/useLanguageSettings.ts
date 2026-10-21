import { useEffect } from 'react';
import { create } from 'zustand';
import { getSetting, setSetting } from '@/lib/tauri-bridge';

/**
 * The user's language pair, shared across every surface.
 *
 * This used to be a hook with module-level caches and per-instance `useState`, so
 * nothing could *change* the language — a picker in one dialog would leave the
 * subtitle bar, the dictionary sheet and the deck builder on the old one. It's a
 * store now: whoever changes the translation language, everybody re-renders with it.
 *
 * `native_language` is the language translations are shown in; `target_language`
 * is the one being learned. Both persist to the `settings` table, so the choice
 * survives a restart — the desktop equivalent of front's `flexi_native_language`.
 */
interface LanguageState {
  nativeLang: string;
  targetLang: string;
  /** False until the stored values have been read once. */
  hydrated: boolean;
  /** A read is in flight; a second `hydrate()` must not start another. */
  hydrating: boolean;
  /** Fields the user changed. Hydration must never clobber an explicit choice. */
  dirty: Set<'nativeLang' | 'targetLang'>;

  hydrate: () => Promise<void>;
  setNativeLang: (code: string) => Promise<void>;
  setTargetLang: (code: string) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()((set, get) => ({
  nativeLang: 'en',
  targetLang: 'en',
  hydrated: false,
  hydrating: false,
  dirty: new Set(),

  hydrate: async () => {
    const { hydrated, hydrating } = get();
    // Six components call this on mount; only the first read should happen.
    if (hydrated || hydrating) return;
    set({ hydrating: true });

    try {
      const [native, target] = await Promise.all([
        getSetting('native_language'),
        getSetting('target_language'),
      ]);
      // The read is slow enough that the user can pick a language before it
      // lands. A stored value must never overwrite a choice made since.
      const { dirty } = get();
      set({
        ...(dirty.has('nativeLang') ? {} : { nativeLang: native || 'en' }),
        ...(dirty.has('targetLang') ? {} : { targetLang: target || 'en' }),
        hydrated: true,
        hydrating: false,
      });
    } catch {
      // A settings read failure must not leave every dictionary stuck loading.
      set({ hydrated: true, hydrating: false });
    }
  },

  setNativeLang: async (code) => {
    // Apply first: the picker must feel instant, and a failed write only means
    // the choice doesn't outlive this session.
    set((s) => ({ nativeLang: code, dirty: new Set(s.dirty).add('nativeLang') }));
    try {
      await setSetting('native_language', code);
    } catch {
      /* keep the in-memory choice */
    }
  },

  setTargetLang: async (code) => {
    set((s) => ({ targetLang: code, dirty: new Set(s.dirty).add('targetLang') }));
    try {
      await setSetting('target_language', code);
    } catch {
      /* keep the in-memory choice */
    }
  },
}));

/**
 * Read (and now change) the language pair. Keeps this exact return shape because
 * six components already destructure `{ nativeLang, targetLang }` from it.
 */
export function useLanguageSettings() {
  const nativeLang = useLanguageStore((s) => s.nativeLang);
  const targetLang = useLanguageStore((s) => s.targetLang);
  const setNativeLang = useLanguageStore((s) => s.setNativeLang);
  const setTargetLang = useLanguageStore((s) => s.setTargetLang);
  const hydrate = useLanguageStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return { nativeLang, targetLang, setNativeLang, setTargetLang };
}
