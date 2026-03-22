import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, Square, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
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
    isRecording,
    isTranscribing,
    autoSpeak,
    startRecording,
    stopAndTranscribe,
    toggleAutoSpeak,
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

  const handleStartRecording = useCallback(async () => {
    await startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(async () => {
    const text = await stopAndTranscribe();
    if (text && text.trim()) {
      await sendMessage(text.trim());
    }
  }, [stopAndTranscribe, sendMessage]);

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
        <div className="border-t border-border p-4 bg-card">
          <div className="flex items-center gap-3">
            {/* Mic button — primary action */}
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isSending || isTranscribing}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all ${
                isRecording
                  ? 'bg-error text-white animate-pulse scale-110'
                  : isTranscribing
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            {/* Text input (secondary — for typing fallback) */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[40px] max-h-[120px]"
            />

            {/* Send button */}
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

            {/* Auto-speak toggle */}
            <button
              onClick={toggleAutoSpeak}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                autoSpeak ? 'bg-[#8BB7A3]/15 text-[#8BB7A3]' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={autoSpeak ? 'Auto-speak ON' : 'Auto-speak OFF'}
            >
              {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>

          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 mt-2 text-sm text-error">
              <div className="h-2 w-2 rounded-full bg-error animate-pulse" />
              Recording... Click mic to stop
            </div>
          )}
          {isTranscribing && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Transcribing...
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            Click mic to speak, or type below {autoSpeak ? '- AI will speak back' : '- Text only'}
          </p>
        </div>
      )}
    </div>
  );
}
