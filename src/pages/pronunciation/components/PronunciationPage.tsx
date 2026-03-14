import { useEffect } from 'react';
import { usePronunciationStore } from '../stores/pronunciationStore';
import { SessionListView } from './SessionListView';
import { PracticeView } from './PracticeView';
import { ResultsView } from './ResultsView';
import { ErrorBanner } from './ErrorBanner';

export function PronunciationPage() {
  const { view, fetchSessions, fetchProgress } = usePronunciationStore();

  useEffect(() => {
    fetchSessions();
    fetchProgress();
  }, [fetchSessions, fetchProgress]);

  return (
    <div className="space-y-4">
      <ErrorBanner />
      {view === 'sessions' && <SessionListView />}
      {view === 'practice' && <PracticeView />}
      {view === 'results' && <ResultsView />}
    </div>
  );
}
