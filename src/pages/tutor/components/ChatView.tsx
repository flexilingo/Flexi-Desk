import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTutorStore } from '../stores/tutorStore';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';

const MODE_DISPLAY: Record<string, string> = {
  free: 'Free Talk',
  role_play: 'Role Play',
  deck_practice: 'Deck Practice',
  vocab_challenge: 'Vocab Challenge',
  escape_room: 'Escape Room',
};

export function ChatView() {
  const {
    activeConversation,
    messages,
    streamingContent,
    isStreaming,
    isSending,
    sendMessage,
    endConversation,
  } = useTutorStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(text);
    textareaRef.current?.focus();
  }, [input, isSending, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!activeConversation) return null;

  const visibleMessages = messages.filter((m) => m.role !== 'system');
  const isArchived = activeConversation.status === 'archived';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground truncate">
            {activeConversation.title}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {MODE_DISPLAY[activeConversation.mode] ?? activeConversation.mode}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {activeConversation.cefrLevel}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {activeConversation.language.toUpperCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">{activeConversation.model}</span>
          </div>
        </div>
        {!isArchived && (
          <Button variant="outline" size="sm" onClick={endConversation}>
            <Square className="mr-1.5 h-3 w-3" />
            End
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {visibleMessages.length === 0 && !isStreaming && !isSending && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Send a message to start the conversation.</p>
            <p className="text-xs mt-1">
              The tutor will respond in {activeConversation.language.toUpperCase()} at{' '}
              {activeConversation.cefrLevel} level.
            </p>
          </div>
        )}

        {visibleMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming bubble */}
        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
              <p className="text-sm whitespace-pre-wrap">{streamingContent}</p>
            </div>
          </div>
        )}

        {/* Typing indicator when sending but no stream yet */}
        {isSending && !streamingContent && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isArchived && (
        <div className="px-4 py-3 border-t border-border bg-card">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[40px] max-h-[120px]"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="shrink-0"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Enter to send, Shift+Enter for new line
          </p>
        </div>
      )}
    </div>
  );
}
