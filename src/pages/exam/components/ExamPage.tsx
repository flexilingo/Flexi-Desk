import { useEffect } from 'react';
import { useExamStore } from '../stores/examStore';
import { ExamPickerView } from './ExamPickerView';
import { SessionListView } from './SessionListView';
import { ExamView } from './ExamView';
import { ExamResultsView } from './ExamResultsView';
import { ErrorBanner } from './ErrorBanner';

export function ExamPage() {
  const { view, fetchHistory } = useExamStore();

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="space-y-4">
      <ErrorBanner />
      {view === 'picker' && <ExamPickerView />}
      {view === 'sessions' && <SessionListView />}
      {view === 'exam' && <ExamView />}
      {view === 'results' && <ExamResultsView />}
    </div>
  );
}
