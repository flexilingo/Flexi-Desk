/**
 * Folds a query and the text it is matched against to one form: case, accents
 * (so "prefere" finds "préféré"), Arabic vs Persian yeh and kaf, the invisible
 * ZWNJ, and Markdown emphasis. Shared by the cheatsheet's search box and the
 * Reader's cheatsheet panel, so both find the same things.
 */
export function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[ي]/g, 'ی') // Arabic yeh  -> Persian yeh
    .replace(/[ك]/g, 'ک') // Arabic kaf  -> Persian kaf
    .replace(/‌/g, ' ') // ZWNJ is invisible to a typist
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é -> e, so "prefere" finds "préféré"
    .replace(/[`*_]/g, '');
}
