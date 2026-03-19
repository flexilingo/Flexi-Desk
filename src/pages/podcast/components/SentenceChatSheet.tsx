import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Sparkles, Languages, BookOpen, Lightbulb, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SentenceChatSheetProps {
  open: boolean;
  onClose: () => void;
  sentence: string;
  prevSentence?: string;
  nextSentence?: string;
  episodeId: string;
  sourceLang?: string;
  autoAction?: 'translate' | 'grammar' | null;
}

export function SentenceChatSheet({
  open,
  onClose,
  sentence,
  prevSentence,
  nextSentence,
  episodeId,
  sourceLang = 'en',
  autoAction,
}: SentenceChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [targetLang, setTargetLang] = useState('fa');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoActionDone = useRef(false);

  // Load history on open
  useEffect(() => {
    if (!open) return;
    invoke<{ id: string; role: string; content: string }[]>('ai_sentence_chat_history', { episodeId })
      .then((msgs) => setMessages(msgs.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content }))))
      .catch(() => {});
  }, [open, episodeId]);

  // Auto-trigger action
  useEffect(() => {
    if (!open || !autoAction || autoActionDone.current) return;
    autoActionDone.current = true;
    sendMessage('', autoAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoAction]);

  useEffect(() => {
    if (!open) autoActionDone.current = false;
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string, action?: string) => {
      if (sending) return;
      setSending(true);
      setError(null);

      const userMsg =
        text ||
        (action === 'translate'
          ? 'Translate this sentence'
          : action === 'grammar'
            ? 'Analyze grammar'
            : 'Give me a tip');

      setMessages((prev) => [
        ...prev,
        {
          id: `tmp-${Date.now()}`,
          role: 'user',
          content: userMsg,
        },
      ]);

      try {
        const resp = await invoke<string>('ai_sentence_chat', {
          episodeId,
          message: text || sentence,
          sentenceContext: sentence,
          targetLanguage: targetLang,
          action: action || undefined,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `resp-${Date.now()}`,
            role: 'assistant',
            content: resp,
          },
        ]);
      } catch (e) {
        const errStr = String(e);
        if (errStr === 'OLLAMA_NOT_RUNNING') {
          setError('Ollama is not running. Start it from Settings → AI Provider.');
        } else {
          setError(errStr);
        }
      } finally {
        setSending(false);
      }
    },
    [sending, episodeId, sentence, prevSentence, nextSentence, targetLang],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Ask Lena</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sentence context */}
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <p className="text-sm text-foreground font-medium truncate">{sentence}</p>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-xl bg-muted">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {error}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex gap-1.5 px-4 py-2 border-t border-border">
          <button
            onClick={() => sendMessage('', 'translate')}
            disabled={sending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs text-foreground disabled:opacity-50"
          >
            <Languages className="w-3.5 h-3.5" /> Translate
          </button>
          <button
            onClick={() => sendMessage('', 'grammar')}
            disabled={sending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs text-foreground disabled:opacity-50"
          >
            <BookOpen className="w-3.5 h-3.5" /> Grammar
          </button>
          <button
            onClick={() => sendMessage('', 'tip')}
            disabled={sending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-xs text-foreground disabled:opacity-50"
          >
            <Lightbulb className="w-3.5 h-3.5" /> Tip
          </button>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="ml-auto px-2 py-1 rounded-lg bg-muted border border-border text-xs text-foreground"
          >
            <option value="fa">Persian</option>
            <option value="ar">Arabic</option>
            <option value="tr">Turkish</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="zh">Chinese</option>
            <option value="hi">Hindi</option>
            <option value="ru">Russian</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t border-border">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this sentence..."
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
