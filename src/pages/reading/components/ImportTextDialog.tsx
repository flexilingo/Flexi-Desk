import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
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
import { cn } from '@/lib/utils';
import { FileText, Globe, ClipboardPaste, Loader2 } from 'lucide-react';

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

type Tab = 'paste' | 'url' | 'file';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (documentId: string) => void;
}

export function ImportTextDialog({ open: isOpen, onOpenChange, onImported }: Props) {
  const importText = useReadingStore((s) => s.importText);
  const [tab, setTab] = useState<Tab>('paste');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [language, setLanguage] = useState('en');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setUrl('');
    setFilePath('');
    setError(null);
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsImporting(true);
    setError(null);
    try {
      const doc = await importText(title.trim(), content.trim(), language);
      resetForm();
      onOpenChange(false);
      onImported?.(doc.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsImporting(true);
    setError(null);
    try {
      const doc = await invoke<{ id: string }>('reading_import_url', {
        url: url.trim(),
        language,
      });
      resetForm();
      onOpenChange(false);
      onImported?.(doc.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleFilePick = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Text Files', extensions: ['txt', 'md', 'text'] }],
    });
    if (selected) {
      setFilePath(selected as string);
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath) return;

    setIsImporting(true);
    setError(null);
    try {
      const doc = await invoke<{ id: string }>('reading_import_file', {
        filePath,
        language,
      });
      resetForm();
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

  const tabs: { id: Tab; label: string; icon: typeof ClipboardPaste }[] = [
    { id: 'paste', label: 'Paste Text', icon: ClipboardPaste },
    { id: 'url', label: 'From URL', icon: Globe },
    { id: 'file', label: 'From File', icon: FileText },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Text</DialogTitle>
          <DialogDescription>Import text to read and analyze word by word.</DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {error && <InlineError message={error} onDismiss={() => setError(null)} />}

        {/* Language selector (shared across all tabs) */}
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

        {/* Paste Text tab */}
        {tab === 'paste' && (
          <form onSubmit={handlePasteSubmit} className="space-y-4">
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
                rows={8}
                required
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || !content.trim() || isImporting}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isImporting ? 'Importing...' : 'Import'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* URL tab */}
        {tab === 'url' && (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">URL *</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                type="url"
                required
              />
              <p className="text-xs text-muted-foreground">
                The page content will be extracted and cleaned automatically.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!url.trim() || isImporting}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isImporting ? 'Fetching...' : 'Import from URL'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* File tab */}
        {tab === 'file' && (
          <form onSubmit={handleFileSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">File</label>
              <div className="flex gap-2">
                <Input
                  value={filePath}
                  readOnly
                  placeholder="No file selected"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleFilePick}>
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Supports .txt, .md, and .text files.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!filePath || isImporting}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isImporting ? 'Importing...' : 'Import File'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
