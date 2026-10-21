import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LookupProvider } from '@/components/lookup/LookupProvider';
import { speak, stop as stopSpeaking, useSpeechState } from '@/lib/speech';
import {
  getReaderFileUrl,
  getReaderNotes,
  logReaderWord,
  setReaderPageCount,
  setReaderPosition,
  startReaderSession,
} from '../services/readerService';
import type { ReaderNote } from '../types';
import { PDF_ASSET_OPTIONS, destroyDocument, loadPdfjs } from '../lib/pdfjs';
import { ReaderToolbar } from '../text/ReaderToolbar';
import { PdfLoading } from './PdfLoading';
import { PdfDocumentView, type PdfDocumentViewHandle } from './PdfDocumentView';
import type { PdfNoteMark, PdfWordSpeech } from './PdfPageView';
import { PdfViewControls, type PdfPointerTool } from './PdfViewControls';

// PHASE D: `documentBoilerplate`, `PdfTextLayerStatus` and the OCR layer object (`PdfOcrLayer`)
// are wired in here; until the local extractor exists the viewer feeds `ocr={undefined}`.
// PHASE E: notes dialog + panel, words panel, write mode (`PdfEditorBar`, `PdfWritingPanel`,
// the box and mark stores). PHASE F: audio, video, cheatsheet, edition picker and the
// `useAudioHold` / `usePlayerKeys` hooks (ported in `../lib`, wired with the audio panel).

/** How long the reader must sit still on a page before the bookmark is written. */
export const POSITION_DEBOUNCE_MS = 1500;

/** Per app, not per book: it is how this person reads, not a fact about a document. */
const TAP_TO_SPEAK_KEY = 'flexi-reader-tap-to-speak';

/** Set once the hand tool has been explained, so it is explained only once. */
const HAND_HINT_KEY = 'flexi-reader-hand-hint-seen';

type FileInfo = Awaited<ReturnType<typeof getReaderFileUrl>>;

/** The backend rejects with its code string; anything else is unknown. */
function errorCodeOf(cause: unknown): string {
  if (typeof cause === 'string' && /^[A-Z][A-Z0-9_]+$/.test(cause)) return cause;
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : 'UNKNOWN_ERROR';
}

/**
 * Reading a stored PDF: the real pages, and everything that happened on them.
 *
 * The file is read from the app's own reader folder through the asset protocol —
 * pdf.js range-requests the bytes a page actually needs, which is what makes
 * opening a 200 MB textbook take a second. Nothing is downloaded or signed.
 *
 * Everything the reader does here is written down: where they stopped, and every
 * word they opened. That is the difference between a viewer and a book you can
 * actually get to the end of.
 */
