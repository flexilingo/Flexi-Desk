import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getReaderDocument,
  getReaderTextPage,
  setReaderLanguage,
  setReaderPosition,
} from '../services/readerService';
import { useReaderErrorText } from '../lib/use-error-text';
import type { ReaderDocument } from '../types';
import { useLanguageCorrection } from '../lib/use-language-correction';
import { LanguageNote } from '../components/LanguageNote';
import { ReaderFrame } from './ReaderFrame';
import { ReaderTextScreen } from './ReaderTextScreen';
import { useReaderPager } from './useReaderPager';

/**
 * A pasted text or a web page, read as text in the reader's frame. The pages are on this
 * computer (`reader_text_page`); the bookmark is the document's own last page.
 */
export function TextDocumentPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const errorText = useReaderErrorText();
  const [doc, setDoc] = useState<ReaderDocument | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [language, setLanguage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setLoadError(null);
    setLanguage(null);
    getReaderDocument(documentId)
      .then((d) => !cancelled && setDoc(d))
      .catch((cause) => !cancelled && setLoadError(cause ?? 'DOCUMENT_NOT_FOUND'));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const fetchPage = useCallback(
    (page: number) => getReaderTextPage(documentId, page),
    [documentId],
  );
  const savePosition = useCallback(
    (page: number) => setReaderPosition({ document_id: documentId, page }),
    [documentId],
  );
  const pager = useReaderPager({
    id: documentId,
    fetchPage,
    savePosition,
    serverLastPage: doc?.last_page,
    isReady: !!doc,
  });

  // The language is the reader's to change for their own text; the choice is kept.
  const changeLanguage = useCallback(
    (code: string) => {
      setLanguage(code);
      setReaderLanguage({ document_id: documentId, language: code }).catch(() => {
        // The in-memory choice still applies for this sitting.
      });
    },
    [documentId],
  );

  const correction = useLanguageCorrection({
    documentId,
    language: language ?? doc?.language ?? 'en',
    pageText: pager.text,
    onCorrected: setLanguage,
  });

  if (loadError) {
    return (
      <ReaderFrame>
        <div className="min-h-0 flex-1 p-6">
          <p
            role="alert"
            className="mx-auto max-w-[68ch] rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
          >
            {errorText(loadError)}
          </p>
        </div>
      </ReaderFrame>
    );
  }
  if (!doc) {
    return (
      <ReaderFrame>
        <div className="min-h-0 flex-1 p-6">
          <div
            data-testid="text-loading"
            className="mx-auto h-64 max-w-[68ch] animate-pulse rounded-xl bg-card"
          />
        </div>
      </ReaderFrame>
    );
  }

  return (
    <ReaderFrame>
      <ReaderTextScreen
        title={doc.title}
        subtitle={(language ?? doc.language).toUpperCase()}
        language={language ?? doc.language}
        pager={pager}
        errorText={errorText(pager.error)}
        onLanguageChange={changeLanguage}
        notice={
          correction.note && (
            <LanguageNote
              code={correction.note.code}
              onPick={changeLanguage}
              onDismiss={correction.dismiss}
            />
          )
        }
      />
    </ReaderFrame>
  );
}
