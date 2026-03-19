import { useState } from 'react';
import { Upload, X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ColumnMapper } from './components/ColumnMapper';
import { ImportPreview } from './components/ImportPreview';

interface ImportPreviewData {
  headers: string[];
  sample_rows: string[][];
  total_rows: number;
  suggested_mapping: ColumnMapping;
}

interface ColumnMapping {
  word_column: number;
  translation_column: number | null;
  definition_column: number | null;
  pos_column: number | null;
  cefr_column: number | null;
  phonetic_column: number | null;
  examples_column: number | null;
  context_column: number | null;
}

interface ImportResultData {
  total_rows: number;
  imported: number;
  skipped_duplicates: number;
  errors: { row: number; message: string }[];
}

type Step = 'source' | 'mapping' | 'preview' | 'result';
type Format = 'Csv' | 'Tsv' | 'Anki';

export function ImportDialog() {
  const [open2, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('source');
  const [format, setFormat] = useState<Format>('Csv');
  const [filePath, setFilePath] = useState('');
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [targetLang, setTargetLang] = useState('en');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('source');
    setFilePath('');
    setPreview(null);
    setMapping(null);
    setResult(null);
    setError(null);
  };

  const handleSelectFile = async (fmt: Format) => {
    setFormat(fmt);
    setError(null);

    const ext = fmt === 'Anki' ? ['apkg'] : fmt === 'Tsv' ? ['tsv', 'txt'] : ['csv', 'txt'];
    const selected = await open({
      filters: [{ name: 'Import file', extensions: ext }],
    });

    if (!selected) return;
    const path = typeof selected === 'string' ? selected : selected;
    setFilePath(path);

    if (fmt === 'Anki') {
      // Skip mapping for Anki, go straight to preview
      setStep('preview');
    } else {
      // Get preview for CSV/TSV
      try {
        const delim = fmt === 'Tsv' ? '\t' : ',';
        const prev = await invoke<ImportPreviewData>('import_preview_csv', {
          filePath: path,
          delimiter: delim,
        });
        setPreview(prev);
        setMapping(prev.suggested_mapping);
        setStep('mapping');
      } catch (err) {
        setError(String(err));
      }
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      const options = {
        format,
        column_mapping: mapping,
        target_language: targetLang,
        target_deck_id: null,
        skip_duplicates: skipDuplicates,
      };

      const res = await invoke<ImportResultData>('import_execute', {
        filePath,
        options,
      });
      setResult(res);
      setStep('result');
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog.Root open={open2} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) reset(); }}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md px-4 py-2 text-sm border border-border text-foreground hover:bg-muted">
          <Upload className="h-4 w-4" />
          Import Vocabulary
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Import Vocabulary
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Source */}
          {step === 'source' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Choose import source:</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['Csv', 'CSV File'],
                  ['Tsv', 'Quizlet (TSV)'],
                  ['Anki', 'Anki (.apkg)'],
                ] as [Format, string][]).map(([fmt, label]) => (
                  <button
                    key={fmt}
                    onClick={() => handleSelectFile(fmt)}
                    className="rounded-lg border border-border p-4 text-center text-sm hover:border-primary/50 hover:bg-muted transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && preview && mapping && (
            <div className="space-y-4">
              <ColumnMapper
                headers={preview.headers}
                mapping={mapping}
                onChange={setMapping}
              />
              <div className="flex justify-between">
                <button
                  onClick={() => setStep('source')}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  onClick={() => setStep('preview')}
                  className="flex items-center gap-1 rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {preview && mapping && (
                <ImportPreview
                  headers={preview.headers}
                  sampleRows={preview.sample_rows}
                  mapping={mapping}
                  totalRows={preview.total_rows}
                />
              )}
              {format === 'Anki' && (
                <p className="text-xs text-muted-foreground">
                  Anki cards will be imported with front as word and back as translation.
                </p>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Target Language</label>
                  <input
                    type="text"
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    placeholder="e.g. en, de, fa"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  Skip duplicates
                </label>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(format === 'Anki' ? 'source' : 'mapping')}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-1 rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-4 w-4 text-success" />
                  <span className="font-medium text-foreground">Import Complete</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Total rows: {result.total_rows}</p>
                  <p>Imported: {result.imported}</p>
                  <p>Skipped (duplicates): {result.skipped_duplicates}</p>
                  {result.errors.length > 0 && (
                    <p className="text-destructive">Errors: {result.errors.length}</p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show errors ({result.errors.length})
                  </summary>
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-destructive">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex justify-end">
                <Dialog.Close asChild>
                  <button className="rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90">
                    Done
                  </button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
