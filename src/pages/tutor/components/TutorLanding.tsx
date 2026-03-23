import { useEffect } from 'react';
import { Plus, MessageCircle, Drama, Layers, Brain, LockKeyhole, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorStore } from '../stores/tutorStore';
import type { ConversationMode } from '../types';

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  free: MessageCircle,
  role_play: Drama,
  deck_practice: Layers,
  vocab_challenge: Brain,
  escape_room: LockKeyhole,
};

const MODE_LABELS: Record<string, string> = {
  free: 'Free Talk',
  role_play: 'Role Play',
  deck_practice: 'Deck Practice',
  vocab_challenge: 'Vocab Challenge',
  escape_room: 'Escape Room',
};

const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  fa: '🇮🇷',
  ar: '🇸🇦',
  tr: '🇹🇷',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  zh: '🇨🇳',
  hi: '🇮🇳',
  ru: '🇷🇺',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function TutorLanding() {
  const {
    conversations,
    isLoadingConversations,
    fetchConversations,
    viewConversation,
    setView,
  } = useTutorStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Tutor</h1>
            <p className="text-sm text-muted-foreground">Practice speaking with your AI conversation partner</p>
          </div>
          <Button onClick={() => setView('new_conversation')} className="gap-2">
            <Plus className="h-4 w-4" />
            New Conversation
          </Button>
        </div>

        {/* Conversation list */}
        {isLoadingConversations ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading conversations...</div>
        ) : sortedConversations.length === 0 ? (
          <EmptyState onStart={() => setView('new_conversation')} />
        ) : (
          <div className="space-y-3">
            {sortedConversations.map((conv) => {
              const ModeIcon = MODE_ICONS[conv.mode] ?? MessageCircle;
              const flag = LANGUAGE_FLAGS[conv.language] ?? '🌐';

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => viewConversation(conv.id)}
                  className="w-full flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <ModeIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                      {conv.status === 'active' && (
                        <span className="shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-medium text-success">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{flag}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{conv.cefrLevel}</span>
                      <span>{MODE_LABELS[conv.mode] ?? conv.mode}</span>
                      <span>·</span>
                      <span>{conv.messageCount} messages</span>
                      {conv.correctionsCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{conv.correctionsCount} corrections</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(conv.updatedAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Mic className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">No conversations yet</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Start your first AI conversation to practice speaking in any language.
        </p>
      </div>
      <Button onClick={onStart} className="gap-2">
        <Plus className="h-4 w-4" />
        Start Your First Conversation
      </Button>
    </div>
  );
}
