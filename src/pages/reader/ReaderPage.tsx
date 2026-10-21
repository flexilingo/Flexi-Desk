import { Routes, Route, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Reader routes — phase A placeholder.
 *
 * The data layer (`services/readerService.ts`, Rust `reader_*` commands, SQLite `reader_*`
 * tables) and the `reader` / `readingLibrary` i18n namespaces are in place; the screens
 * are ported from the website in later phases:
 *
 *   index              B/C  home: continue card, queue, add a document
 *   pdf/:documentId    B    the PDF viewer with tap-to-look-up
 */
function ReaderHome() {
  const { t } = useTranslation('reader');
  return (
    <div className="min-w-0 max-w-full space-y-2 p-6">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
    </div>
  );
}

function ReaderPdf() {
  const { documentId } = useParams<{ documentId: string }>();
  const { t } = useTranslation('reader');
  return (
    <div className="min-w-0 max-w-full space-y-2 p-6">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
      <p className="break-all text-sm text-muted-foreground">{documentId}</p>
    </div>
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
