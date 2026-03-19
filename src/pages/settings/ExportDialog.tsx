import { useState } from 'react';
import { Download, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

interface ExportResult {
  file_path: string;
  total_items: number;
  format: string;
}

export function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'Csv' | 'Anki'>('Csv');
  const [filterLang, setFilterLang] = useState('');
  const [filterCefr, setFilterCefr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setResult(null);

    try {
      const ext = format === 'Csv' ? 'csv' : 'apkg';
      const filePath = await save({
        defaultPath: `flexilingo-vocabulary.${ext}`,
        filters: [
          {
            name: format === 'Csv' ? 'CSV Files' : 'Anki Package',
            extensions: [ext],
          },
        ],
      });

      if (!filePath) {
        setExporting(false);
        return;
      }

      const options = {
        format,
        include_fields: [],
        filter_language: filterLang || null,
        filter_cefr: filterCefr || null,
        filter_source: null,
        deck_id: null,
      };

      const command =
        format === 'Csv' ? 'export_vocabulary_csv' : 'export_vocabulary_anki';
      const res = await invoke<ExportResult>(command, {
        filePath,
        options,
      });
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md px-4 py-2 text-sm border border-border text-foreground hover:bg-muted">
          <Download className="h-4 w-4" />
          Export Vocabulary
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Export Vocabulary
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Format */}
          <div className="mb-4">
            <label className="text-sm font-medium text-foreground block mb-2">Format</label>
            <div className="flex gap-2">
              {(['Csv', 'Anki'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-md px-4 py-2 text-sm border transition-colors ${
                    format === f
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {f === 'Csv' ? 'CSV' : 'Anki (.apkg)'}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Language (optional)
              </label>
              <input
                type="text"
                value={filterLang}
                onChange={(e) => setFilterLang(e.target.value)}
                placeholder="e.g. en, fa, de"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                CEFR Level (optional)
              </label>
              <select
                value={filterCefr}
                onChange={(e) => setFilterCefr(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">All levels</option>
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground">
              Exported {result.total_items} items to {result.format.toUpperCase()}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="rounded-md px-4 py-2 text-sm border border-border text-muted-foreground hover:bg-muted">
                Close
              </button>
            </Dialog.Close>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
