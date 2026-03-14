import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTutorStore } from '../stores/tutorStore';
import { MessageBubble } from './MessageBubble';

interface Props {
  onBack: () => void;
}

export function ChatView({ onBack }: Props) {
  const { activeConversation, messages, isSending, sendMessage, closeConversation } =
    useTutorStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    await sendMessage(text);
    inputRef.current?.focus();
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

  const handleBack = useCallback(() => {
    closeConversation();
    onBack();
  }, [closeConversation, onBack]);

  if (!activeConversation) return null;

  // Filter out system messages for display
  const visibleMessages = messages.filter((m) => m.role !== 'system');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">{activeConversation.title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {activeConversation.cefrLevel}
            </Badge>
            <span className="capitalize">{activeConversation.provider}</span>
            <span>·</span>
            <span>{activeConversation.model}</span>
            {activeConversation.correctionsCount > 0 && (
              <>
                <span>·</span>
                <span className="text-accent">
                  {activeConversation.correctionsCount} corrections
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 min-h-0">
        {visibleMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Send a message to start the conversation.</p>
            <p className="text-xs mt-1">
              The tutor will respond in {activeConversation.language.toUpperCase()} at{' '}
              {activeConversation.cefrLevel} level.
            </p>
          </div>
        )}

        {visibleMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            documentLanguage={activeConversation.language}
          />
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-border">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[40px] max-h-[120px]"
          />
          <Button onClick={handleSend} disabled={!input.trim() || isSending} className="self-end">
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
