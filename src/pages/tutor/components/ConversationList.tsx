import { useEffect, useState } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineError } from '@/components/common/InlineError';
import { useTutorStore } from '../stores/tutorStore';
import { NewConversationDialog } from './NewConversationDialog';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fa: 'Persian',
  ar: 'Arabic',
  tr: 'Turkish',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  hi: 'Hindi',
  ru: 'Russian',
};

export function ConversationList() {
  const {
    conversations,
    isLoadingConversations,
    error,
    fetchConversations,
    openConversation,
    deleteConversation,
    clearError,
  } = useTutorStore();
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const totalCorrections = conversations.reduce((sum, c) => sum + c.correctionsCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Tutor</h2>
          <p className="text-sm text-muted-foreground">
            {conversations.length > 0
              ? `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} · ${totalCorrections} corrections`
              : 'Practice conversation with AI'}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Conversation
        </Button>
      </div>

      {error && <InlineError message={error} onDismiss={clearError} />}

      {isLoadingConversations ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium text-foreground">No conversations yet</p>
              <p className="text-sm text-muted-foreground">
                Start a conversation to practice with the AI tutor
              </p>
            </div>
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Conversation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => openConversation(conv.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{conv.title}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {conv.cefrLevel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this conversation?')) {
                          deleteConversation(conv.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-error" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{LANGUAGE_NAMES[conv.language] ?? conv.language}</span>
                  <span className="text-foreground/30">|</span>
                  <span>{conv.messageCount} messages</span>
                  {conv.correctionsCount > 0 && (
                    <>
                      <span className="text-foreground/30">|</span>
                      <span className="text-accent font-medium">
                        {conv.correctionsCount} corrections
                      </span>
                    </>
                  )}
                  <span className="text-foreground/30">|</span>
                  <span className="capitalize">{conv.provider}</span>
                  <span className="text-foreground/30">|</span>
                  <span>{conv.model}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewConversationDialog open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}
