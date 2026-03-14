import { useCallback } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useTutorStore } from '../stores/tutorStore';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';

export function TutorPage() {
  const { activeConversation, isLoadingMessages } = useTutorStore();

  const handleBack = useCallback(() => {
    // closeConversation is called inside ChatView
  }, []);

  if (isLoadingMessages) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  if (activeConversation) {
    return <ChatView onBack={handleBack} />;
  }

  return <ConversationList />;
}
