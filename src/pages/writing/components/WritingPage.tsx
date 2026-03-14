import { useEffect } from 'react';
import { useWritingStore } from '../stores/writingStore';
import { SessionListView } from './SessionListView';
import { EditorView } from './EditorView';
import { ResultsView } from './ResultsView';
import { PromptsView } from './PromptsView';
import { ErrorBanner } from './ErrorBanner';

export function WritingPage() {
  const { view, fetchSessions, fetchPrompts, fetchStats } = useWritingStore();

  useEffect(() => {
    fetchSessions();
    fetchPrompts();
    fetchStats('en');
  }, [fetchSessions, fetchPrompts, fetchStats]);

  return (
    <div className="space-y-4">
      <ErrorBanner />
      {view === 'sessions' && <SessionListView />}
      {view === 'editor' && <EditorView />}
      {view === 'results' && <ResultsView />}
      {view === 'prompts' && <PromptsView />}
    </div>
  );
}
