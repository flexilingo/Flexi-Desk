import { useState, useMemo } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useTutorStore } from '../stores/tutorStore';
import { NewConversationDialog } from './NewConversationDialog';
import type { ConversationMode, ConversationSummary } from '../types';

const MODE_LABELS: Record<string, string> = {
  all: 'All',
  free: 'Free',
  role_play: 'RP',
  deck_practice: 'Deck',
  vocab_challenge: 'Vocab',
  escape_room: 'Escape',
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'EN',
  fa: 'FA',
  ar: 'AR',
  tr: 'TR',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  zh: 'ZH',
  hi: 'HI',
  ru: 'RU',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ConversationSidebar() {
  const {
    conversations,
    activeConversation,
    isLoadingConversations,
    openConversation,
    deleteConversation,
  } = useTutorStore();

  const [showNew, setShowNew] = useState(false);
  const [modeFilter, setModeFilter] = useState<string>('all');

  const filteredConversations = useMemo(() => {
    if (modeFilter === 'all') return conversations;
    return conversations.filter((c) => c.mode === modeFilter);
  }, [conversations, modeFilter]);

  const modeKeys = Object.keys(MODE_LABELS);

  return (
    <div className="w-72 border-r border-border bg-card flex flex-col h-full">
      {/* New Conversation Button */}
      <div className="p-3 border-b border-border">
        <Button className="w-full" onClick={() => setShowNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Conversation
        </Button>
      </div>

      {/* Mode Filter Tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto">
        {modeKeys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setModeFilter(key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              modeFilter === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingConversations ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No conversations</p>
          </div>
        ) : (
          <div className="py-1">
            {filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={activeConversation?.id === conv.id}
                onOpen={() => openConversation(conv.id)}
                onDelete={() => deleteConversation(conv.id)}
              />
            ))}
          </div>
        )}
      </div>

      <NewConversationDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}

function ConversationItem({
  conv,
  isActive,
  onOpen,
  onDelete,
}: {
  conv: ConversationSummary;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group w-full text-left px-3 py-2.5 transition-colors ${
        isActive
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-muted border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground truncate flex-1">{conv.title}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this conversation?')) {
              onDelete();
            }
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-error/10 rounded"
        >
          <Trash2 className="h-3.5 w-3.5 text-error" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
        <span>{timeAgo(conv.updatedAt)}</span>
        <span className="text-foreground/20">·</span>
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
          {conv.cefrLevel}
        </Badge>
        <span className="text-foreground/20">·</span>
        <span>{LANGUAGE_NAMES[conv.language] ?? conv.language.toUpperCase()}</span>
      </div>
    </button>
  );
}
