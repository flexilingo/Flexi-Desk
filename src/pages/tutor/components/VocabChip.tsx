import { useState } from 'react';
import { BookOpen, Check, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { VocabSuggestion } from '../types';

interface VocabChipProps {
  vocab: VocabSuggestion;
  onSave?: (vocab: VocabSuggestion) => void;
}

export function VocabChip({ vocab, onSave }: VocabChipProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (onSave) {
      onSave(vocab);
      setSaved(true);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <BookOpen className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium text-foreground">{vocab.word}</span>
        <span className="text-muted-foreground">{vocab.translation}</span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <span className="font-medium text-foreground">{vocab.word}</span>
          <span className="text-muted-foreground">—</span>
          <span className="text-muted-foreground">{vocab.translation}</span>
        </button>
        <Badge variant="outline">{vocab.cefr}</Badge>
      </div>

      {vocab.example && (
        <p className="text-sm italic text-muted-foreground">{vocab.example}</p>
      )}

      {onSave && (
        <Button
          variant={saved ? 'secondary' : 'outline'}
          size="sm"
          onClick={handleSave}
          disabled={saved}
        >
          {saved ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Saved
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              Save to Deck
            </>
          )}
        </Button>
      )}
    </div>
  );
}
