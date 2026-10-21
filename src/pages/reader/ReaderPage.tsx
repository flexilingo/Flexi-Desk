import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getReaderDocument } from './services/readerService';
import { ReaderHome } from './ReaderHome';
import { ReaderFrame } from './text/ReaderFrame';
import { PdfReaderScreen } from './pdf/PdfReaderScreen';

/**
 * Reader routes.
 *
 *   index              the reading home: continue card, queue, suggestions, Add dialog
 *   pdf/:documentId    the PDF pages view with tap-to-look-up
 *   book/:bookId       placeholder until phase F
 *   library            placeholder until phase F
 */

/** Library screens that arrive in phase F; a route now so nothing 404s. */
function ComingSoon({ kind }: { kind: 'book' | 'library' }) {
  const { t } = useTranslation('readerDesk');
  return (
    <div className="space-y-3 p-2">
      <h2 className="text-lg font-semibold text-foreground">{t(`soon.${kind}.title`)}</h2>
      <p className="max-w-xl text-sm text-muted-foreground">{t('soon.body')}</p>
      <Button asChild variant="outline">
        <Link to="/reader">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('soon.back')}
        </Link>
      </Button>
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
      <Route path="book/:bookId" element={<ComingSoon kind="book" />} />
      <Route path="library" element={<ComingSoon kind="library" />} />
    </Routes>
  );
}
