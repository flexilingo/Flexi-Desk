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
import { useReadingStore } from '../stores/readingStore';

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (documentId: string) => void;
}

export function ImportTextDialog({ open, onOpenChange, onImported }: Props) {
  const importText = useReadingStore((s) => s.importText);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('en');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsImporting(true);
    setError(null);
    try {
      const doc = await importText(title.trim(), content.trim(), language);
      setTitle('');
      setContent('');
      onOpenChange(false);
      onImported?.(doc.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const wordCount = content.trim()
    ? content
        .trim()
        .split(/\s+/)
        .filter((w) => /\w/.test(w)).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Text</DialogTitle>
          <DialogDescription>Paste a text to read and analyze word by word.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <InlineError message={error} onDismiss={() => setError(null)} />}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., News article about climate"
              required
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
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Text *</label>
              {wordCount > 0 && (
                <span className="text-xs text-muted-foreground">~{wordCount} words</span>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your text here..."
              rows={10}
              required
              className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !content.trim() || isImporting}>
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
