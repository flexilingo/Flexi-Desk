import { useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LanguageSearchSelect } from '@/pages/account/components/LanguageSearchSelect';
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

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settingsDesk');
  const { t: ta } = useTranslation('account');
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
      filters: [{ name: t('import.fileFilter'), extensions: ext }],
    });

    if (!selected) return;
    const path = selected;
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

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) reset();
  };

  const sources: [Format, string][] = [
    ['Csv', t('import.sourceCsv')],
    ['Tsv', t('import.sourceTsv')],
    ['Anki', t('import.sourceAnki')],
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('import.title')}</DialogTitle>
          <DialogDescription>{t('import.hint')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {step === 'source' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('import.chooseSource')}</p>
              <div className="flex flex-wrap gap-2">
                {sources.map(([fmt, label]) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleSelectFile(fmt)}
                    className="inline-flex items-center rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:border-primary/50 hover:bg-muted"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'mapping' && preview && mapping && (
            <div className="space-y-4">
              <ColumnMapper headers={preview.headers} mapping={mapping} onChange={setMapping} />
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setStep('source')}>
                  <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('common.back')}
                </Button>
                <Button onClick={() => setStep('preview')}>
                  {t('common.next')} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </Button>
              </div>
            </div>
          )}

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
                <p className="text-xs text-muted-foreground">{t('import.ankiNote')}</p>
              )}

              <div className="space-y-3">
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {t('import.targetLanguage')}
                  </span>
                  <LanguageSearchSelect
                    value={targetLang}
                    onSelect={setTargetLang}
                    label={t('import.targetLanguage')}
                    searchPlaceholder={ta('desk.learning.search')}
                    noResults={ta('desk.learning.noResults')}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  {t('import.skipDuplicates')}
                </label>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(format === 'Anki' ? 'source' : 'mapping')}
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t('common.back')}
                </Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                  {importing ? t('import.importing') : t('import.action')}
                </Button>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  <span className="font-medium text-foreground">{t('import.complete')}</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>{t('import.totalRows', { count: result.total_rows })}</p>
                  <p>{t('import.imported', { count: result.imported })}</p>
                  <p>{t('import.skipped', { count: result.skipped_duplicates })}</p>
                  {result.errors.length > 0 && (
                    <p className="text-destructive">
                      {t('import.errorsCount', { count: result.errors.length })}
                    </p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    {t('import.showErrors', { count: result.errors.length })}
                  </summary>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-destructive">
                        {t('import.rowError', { row: err.row, message: err.message })}
                      </p>
                    ))}
                  </div>
                </details>
              )}

              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>{t('common.done')}</Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
