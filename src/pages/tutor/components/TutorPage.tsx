import { useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useTutorStore } from '../stores/tutorStore';
import { ConversationSidebar } from './ConversationSidebar';
import { ChatView } from './ChatView';

export function TutorPage() {
  const { activeConversation, error, clearError, fetchConversations, fetchModes, fetchScenarios } =
    useTutorStore();

  useEffect(() => {
    fetchConversations();
    fetchModes();
    fetchScenarios();
  }, [fetchConversations, fetchModes, fetchScenarios]);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Error banner */}
      {error && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 bg-error/10 border-b border-error px-4 py-2 text-sm text-error">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} className="p-0.5 hover:bg-error/20 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <ConversationSidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConversation ? <ChatView /> : <EmptyState />}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
      <MessageSquare className="h-16 w-16 text-muted-foreground/30" />
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">AI Tutor</p>
        <p className="text-sm mt-1">
          Select a conversation or start a new one to practice with the AI tutor.
        </p>
      </div>
    </div>
  );
}
