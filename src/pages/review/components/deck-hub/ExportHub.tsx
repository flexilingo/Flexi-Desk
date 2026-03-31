import { useState } from 'react';
import { Download, FileText, Cloud, FileSpreadsheet, Loader2, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeckHubStore } from '../../stores/deckHubStore';

interface Props {
  deckId: string;
}

export function ExportHub({ deckId }: Props) {
  const { isExporting, exportError, isSyncing, syncError, lastSyncResult, exportAnki, exportQuizlet, exportCsv, syncToCloud } = useDeckHubStore();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, successText: string) => {
    setActiveAction(key);
    setSuccessMsg(null);
    try {
      await action();
      setSuccessMsg(successText);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      // error already in store
    } finally {
      setActiveAction(null);
    }
  };

  const busy = isExporting || isSyncing;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Export & Sync</h3>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run('anki', () => exportAnki(deckId), 'Exported to Anki')}
          className="flex items-center gap-2 justify-start"
        >
          {activeAction === 'anki'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />
          }
          Anki (.apkg)
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run('csv', () => exportCsv(deckId), 'Exported to CSV')}
          className="flex items-center gap-2 justify-start"
        >
          {activeAction === 'csv'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileSpreadsheet className="w-3.5 h-3.5" />
          }
          CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run('quizlet', () => exportQuizlet(deckId), 'Exported for Quizlet')}
          className="flex items-center gap-2 justify-start"
        >
          {activeAction === 'quizlet'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileText className="w-3.5 h-3.5" />
          }
          Quizlet (TSV)
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run('cloud', () => syncToCloud(deckId), lastSyncResult ? `Synced ${lastSyncResult.cardsSynced} cards` : 'Synced to cloud')}
          className="flex items-center gap-2 justify-start"
        >
          {activeAction === 'cloud'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Cloud className="w-3.5 h-3.5" />
          }
          Cloud Sync
        </Button>
      </div>

      {/* Success */}
      {successMsg && (
        <div className="flex items-center gap-2 text-sm text-[#8BB7A3] bg-[#8BB7A3]/10 rounded-md px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Error */}
      {(exportError || syncError) && (
        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          <X className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{exportError || syncError}</span>
        </div>
      )}
    </div>
  );
}
