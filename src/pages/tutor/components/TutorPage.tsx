import { X } from 'lucide-react';
import { useTutorStore } from '../stores/tutorStore';
import { TutorLanding } from './TutorLanding';
import { NewConversationWizard } from './NewConversationWizard';
import { ConversationDetail } from './ConversationDetail';
import { VoiceSession } from './VoiceSession';

export function TutorPage() {
  const { view, error, clearError } = useTutorStore();

  return (
    <div className="relative h-[calc(100vh-4rem)]">
      {/* Error banner */}
      {error && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 bg-error/10 border-b border-error px-4 py-2 text-sm text-error">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} className="p-0.5 hover:bg-error/20 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {view === 'landing' && <TutorLanding />}
      {view === 'new_conversation' && <NewConversationWizard />}
      {view === 'detail' && <ConversationDetail />}
      {view === 'session' && <VoiceSession />}
    </div>
  );
}
