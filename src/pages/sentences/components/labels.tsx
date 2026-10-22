import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Labels } from '../lib/types';

/**
 * The names of things that come from the DATA — a tense, a mood, a verb note, a
 * topic, a token role. Served by the backend (`meta.labels`), so a new level or
 * topic is a content import and never an app release. The bundled strings are the
 * fallback, and the raw key is the last resort — a key renders as itself, never as
 * a missing-message placeholder in the middle of a lesson.
 */
const LabelsContext = createContext<Labels>({});

export function LabelsProvider({ labels, children }: { labels: Labels; children: ReactNode }) {
  return <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>;
}

export function useLabel() {
  const labels = useContext(LabelsContext);
  const { t, i18n } = useTranslation('sentences');
  return useCallback(
    (group: string, key: string) => {
      const served = labels[group]?.[key];
      if (served) return served;
      // The data is full of keys like `complement:place` and `existential.negative`; the bundled
      // messages store them with `_`, and topic tags with `-` -> `_`.
      const safe = group === 'topics' ? key.replace(/-/g, '_') : key.replace(/[.:+]/g, '_');
      const full = `${group}.${safe}`;
      return i18n.exists(`sentences:${full}`) ? t(full) : key;
    },
    [labels, t, i18n],
  );
}
