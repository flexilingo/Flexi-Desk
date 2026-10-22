import { useCallback, useEffect, useRef, useState } from 'react';
import { getCoachReport, listCoachReports, markCoachReportRead } from '../services/celpipCloud';
import { errorCodeOf } from '../stores/celpipStore';
import type { CoachReportListResponse, CoachReportResponse } from './coachTypes';

// Coach reports are written on the server every couple of days (and emailed); desk
// only reads them and marks one read. A report never changes once written - only
// `read_at` does, patched here so the NEW badge clears without a refetch.

interface Loaded<T> {
  data: T | null;
  isLoading: boolean;
  /** The backend's error CODE, resolved through i18n by the caller. */
  errorCode: string | null;
}

function useLoad<T>(
  load: (() => Promise<T>) | null,
  key: string,
): Loaded<T> & { patch: (fn: (d: T) => T) => void } {
  const [state, setState] = useState<Loaded<T>>({
    data: null,
    isLoading: load !== null,
    errorCode: null,
  });
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) {
      setState({ data: null, isLoading: false, errorCode: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, errorCode: null }));
    fn()
      .then((data) => {
        if (!cancelled) setState({ data, isLoading: false, errorCode: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ data: null, isLoading: false, errorCode: errorCodeOf(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load === null]);
  const patch = useCallback(
    (fn: (d: T) => T) => setState((s) => (s.data ? { ...s, data: fn(s.data) } : s)),
    [],
  );
  return { ...state, patch };
}

/** One report (omit reportId for the newest). `skip` loads nothing. */
export function useCoachReport(examType: string, reportId?: string, skip = false) {
  return useLoad<CoachReportResponse>(
    skip ? null : () => getCoachReport(examType, reportId),
    `report:${examType}:${reportId ?? 'latest'}`,
  );
}

export function useCoachReportList(examType: string, skip = false) {
  return useLoad<CoachReportListResponse>(
    skip ? null : () => listCoachReports(examType),
    `list:${examType}`,
  );
}

/** Marks a report read once, when it has actually rendered. Idempotent on the server. */
export function useMarkCoachRead(
  report: { id: string; read_at?: string | null } | undefined,
  onMarked: (id: string, readAt: string) => void,
) {
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!report?.id || report.read_at || marked.current === report.id) return;
    marked.current = report.id;
    const id = report.id;
    markCoachReportRead(id)
      .then((r) => onMarked(id, r.read_at ?? new Date().toISOString()))
      .catch(() => {
        marked.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.read_at]);
}