export function PdfReaderScreen({ documentId, title }: { documentId: string; title: string }) {
  const { t } = useTranslation('reader');
  const { t: tDesk, i18n } = useTranslation('readerDesk');

  const [file, setFile] = useState<FileInfo | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [notesData, setNotesData] = useState<ReaderNote[]>([]);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setFileError(null);
    getReaderFileUrl(documentId)
      .then((info) => {
        if (!cancelled) setFile(info);
      })
      .catch((cause) => {
        if (!cancelled) setFileError(errorCodeOf(cause));
      });
    // The note underlines are drawn from this; failing to load them must not stop reading.
    getReaderNotes(documentId)
      .then((result) => {
        if (!cancelled) setNotesData(result.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const isLoading = file === null && fileError === null;

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  /*
   * HAND OR ARROW. The arrow selects text; the hand drags the page. Zooming in
   * past the width of the view picks the hand by itself — a zoomed page is one
   * you need to move around — and zooming back picks the arrow again, until the
   * reader chooses one; after that their choice stands.
   */
  const [tool, setTool] = useState<PdfPointerTool>('select');
  const toolChosenRef = useRef(false);
  const [handHint, setHandHint] = useState(false);
  const changeZoom = useCallback((next: number) => {
    setZoom(next);
    if (toolChosenRef.current) return;
    setTool(next > 1 ? 'hand' : 'select');
    if (next > 1) {
      try {
        if (!localStorage.getItem(HAND_HINT_KEY)) {
          localStorage.setItem(HAND_HINT_KEY, '1');
          setHandHint(true);
        }
      } catch {
        // No storage: no hint, nothing else lost.
      }
    }
  }, []);
  const chooseTool = useCallback((next: PdfPointerTool) => {
    toolChosenRef.current = true;
    setTool(next);
    setHandHint(false);
  }, []);
  useEffect(() => {
    if (!handHint) return;
    const timer = setTimeout(() => setHandHint(false), 12_000);
    return () => clearTimeout(timer);
  }, [handHint]);
  const [currentPage, setCurrentPage] = useState(1);
  // The document's own language leads; a language the reader picks in the
  // toolbar wins from then on. Derived rather than copied into state, so the
  // first render after the document loads already has the right one.
  const [pickedLanguage, setPickedLanguage] = useState<string | null>(null);
  // How far the FILE itself has loaded. pdf.js reports it while the document
  // opens, which for a 191 MB book is the difference between a blank panel and
  // a page that is visibly doing something.
  const [openProgress, setOpenProgress] = useState<number | null>(null);

  /**
   * TAP TO SPEAK: a click on a word says it instead of opening it.
   *
   * For reading aloud to yourself, where the question is "how is this one
   * said", asked every few lines. A dialog per word is a click in and a click
   * out each time; this is one click and the eyes never leave the line. The
   * translation is still there — the chip the click raises under the word
   * offers it, next to the voice showing the word being said.
   */
  const [tapToSpeak, setTapToSpeakState] = useState(() => {
    try {
      return window.localStorage.getItem(TAP_TO_SPEAK_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const setTapToSpeak = useCallback((on: boolean) => {
    // Applied first: a failed write only costs the choice its persistence.
    setTapToSpeakState(on);
    try {
      window.localStorage.setItem(TAP_TO_SPEAK_KEY, String(on));
    } catch {
      /* quota — the in-memory value still applies */
    }
  }, []);

  const language = pickedLanguage ?? file?.language ?? 'en';

  // Each tap cuts the last word off rather than queueing behind it (the speech
  // module does that): someone tapping down a line wants the word they are on now.
  const speakWord = useCallback((word: string) => void speak(word, language), [language]);
  const spoken = useSpeechState();
  // Which word, not just whether: the chip under a word shows a spinner only if
  // it is THAT word being said.
  const speech = useMemo<PdfWordSpeech>(
    () => ({ word: spoken.text, loading: spoken.loading, speaking: spoken.speaking }),
    [spoken.text, spoken.loading, spoken.speaking],
  );
  // A word still being said must not outlive the book.
  useEffect(() => () => stopSpeaking(), []);

  const viewHandle = useRef<PdfDocumentViewHandle | null>(null);
  const sessionRef = useRef<string | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const resumedRef = useRef(false);

  useEffect(() => {
    pdfRef.current = pdf;
  }, [pdf]);
  useEffect(() => () => void destroyDocument(pdfRef.current), []);

  // Open the document from its asset URL.
  useEffect(() => {
    if (!file?.url) return;
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url: file.url, ...PDF_ASSET_OPTIONS });
        task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (!cancelled && total > 0) setOpenProgress(Math.min(1, loaded / total));
        };
        const doc = await task.promise;
        if (cancelled) {
          void doc.loadingTask?.destroy();
          return;
        }
        opened = doc;
        setPdf(doc);
      } catch (cause) {
        if (cancelled) return;
        console.error('pdf-reader: could not open stored document', { documentId, cause });
        setLoadError(
          (cause as { name?: string })?.name === 'PasswordException'
            ? 'PDF_PASSWORD_PROTECTED'
            : 'PDF_COULD_NOT_OPEN',
        );
      }
    })();

    return () => {
      cancelled = true;
      void opened?.loadingTask?.destroy();
    };
  }, [file?.url, documentId]);

  // DESK ONLY: the viewer is the one that can count the pages, so it reports the
  // number back the first time it differs from what the library has stored.
  useEffect(() => {
    if (!pdf || !file || file.page_count === pdf.numPages) return;
    setReaderPageCount({ document_id: documentId, page_count: pdf.numPages }).catch(() => {});
  }, [pdf, file, documentId]);

  // The page last written to the bookmark, and whether the resume jump has
  // happened. Together they say whether leaving now has anything to flush.
  const savedPageRef = useRef(1);
  const resumeDoneRef = useRef(false);
  const currentPageRef = useRef(1);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Jump back to where reading stopped — once, and only after the pages exist
  // to jump to. Repeating it would fight the reader every time they scrolled.
  useEffect(() => {
    if (!pdf || resumedRef.current) return;
    const page = file?.last_page ?? 1;
    resumedRef.current = true;
    savedPageRef.current = page;
    if (page <= 1) {
      resumeDoneRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      viewHandle.current?.scrollToPage(page);
      resumeDoneRef.current = true;
    }, 300);
    return () => clearTimeout(timer);
  }, [pdf, file?.last_page]);

  // Open the sitting once the document is up, so an abandoned load leaves no
  // empty session behind.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    startReaderSession({
      document_id: documentId,
      page: file?.last_page ?? 1,
      page_count: pdf.numPages,
    })
      .then((result) => {
        if (!cancelled) sessionRef.current = result.session_id;
      })
      .catch(() => {
        // Reading without a session is degraded, not broken: the words simply
        // land on the document instead of on a sitting.
      });
    return () => {
      cancelled = true;
    };
  }, [pdf, documentId, file?.last_page]);

  // Bookmark, debounced. Writing on every scroll tick would be a request per
  // frame; the unmount flush below covers a window closed before the pause ends.
  useEffect(() => {
    if (!pdf || currentPage < 1) return;
    const timer = setTimeout(() => {
      savedPageRef.current = currentPage;
      setReaderPosition({ document_id: documentId, page: currentPage }).catch(() => {});
    }, POSITION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pdf, currentPage, documentId]);

  // Leaving the book mid-pause still keeps the place. Not before the resume jump
  // has happened: the page counter starts at 1 and would overwrite the real bookmark.
  useEffect(
    () => () => {
      if (!resumeDoneRef.current || currentPageRef.current === savedPageRef.current) return;
      setReaderPosition({ document_id: documentId, page: currentPageRef.current }).catch(() => {});
    },
    [documentId],
  );

  const handleWordLookedUp = useCallback(
    (word: string, context: string, pageNumber: number) => {
      logReaderWord({
        document_id: documentId,
        session_id: sessionRef.current ?? undefined,
        word,
        context,
        page: pageNumber,
      }).catch(() => {});
    },
    [documentId],
  );

  const notes = useMemo<PdfNoteMark[]>(
    () =>
      notesData.map((note) => ({
        id: note.id,
        quote: note.quote,
        body: note.body,
        page_number: note.page_number,
        rect_x: Number(note.rect_x),
        rect_y: Number(note.rect_y),
        rect_w: Number(note.rect_w),
        rect_h: Number(note.rect_h),
      })),
    [notesData],
  );

  const errorCode = loadError ?? fileError;
  if (errorCode) {
    const key = `errors.${errorCode}`;
    return (
      <div className="p-4 sm:p-6">
        <p
          role="alert"
          className="inline-block max-w-xl rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
        >
          {i18n.exists(key, { ns: 'readerDesk' }) ? tDesk(key) : tDesk('errors.UNKNOWN_ERROR')}
        </p>
      </div>
    );
  }

  if (isLoading || !pdf) {
    return <PdfLoading title={title} progress={openProgress} />;
  }

  return (
    <LookupProvider
      language={language}
      phraseSelection
      translateLabel={t('read.translateSelection')}
      audioLabel={t('read.playSelection')}
      closeLabel={t('pdf.notes.close')}
      // PHASE E: `noteLabel={t('pdf.notes.add')}` and `onNote={handleNoteFromSelection}`
      // (anchorSelection -> note dialog). Without `onNote` the chip has no note button.
    >
      <ReaderToolbar
        fileName={title}
        currentPage={currentPage}
        totalPages={pdf.numPages}
        zoom={zoom}
        language={language}
        noteCount={notes.length}
        // PHASE E: onToggleNotes / onToggleWords / onToggleWriting / onToggleWritten
        // (+ wordCount, writtenCount, open flags). PHASE F: onToggleAudio / onToggleVideo /
        // onToggleCheatsheet / editions / onEditionChange. Omitted handlers hide their buttons.
        onZoomChange={changeZoom}
        tapToSpeak={tapToSpeak}
        onTapToSpeakChange={setTapToSpeak}
        onLanguageChange={setPickedLanguage}
        onGoToPage={(pageNumber) => viewHandle.current?.scrollToPage(pageNumber)}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* PHASE D: <PdfTextLayerStatus /> pill sits here while the scanned pages are read. */}
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <PdfDocumentView
            pdf={pdf}
            zoom={zoom}
            onCurrentPageChange={setCurrentPage}
            handleRef={viewHandle}
            notes={notes}
            // PHASE E: opens the note dialog for this note.
            onOpenNote={() => {}}
            language={language}
            onWordLookedUp={handleWordLookedUp}
            onSpeakWord={tapToSpeak ? speakWord : undefined}
            speech={speech}
            onStopSpeaking={stopSpeaking}
            // PHASE E: boxStore / markStore / writing. PHASE D: ocr.
            tool={tool}
            onZoomChange={changeZoom}
          />
          <PdfViewControls
            zoom={zoom}
            onZoomChange={changeZoom}
            tool={tool}
            onToolChange={chooseTool}
            showTools
            hint={handHint}
            onDismissHint={() => setHandHint(false)}
          />
        </div>
        {/* PHASE E/F: the side panel (notes, words, written, video, cheatsheet, audio) opens here. */}
      </div>
    </LookupProvider>
  );
}
