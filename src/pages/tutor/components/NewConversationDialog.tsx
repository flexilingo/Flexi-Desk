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
import { InlineError } from '@/components/common/InlineError';
import { useTutorStore } from '../stores/tutorStore';
import type { AIProvider, CEFRLevel } from '../types';

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

const CEFR_LEVELS: { value: CEFRLevel; desc: string }[] = [
  { value: 'A1', desc: 'Beginner' },
  { value: 'A2', desc: 'Elementary' },
  { value: 'B1', desc: 'Intermediate' },
  { value: 'B2', desc: 'Upper Intermediate' },
  { value: 'C1', desc: 'Advanced' },
  { value: 'C2', desc: 'Proficient' },
];

const PROVIDERS: { value: AIProvider; label: string; desc: string }[] = [
  {
    value: 'ollama',
    label: 'Ollama (Local)',
    desc: 'Free, runs locally. Requires Ollama installed.',
  },
  { value: 'openai', label: 'OpenAI', desc: 'GPT models. Requires API key in settings.' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewConversationDialog({ open, onOpenChange }: Props) {
  const startConversation = useTutorStore((s) => s.startConversation);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('de');
  const [cefrLevel, setCefrLevel] = useState<CEFRLevel>('A2');
  const [provider, setProvider] = useState<AIProvider>('ollama');
  const [model, setModel] = useState('llama3.2');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle =
      title.trim() || `${LANGUAGES.find((l) => l.code === language)?.name} Practice`;

    setIsCreating(true);
    setError(null);
    try {
      await startConversation({
        title: finalTitle,
        language,
        cefrLevel,
        provider,
        model: model.trim() || 'llama3.2',
      });
      setTitle('');
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>Start a conversation with the AI tutor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <InlineError message={error} onDismiss={() => setError(null)} />}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-generated if empty"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Practice Language *</label>
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
            <label className="text-sm font-medium text-foreground">Your Level</label>
            <select
              value={cefrLevel}
              onChange={(e) => setCefrLevel(e.target.value as CEFRLevel)}
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CEFR_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.value} — {level.desc}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">AI Provider</label>
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <label
                  key={p.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    provider === p.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={p.value}
                    checked={provider === p.value}
                    onChange={() => {
                      setProvider(p.value);
                      if (p.value === 'ollama') setModel('llama3.2');
                      else setModel('gpt-4o-mini');
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Model</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Starting...' : 'Start Conversation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
