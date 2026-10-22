import { useState } from 'react';
import { Download, FileText, Cloud, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { useDeckHubStore } from '../../stores/deckHubStore';

interface Props {
  deckId: string;
}

export function ExportHub({ deckId }: Props) {
  const { t } = useTranslation('decks');
  const {
    isExporting,
    exportError,
    isSyncing,
    syncError,
    lastSyncResult,
    exportAnki,
    exportQuizlet,
    exportCsv,
    syncToCloud,
  } = useDeckHubStore();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, successText: () => string) => {
    setActiveAction(key);
    setSuccessMsg(null);
    try {
      await action();
      setSuccessMsg(successText());
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      // error already in store
    } finally {
      setActiveAction(null);
    }
  };

  const busy = isExporting || isSyncing;
  const icon = (key: string, idle: React.ReactNode) =>
    activeAction === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : idle;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{t('exportSync')}</h3>
      <p className="text-xs text-muted-foreground">{t('export.free')}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              'anki',
              () => exportAnki(deckId),
              () => t('export.doneAnki'),
            )
          }
        >
          {icon('anki', <Download className="h-3.5 w-3.5" />)}
          Anki (.apkg)
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              'csv',
              () => exportCsv(deckId),
              () => t('export.doneCsv'),
            )
          }
        >
          {icon('csv', <FileSpreadsheet className="h-3.5 w-3.5" />)}
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              'quizlet',
              () => exportQuizlet(deckId),
              () => t('export.doneQuizlet'),
            )
          }
        >
          {icon('quizlet', <FileText className="h-3.5 w-3.5" />)}
          Quizlet (TSV)
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(
              'cloud',
              () => syncToCloud(deckId),
              () =>
                lastSyncResult
                  ? t('export.doneCloud', { count: lastSyncResult.cardsSynced })
                  : t('export.doneCloudShort'),
            )
          }
        >
          {icon('cloud', <Cloud className="h-3.5 w-3.5" />)}
          {t('export.cloudSync')}
        </Button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      <InlineError message={exportError || syncError} />
    </div>
  );
}
