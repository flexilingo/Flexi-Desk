import type { CardNotes } from '../types';
import { groupsFromNotes, isFrenchVerbCard } from './conjugation';

/** Whether the panel would show anything — so a card with no insights does not reserve a column. */
export function insightsHaveContent(
  notes: CardNotes,
  conjugation?: { front: string; language: string },
): boolean {
  const list = (v: unknown) => Array.isArray(v) && v.length > 0;
  return !!(
    notes.definition ||
    notes.memory_hook ||
    notes.ipa ||
    notes.part_of_speech ||
    notes.etymology ||
    notes.pronunciation_tips ||
    notes.cultural_note ||
    list(notes.synonyms) ||
    list(notes.antonyms) ||
    list(notes.collocations) ||
    list(notes.common_mistakes) ||
    groupsFromNotes(notes).length > 0 ||
    (conjugation && isFrenchVerbCard(notes, conjugation.language, conjugation.front))
  );
}
