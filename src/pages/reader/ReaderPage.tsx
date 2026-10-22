import { useEffect, useState } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { getReaderDocument } from './services/readerService';
import { ReaderHome } from './ReaderHome';
import { ReaderFrame } from './text/ReaderFrame';
import { PdfReaderScreen } from './pdf/PdfReaderScreen';
import { TextDocumentPage } from './text/TextDocumentPage';
import { BookPage } from './library/BookPage';
import { LibraryPage } from './library/LibraryPage';

/**
 * Reader routes.
 *
 *   index              the reading home: continue card, queue, suggestions, Add dialog
 *   pdf/:documentId    the PDF pages view with tap-to-look-up
 *   text/:documentId   a pasted text or a web page, read as text
 *   book/:bookId       a ready-made library book
 *   library            the whole library
 */

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
      <Route path="text/:documentId" element={<TextDocumentPage />} />
      <Route path="book/:bookId" element={<BookPage />} />
      <Route path="library" element={<LibraryPage />} />
    </Routes>
  );
}
