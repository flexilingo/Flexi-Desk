/**
 * The "write this language next" vote, remembered on this computer.
 *
 * The website shows the button every time; here a vote that was recorded stays
 * recorded, so the card does not offer a second press after a restart (the server
 * also rate-limits repeats). The email step is remembered separately: the vote is
 * the part that decides what gets written, the address only who is told.
 */
export type VoteState = { voted: boolean; emailSaved: boolean };

const KEY = 'cheatsheet.languageVotes';

type Store = Record<string, VoteState>;

function read(storage: Pick<Storage, 'getItem'>): Store {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export const voteId = (lang: string, locale: string) => `${lang}:${locale}`;

export function getVote(
  lang: string,
  locale: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): VoteState {
  return read(storage)[voteId(lang, locale)] ?? { voted: false, emailSaved: false };
}

export function saveVote(
  lang: string,
  locale: string,
  patch: Partial<VoteState>,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): VoteState {
  const all = read(storage);
  const next = { ...(all[voteId(lang, locale)] ?? { voted: false, emailSaved: false }), ...patch };
  all[voteId(lang, locale)] = next;
  try {
    storage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* a full or blocked store only loses the memory, not the vote */
  }
  return next;
}
