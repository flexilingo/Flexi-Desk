export interface ShortcutRow {
  keys: string[];
  label: string;
}

/** The rows of the shortcut sheet that are live RIGHT NOW (filtered, not annotated — a listed key must respond). */
export function shortcutRows(
  focusMode: boolean,
  cardShortcuts: boolean,
  t: (k: string) => string,
): ShortcutRow[] {
  const focusRow: ShortcutRow = {
    keys: ['F'],
    label: focusMode ? t('exitFocusMode') : t('focusMode'),
  };
  return [
    ...(cardShortcuts
      ? [
          { keys: ['Space'], label: t('shortcutList.flip') },
          { keys: ['1', '…', '5'], label: t('shortcutList.grade') },
          { keys: ['R'], label: t('shortcuts.replayWord') },
          { keys: ['E'], label: t('shortcutList.nextExample') },
          { keys: ['W'], label: t('shortcuts.prevExample') },
          { keys: ['T'], label: t('shortcutList.exampleMeaning') },
          ...(focusMode
            ? [
                { keys: ['M'], label: t('shortcutList.meaning') },
                { keys: ['L'], label: t('shortcutList.toggleMeaningPref') },
              ]
            : []),
        ]
      : []),
    focusRow,
  ];
}
