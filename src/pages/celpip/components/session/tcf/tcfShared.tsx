import { useEffect, useState } from 'react';
import { loadDraft } from '../../../services/examDraft';
import type { ExamSectionDraft, SectionType } from '../../../types';

/** The CEFR level an item is written at, as a small badge. Nothing when the item carries none. */
export function TcfLevelBadge({ level }: { level: string | null }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
      {level}
    </span>
  );
}

/**
 * Desk keeps drafts in SQLite, so reading one is async. A TCF section opens
 * only once its draft is known: opening on a blank page and filling it a moment
 * later is exactly how the web once submitted an empty Writing page the instant
 * the clock check ran.
 */
export function useLoadedDraft(sessionId: string, section: SectionType) {
  const [state, setState] = useState<{ ready: boolean; draft: ExamSectionDraft | null }>({
    ready: false,
    draft: null,
  });
  useEffect(() => {
    let cancelled = false;
    void loadDraft(sessionId, section).then((draft) => {
      if (!cancelled) setState({ ready: true, draft });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, section]);
  return state;
}
