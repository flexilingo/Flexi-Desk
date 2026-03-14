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
import type { Algorithm } from '../types';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ru', name: 'Russian' },
];

const ALGORITHMS: { value: Algorithm; label: string; desc: string }[] = [
  { value: 'fsrs', label: 'FSRS', desc: 'Modern algorithm with optimal scheduling. Recommended.' },
  { value: 'sm2', label: 'SM-2', desc: 'Classic SuperMemo algorithm. Good for general use.' },
  { value: 'leitner', label: 'Leitner', desc: 'Simple box system. Great for beginners.' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDeckDialog({ open, onOpenChange }: Props) {
  const createDeck = useReviewStore((s) => s.createDeck);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('en');
  const [algorithm, setAlgorithm] = useState<Algorithm>('fsrs');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    await createDeck(name.trim(), language, algorithm, description.trim() || undefined);
    setIsCreating(false);
    setName('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Deck</DialogTitle>
          <DialogDescription>Add a new flashcard deck for vocabulary review.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., German Vocabulary"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Language *</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Algorithm</label>
            <div className="space-y-2">
              {ALGORITHMS.map((algo) => (
                <label
                  key={algo.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    algorithm === algo.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="algorithm"
                    value={algo.value}
                    checked={algorithm === algo.value}
                    onChange={() => setAlgorithm(algo.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{algo.label}</div>
                    <div className="text-xs text-muted-foreground">{algo.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {isCreating ? 'Creating...' : 'Create Deck'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
