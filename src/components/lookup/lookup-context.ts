import { createContext, useContext } from 'react';

/**
 * Open the word dialog for `word`, using `context` (the sentence it came from)
 * to disambiguate the translation.
 */
export type LookupFn = (word: string, context?: string) => void;

/**
 * Null when no provider is mounted, so text components can render plain and
 * callers do not need to branch. Same contract the exam and notebook providers
 * already use.
 */
export const LookupContext = createContext<LookupFn | null>(null);

export function useLookup(): LookupFn | null {
  return useContext(LookupContext);
}
