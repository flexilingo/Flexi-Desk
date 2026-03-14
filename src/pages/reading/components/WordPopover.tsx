import { useState } from 'react';
import { BookPlus, X, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invoke } from '@tauri-apps/api/core';
import { useReadingStore } from '../stores/readingStore';
import type { Token } from '../types';

interface Props {
  token: Token;
  sentence: string;
  documentLanguage: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function WordPopover({ token, sentence, documentLanguage, position, onClose }: Props) {
  const { addHighlight, highlights } = useReadingStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isSavedToVocab, setIsSavedToVocab] = useState(false);

  const isAlreadyHighlighted = highlights.some((h) => h.word.toLowerCase() === token.lower);

  const handleSaveHighlight = async () => {
    setIsSaving(true);
    try {
      await addHighlight(token.text, sentence, token.index);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddToVocabulary = async () => {
    setIsSaving(true);
    try {
      await invoke('srs_add_vocabulary', {
        word: token.text,
        language: documentLanguage,
        translation: null,
        definition: null,
        pos: null,
        cefrLevel: null,
        exampleSentence: sentence || null,
        sourceModule: 'reading',
        contextSentence: sentence || null,
      });

      if (!isAlreadyHighlighted) {
        await addHighlight(token.text, sentence, token.index);
      }

      setIsSavedToVocab(true);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate popover position, keeping it within viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 280),
    top: position.y + 8,
    zIndex: 100,
  };

  // If popover would go below viewport, show above
  if (position.y + 200 > window.innerHeight) {
    style.top = position.y - 160;
  }

  return (
    <>
      {/* Backdrop to close */}
      <div className="fixed inset-0 z-[99]" onClick={onClose} />

      <div style={style} className="w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold text-foreground">{token.text}</span>
          <button
            onClick={onClose}
            className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sentence && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-3 italic">
            &ldquo;...{sentence}...&rdquo;
          </p>
        )}

        <div className="flex flex-col gap-2">
          {!isAlreadyHighlighted && (
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={handleSaveHighlight}
              disabled={isSaving}
            >
              <Bookmark className="mr-2 h-3.5 w-3.5" />
              {isSaving ? 'Saving...' : 'Highlight'}
            </Button>
          )}

          {isAlreadyHighlighted && !isSavedToVocab && (
            <span className="text-xs text-success flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> Already highlighted
            </span>
          )}

          <Button
            size="sm"
            className="w-full justify-start"
            onClick={handleAddToVocabulary}
            disabled={isSaving || isSavedToVocab}
          >
            <BookPlus className="mr-2 h-3.5 w-3.5" />
            {isSavedToVocab ? 'Added to vocabulary!' : isSaving ? 'Adding...' : 'Add to Vocabulary'}
          </Button>
        </div>
      </div>
    </>
  );
}
