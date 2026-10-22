import type { TFunction } from 'i18next';
import type { NoteGroup } from './notesLogic';

/** The name a group is shown, sorted and exported under. */
export function groupTitle(g: NoteGroup, t: TFunction): string {
  return (
    g.title ||
    t(`sourceKinds.${g.source === 'reader' ? 'reader' : g.sourceKind}`, {
      defaultValue: t('sourceKinds.video'),
    })
  );
}
