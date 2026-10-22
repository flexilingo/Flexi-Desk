/**
 * Languages: the ACCOUNT (`user-settings`) when signed in, mirrored on this computer.
 *
 * The desk also keeps a local study/tutor configuration (`native_language`,
 * `target_language` in the local settings table). Signing in must never silently
 * replace it, and picking a language in the account tab must never be lost if the
 * network call fails.
 */

export interface LocalLanguages {
  native: string | null;
  target: string | null;
}

export interface AccountLanguages {
  native: string | null;
  learning: string | null;
}

export type LanguageSync =
  /** Nothing local yet: take the account's languages as this computer's too. */
  | { kind: 'adopt'; native: string | null; learning: string | null }
  /** Both agree. */
  | { kind: 'in-sync' }
  /** Both set and different: show both, change neither until the learner picks. */
  | { kind: 'conflict'; local: LocalLanguages; account: AccountLanguages }
  /** The account has no languages yet but this computer does: offer to save them there. */
  | { kind: 'offer-push'; local: LocalLanguages };

const set = (v: string | null | undefined): v is string => !!v && v.trim() !== '';

export function planLanguageSync(local: LocalLanguages, account: AccountLanguages): LanguageSync {
  const localHas = set(local.native) || set(local.target);
  const accountHas = set(account.native) || set(account.learning);
  if (!localHas && accountHas) {
    return { kind: 'adopt', native: account.native, learning: account.learning };
  }
  if (localHas && !accountHas) return { kind: 'offer-push', local };
  if (!localHas && !accountHas) return { kind: 'in-sync' };
  const same =
    (local.native ?? null) === (account.native ?? null) &&
    (local.target ?? null) === (account.learning ?? null);
  return same ? { kind: 'in-sync' } : { kind: 'conflict', local, account };
}

/** The account patch for one picked field. */
export function languagePatch(field: 'learning' | 'native', code: string) {
  return field === 'learning' ? { learning_language: code } : { native_language: code };
}

/** The local-setting key a field mirrors into. */
export function localKeyFor(field: 'learning' | 'native'): 'target_language' | 'native_language' {
  return field === 'learning' ? 'target_language' : 'native_language';
}

/**
 * Save one language: signed out = this computer only; signed in = account first, and
 * only after the account accepted it is the local copy updated (so the two never
 * disagree because a request failed halfway).
 */
export async function saveLanguage(
  field: 'learning' | 'native',
  code: string,
  io: {
    signedIn: boolean;
    patchAccount: (patch: Record<string, string>) => Promise<unknown>;
    setLocal: (key: string, value: string) => Promise<unknown>;
  },
): Promise<void> {
  if (io.signedIn) await io.patchAccount(languagePatch(field, code));
  await io.setLocal(localKeyFor(field), code);
}

/** Languages the website offers as study/translation languages. */
export const LEARNING_LANGUAGES = [
  'en',
  'fr',
  'es',
  'de',
  'ru',
  'tr',
  'ar',
  'fa',
  'hi',
  'zh',
] as const;
