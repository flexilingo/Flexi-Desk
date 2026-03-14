import { BookPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import type { Message, VocabSuggestion } from '../types';

interface Props {
  message: Message;
  documentLanguage: string;
}

export function MessageBubble({ message, documentLanguage }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) return null; // Don't render system messages

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        }`}
      >
        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Corrections (shown on assistant messages, about user's errors) */}
        {message.corrections.length > 0 && (
          <div className="mt-3 border-t border-foreground/10 pt-2">
            <p className="text-xs font-medium mb-1 opacity-70">Corrections:</p>
            {message.corrections.map((c, i) => (
              <div key={i} className="text-xs mb-1.5">
                <span className="line-through opacity-60">{c.original}</span>
                {' → '}
                <span className="font-medium">{c.corrected}</span>
                <p className="opacity-70 mt-0.5">{c.explanation}</p>
              </div>
            ))}
          </div>
        )}

        {/* Vocab suggestions (on assistant messages) */}
        {message.vocabSuggestions.length > 0 && (
          <div className="mt-3 border-t border-foreground/10 pt-2">
            <p className="text-xs font-medium mb-1 opacity-70">New Vocabulary:</p>
            {message.vocabSuggestions.map((v, i) => (
              <VocabItem key={i} vocab={v} language={documentLanguage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VocabItem({ vocab, language }: { vocab: VocabSuggestion; language: string }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('srs_add_vocabulary', {
        word: vocab.word,
        language,
        translation: vocab.translation,
        definition: null,
        pos: vocab.pos ?? null,
        cefrLevel: vocab.cefrLevel ?? null,
        exampleSentence: null,
        sourceModule: 'tutor',
        contextSentence: null,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between text-xs mb-1">
      <div>
        <span className="font-medium">{vocab.word}</span>
        <span className="opacity-70"> — {vocab.translation}</span>
        {vocab.pos && (
          <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
            {vocab.pos}
          </Badge>
        )}
      </div>
      {!saved ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          onClick={handleSave}
          disabled={saving}
        >
          <BookPlus className="h-3 w-3 mr-0.5" />
          {saving ? '...' : 'Save'}
        </Button>
      ) : (
        <span className="text-success text-[10px]">Saved</span>
      )}
    </div>
  );
}
