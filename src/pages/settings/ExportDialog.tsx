import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@/lib/nativeDialog';
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
import { cn } from '@/lib/utils';

interface ExportResult {
  file_path: string;
  total_items: number;
  format: string;
}

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Controlled dialog: the Data tab owns the trigger button. */
export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settingsDesk');
  const { t: ta } = useTranslation('account');
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
            name: format === 'Csv' ? t('export.csvFiles') : t('export.ankiPackage'),
            extensions: [ext],
          },
        ],
      });
      if (!filePath) return;

      const options = {
        format,
        include_fields: [],
        filter_language: filterLang || null,
        filter_cefr: filterCefr || null,
        filter_source: null,
        deck_id: null,
      };
      const command = format === 'Csv' ? 'export_vocabulary_csv' : 'export_vocabulary_anki';
      setResult(await invoke<ExportResult>(command, { filePath, options }));
    } catch (err) {
      setError(String(err));
    } finally {
      setExporting(false);
    }
  };

  const choice = (active: boolean) =>
    cn(
      'inline-flex items-center rounded-md border px-4 py-2 text-sm transition-colors',
      active
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border text-muted-foreground hover:border-primary/50',
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
          <DialogDescription>{t('export.hint')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div>
            <span className="mb-2 block text-sm font-medium text-foreground">
              {t('export.format')}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormat('Csv')}
                className={choice(format === 'Csv')}
              >
                {t('export.csv')}
              </button>
              <button
                type="button"
                onClick={() => setFormat('Anki')}
                className={choice(format === 'Anki')}
              >
                {t('export.anki')}
              </button>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs text-muted-foreground">
              {t('export.languageOptional')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSearchSelect
                value={filterLang || 'en'}
                onSelect={setFilterLang}
                label={t('export.languageOptional')}
                searchPlaceholder={ta('desk.learning.search')}
                noResults={ta('desk.learning.noResults')}
              />
              {filterLang && (
                <Button variant="ghost" size="sm" onClick={() => setFilterLang('')}>
                  {t('export.allLanguages')}
                </Button>
              )}
            </div>
            {!filterLang && (
              <p className="mt-1 text-xs text-muted-foreground">{t('export.allLanguagesNote')}</p>
            )}
          </div>

          <div>
            <label htmlFor="export-cefr" className="mb-1 block text-xs text-muted-foreground">
              {t('export.cefrOptional')}
            </label>
            <select
              id="export-cefr"
              value={filterCefr}
              onChange={(e) => setFilterCefr(e.target.value)}
              className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">{t('export.allLevels')}</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {result && (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-foreground">
              {t('export.done', { count: result.total_items, format: result.format.toUpperCase() })}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? t('export.exporting') : t('export.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
