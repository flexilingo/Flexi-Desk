import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReviewStore } from '../stores/reviewStore';

const POS_OPTIONS = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'interjection',
];

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  language: string;
}

export function AddCardDialog({ open, onOpenChange, deckId, language }: Props) {
  const addCard = useReviewStore((s) => s.addCard);
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [definition, setDefinition] = useState('');
  const [pos, setPos] = useState('');
  const [cefrLevel, setCefrLevel] = useState('');
  const [exampleSentence, setExampleSentence] = useState('');
  const [notes, setNotes] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim()) return;
    setIsAdding(true);
    await addCard({
      deckId,
      word: word.trim(),
      language,
      translation: translation.trim() || undefined,
      definition: definition.trim() || undefined,
      pos: pos || undefined,
      cefrLevel: cefrLevel || undefined,
      exampleSentence: exampleSentence.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setIsAdding(false);
    setWord('');
    setTranslation('');
    setDefinition('');
    setPos('');
    setCefrLevel('');
    setExampleSentence('');
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Card</DialogTitle>
          <DialogDescription>Add a new vocabulary card to this deck.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Word *</label>
            <Input value={word} onChange={(e) => setWord(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Translation</label>
            <Input value={translation} onChange={(e) => setTranslation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Definition</label>
            <Input value={definition} onChange={(e) => setDefinition(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">POS</label>
              <select
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground"
              >
                <option value="">—</option>
                {POS_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">CEFR</label>
              <select
                value={cefrLevel}
                onChange={(e) => setCefrLevel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground"
              >
                <option value="">—</option>
                {CEFR_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Example</label>
            <Input value={exampleSentence} onChange={(e) => setExampleSentence(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!word.trim() || isAdding}>
              {isAdding ? 'Adding...' : 'Add Card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
