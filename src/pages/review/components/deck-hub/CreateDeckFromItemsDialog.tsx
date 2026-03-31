import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Algorithm } from '../../types';
import type { DeckWithStats } from '../../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  defaultLanguage?: string;
  onCreate: (name: string, language: string, algorithm: Algorithm, description?: string) => Promise<DeckWithStats>;
  onCreated: (deck: DeckWithStats) => void;
}

const ALGORITHMS: { value: Algorithm; label: string }[] = [
  { value: 'fsrs', label: 'FSRS (recommended)' },
  { value: 'sm2', label: 'SM-2' },
  { value: 'leitner', label: 'Leitner' },
];

export function CreateDeckFromItemsDialog({
  open,
  onOpenChange,
  selectedCount,
  defaultLanguage = 'en',
  onCreate,
  onCreated,
}: Props) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(defaultLanguage);
  const [algorithm, setAlgorithm] = useState<Algorithm>('fsrs');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleCreate = async () => {
    if (!name.trim()) { setError('Deck name is required'); return; }
    setIsCreating(true);
    setError(null);
    try {
      const deck = await onCreate(name.trim(), language, algorithm, description || undefined);
      onCreated(deck);
      onOpenChange(false);
      // Reset
      setName('');
      setDescription('');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => !isCreating && onOpenChange(false)}
    >
      <div
        className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Create Deck</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedCount} card{selectedCount !== 1 ? 's' : ''} will be added
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Deck name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Business English"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Language</label>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="en"
                maxLength={5}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Algorithm</label>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ALGORITHMS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Create Deck
          </Button>
        </div>
      </div>
    </div>
  );
}
