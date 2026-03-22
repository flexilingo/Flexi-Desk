import type { MessageData } from '../types';
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

  if (message.role === 'system') return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? '' : 'space-y-2'}`}>
        <div
          className={`px-4 py-2 ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
              : 'bg-card border border-border rounded-2xl rounded-bl-sm py-3'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
