import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Download,
  Trash2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';

interface VocabularyEntry {
  id: number;
  word: string;
  language: string;
  pos: string | null;
  cefr_level: string | null;
  translation: string | null;
  definition: string | null;
  phonetic: string | null;
  examples: string | null;
  source_module: string | null;
  context_sentence: string | null;
  deck_count: number;
  created_at: string;
  updated_at: string;
}

interface ListResult {
  items: VocabularyEntry[];
  total: number;
  page: number;
  page_size: number;
}

interface VocabStats {
  total_words: number;
  by_language: [string, number][];
  by_cefr: [string, number][];
  by_source: [string, number][];
  in_decks: number;
  not_in_decks: number;
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  A2: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  B1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  B2: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  C1: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  C2: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function VocabularyPage() {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [cefrFilter, setCefrFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<ListResult>('vocabulary_list', {
        language: languageFilter === 'all' ? null : languageFilter,
        cefrLevel: cefrFilter === 'all' ? null : cefrFilter,
        search: search || null,
        page,
        pageSize,
        sortBy,
        sortOrder,
      });
      setEntries(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, languageFilter, cefrFilter, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await invoke<VocabStats>('vocabulary_stats', {});
      setStats(s);
    } catch (_e) {
      // stats are optional
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleDelete = async (id: number) => {
    try {
      await invoke('vocabulary_delete', { id });
      fetchEntries();
      fetchStats();
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleBulkDelete = async () => {
    try {
      await invoke('vocabulary_bulk_delete', { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      fetchEntries();
      fetchStats();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleExport = async (format: string) => {
    try {
      const content = await invoke<string>('vocabulary_export', {
        language: languageFilter === 'all' ? null : languageFilter,
        format,
      });
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocabulary.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vocabulary</h1>
          {stats && (
            <p className="text-sm text-muted-foreground">
              {stats.total_words} words · {stats.in_decks} in decks ·{' '}
              {stats.by_language.length} languages
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <Download className="mr-1 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
            <Download className="mr-1 h-4 w-4" />
            JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search words or translations..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={languageFilter}
          onValueChange={(v) => {
            setLanguageFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {stats?.by_language.map(([lang, count]) => (
              <SelectItem key={lang} value={lang}>
                {lang.toUpperCase()} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={cefrFilter}
          onValueChange={(v) => {
            setCefrFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="CEFR" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      <ScrollArea className="flex-1 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={entries.length > 0 && selectedIds.size === entries.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('word')}>
                <span className="flex items-center gap-1">
                  Word <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead>Translation</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>CEFR</TableHead>
              <TableHead>POS</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Decks</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort('created_at')}
              >
                <span className="flex items-center gap-1">
                  Added <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-8 text-center text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center">
                  <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">No vocabulary yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Words will appear here as you learn from Reading, Podcast, and AI
                    Tutor
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      onCheckedChange={() => toggleSelection(entry.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{entry.word}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.translation || '\u2014'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {entry.language.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.cefr_level ? (
                      <Badge className={CEFR_COLORS[entry.cefr_level] || ''}>
                        {entry.cefr_level}
                      </Badge>
                    ) : (
                      '\u2014'
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.pos || '\u2014'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.source_module || '\u2014'}
                  </TableCell>
                  <TableCell>
                    {entry.deck_count > 0 ? entry.deck_count : '\u2014'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget(entry.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}
            {'\u2013'}
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Word</DialogTitle>
            <DialogDescription>
              This will remove the word from your vocabulary and all decks. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
