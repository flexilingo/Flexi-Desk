import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { FileText, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getReaderDocument, getReaderDocuments, importReaderPath } from './services/readerService';
import type { ReaderDocument } from './types';
import { ReaderFrame } from './text/ReaderFrame';
import { PdfReaderScreen } from './pdf/PdfReaderScreen';

/**
 * Reader routes.
 *
 *   index              minimal home (PHASE C replaces it with the continue card, the
 *                      queue and the add-document dialog)
 *   pdf/:documentId    the PDF pages view with tap-to-look-up
 */

/** An error from a local command is its code string; show it translated, never silently. */
function useErrorText() {
  const { t, i18n } = useTranslation('readerDesk');
  return (cause: unknown) => {
    const code =
      typeof cause === 'string' && /^[A-Z][A-Z0-9_]+$/.test(cause) ? cause : 'UNKNOWN_ERROR';
    const key = `errors.${code}`;
    return i18n.exists(key, { ns: 'readerDesk' }) ? t(key) : t('errors.UNKNOWN_ERROR');
  };
}

function ReaderHome() {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<ReaderDocument[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReaderDocuments()
      .then((result) => {
        if (!cancelled) setDocuments(result.items);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorText(cause));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPdf = useCallback(async () => {
    setError(null);
    setImporting(true);
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (typeof picked !== 'string') return;
      const doc = await importReaderPath({ path: picked });
      navigate(`/reader/pdf/${doc.id}`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setImporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <div className="min-w-0 max-w-full space-y-4 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Button onClick={() => void openPdf()} disabled={importing} className="inline-flex">
        {importing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FolderOpen className="h-4 w-4" />
        )}
        {importing ? t('pdf.opening') : tDesk('home.openPdf')}
      </Button>

      {error && (
        <p
          role="alert"
          className="max-w-xl rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {error}
        </p>
      )}

      {documents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t('library.heading')}</h2>
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  to={`/reader/pdf/${doc.id}`}
                  className="inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{doc.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReaderPdf() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const [title, setTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    setTitle('');
    getReaderDocument(documentId)
      .then((doc) => {
        if (!cancelled) setTitle(doc.title);
      })
      .catch(() => {
        // The screen reports an unreadable document itself; the title is only a label.
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <ReaderFrame>
      <PdfReaderScreen key={documentId} documentId={documentId} title={title} />
    </ReaderFrame>
  );
}

export function ReaderPage() {
  return (
    <Routes>
      <Route index element={<ReaderHome />} />
      <Route path="pdf/:documentId" element={<ReaderPdf />} />
    </Routes>
  );
}
