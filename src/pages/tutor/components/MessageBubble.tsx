import { Volume2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { MessageData } from '../types';
import { useTutorStore } from '../stores/tutorStore';
import { CorrectionPanel } from './CorrectionPanel';
import { VocabChip } from './VocabChip';

interface Props {
  message: MessageData;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const activeConversation = useTutorStore((s) => s.activeConversation);

  if (message.role === 'system') return null;

  const handleSpeak = () => {
    const language = activeConversation?.language ?? null;
    invoke('tutor_speak_text', { text: message.content, language }).catch(() => {});
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? '' : 'space-y-2'}`}>
        <div
          className={`group relative px-4 py-2 ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
              : 'bg-card border border-border rounded-2xl rounded-bl-sm py-3'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          {!isUser && (
            <button
              onClick={handleSpeak}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground"
              title="Speak"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Corrections (assistant messages only) */}
        {!isUser && message.corrections.length > 0 && (
          <CorrectionPanel corrections={message.corrections} />
        )}

        {/* Vocab suggestions (assistant messages only) */}
        {!isUser && message.vocabSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.vocabSuggestions.map((v, i) => (
              <VocabChip key={i} vocab={v} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-xs text-muted-foreground mt-1 ${isUser ? 'text-right' : 'text-left'}`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
