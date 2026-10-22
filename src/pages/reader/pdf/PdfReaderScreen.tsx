import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LookupProvider } from '@/components/lookup/LookupProvider';
import { speak, stop as stopSpeaking, useSpeechState } from '@/lib/speech';
import {
  deleteReaderMark,
  deleteReaderNote,
  deleteReaderTextBox,
  getReaderFileUrl,
  getReaderMarks,
  getReaderNotes,
  getReaderTextBoxes,
  getReaderWords,
  logReaderWord,
  saveReaderMark,
  saveReaderNote,
  saveReaderTextBox,
  setReaderEdition,
  setReaderLanguage,
  setReaderPageCount,
  setReaderPosition,
  startReaderSession,
} from '../services/readerService';
import type { ReaderNote, ReaderWordSummary } from '../types';
import { PDF_ASSET_OPTIONS, destroyDocument, loadPdfjs } from '../lib/pdfjs';
import { ReaderToolbar } from '../text/ReaderToolbar';
import { PdfLoading } from './PdfLoading';
import { PdfDocumentView, type PdfDocumentViewHandle } from './PdfDocumentView';
import type { PdfNoteMark, PdfOcrLayer, PdfWordSpeech } from './PdfPageView';
import { PdfTextLayerStatus } from './PdfTextLayerStatus';
import { documentBoilerplate } from '../lib/document-boilerplate';
import { useDocumentOcr } from '../lib/use-document-ocr';
import { PdfViewControls, type PdfPointerTool } from './PdfViewControls';
import { PdfNoteDialog, type EditingNote } from './PdfNoteDialog';
import { PdfNotesPanel } from './PdfNotesPanel';
import { PdfWordsPanel } from './PdfWordsPanel';
import { PdfWritingPanel } from './PdfWritingPanel';
import {
  CheatsheetPanel,
  CHEATSHEET_PANEL_START,
  type CheatsheetPanelState,
} from '@/pages/cheatsheet';
import { CHEATSHEET_LANGS } from '@/pages/cheatsheet/lib/types';
import { PdfEditorBar } from './PdfEditorBar';
import { ReaderDeckButton } from '../components/ReaderDeckButton';
import { anchorSelection, type NoteAnchor } from '../lib/note-anchor';
import { TextBoxStore } from '../lib/text-box-store';
import { MarkStore } from '../lib/mark-store';
import { usePageText } from '../lib/use-page-text';
import { useLanguageCorrection } from '../lib/use-language-correction';
import { LanguageNote } from '../components/LanguageNote';
import { PdfAudioPanel } from './PdfAudioPanel';
import { PdfVideoPanel } from './PdfVideoPanel';
import { claimBookEdition, getBookEditions } from '../services/bookService';
import { indexFromList, readTrackIndex, type TrackIndex } from '../lib/book-audio';
import { useTrackPlayer } from '../lib/use-track-player';
import { useAudioHold } from '../lib/use-audio-hold';
import { usePlayerKeys } from '../lib/use-player-keys';
import { useAuthStore } from '@/stores/authStore';
import type { BookEdition } from '../types';

/** How long the reader must sit still on a page before the bookmark is written. */
export const POSITION_DEBOUNCE_MS = 1500;

/** Per app, not per book: it is how this person reads, not a fact about a document. */
const TAP_TO_SPEAK_KEY = 'flexi-reader-tap-to-speak';

/** Set once the hand tool has been explained, so it is explained only once. */
const HAND_HINT_KEY = 'flexi-reader-hand-hint-seen';

type FileInfo = Awaited<ReturnType<typeof getReaderFileUrl>>;

/** A re-saved note keeps the place it was pinned to. */
function existingRect(note: ReaderNote | undefined) {
  return note
    ? {
        x: Number(note.rect_x),
        y: Number(note.rect_y),
        w: Number(note.rect_w),
        h: Number(note.rect_h),
      }
    : { x: 0, y: 0, w: 0, h: 0 };
}

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
  const [words, setWords] = useState<ReaderWordSummary[]>([]);
  const [wordsLoading, setWordsLoading] = useState(true);

  const refreshWords = useCallback(() => {
    getReaderWords({ documentId })
      .then((result) => setWords(result.items ?? []))
      .catch(() => {})
      .finally(() => setWordsLoading(false));
  }, [documentId]);
  const refreshNotes = useCallback(
    () =>
      getReaderNotes(documentId)
        .then((result) => setNotesData(result.items))
        .catch(() => {}),
    [documentId],
  );
  useEffect(refreshWords, [refreshWords]);

  /*
   * WHAT THE LEARNER HAS WRITTEN on the pages. Loaded once, then owned by the
   * stores — see `TextBoxStore` for why this is not React state. The local
   * database is written to behind the typing, never in front of it.
   */
  const [boxStore] = useState(() => new TextBoxStore());
  const [markStore] = useState(() => new MarkStore());
  const [writeLoadFailed, setWriteLoadFailed] = useState(false);
  const [writing, setWriting] = useState(false);
  /** Leaving write mode also stops the bar pointing at a box or a mark. */
  const toggleWriting = useCallback(
    () =>
      setWriting((on) => {
        if (on) {
          boxStore.setActive(null);
          markStore.setActive(null);
        }
        return !on;
      }),
    [boxStore, markStore],
  );

  useEffect(() => {
    boxStore.connect({
      save: (box) =>
        saveReaderTextBox({ document_id: documentId, ...box }).then((saved) => saved.id),
      remove: (id) => deleteReaderTextBox({ id }).then(() => undefined),
    });
    markStore.connect({
      save: (mark) =>
        saveReaderMark({ document_id: documentId, ...mark }).then((saved) => saved.id),
      remove: (id) => deleteReaderMark({ id }).then(() => undefined),
    });
  }, [boxStore, markStore, documentId]);

  const loadWritten = useCallback(() => {
    setWriteLoadFailed(false);
    Promise.all([getReaderTextBoxes(documentId), getReaderMarks(documentId)])
      .then(([boxes, marks]) => {
        boxStore.load(boxes.items);
        markStore.load(marks.items);
      })
      .catch(() => setWriteLoadFailed(true));
  }, [boxStore, markStore, documentId]);
  useEffect(loadWritten, [loadWritten]);

  // Leaving the book mid-sentence still keeps the sentence.
  useEffect(
    () => () => {
      boxStore.flushAll();
      markStore.flushAll();
    },
    [boxStore, markStore],
  );

  // One selection at a time: stepping into a text box lets go of any mark, so
  // the bar's delete and ink can never be pointed at two things at once.
  useEffect(
    () =>
      boxStore.subscribePen(() => {
        if (boxStore.penSnapshot().active) markStore.setActive(null);
      }),
    [boxStore, markStore],
  );

  // Only for the toolbar's count; the panel reads the boxes themselves.
  const subscribeWritten = useCallback(
    (listener: () => void) => boxStore.subscribeAll(listener),
    [boxStore],
  );
  const writtenCount = useSyncExternalStore(
    subscribeWritten,
    () => boxStore.allBoxes().filter((box) => box.body.trim()).length,
    () => 0,
  );

  // One panel at a time: they sit in the same column.
  const [panel, setPanel] = useState<
    'notes' | 'words' | 'audio' | 'video' | 'written' | 'cheatsheet' | null
  >(null);
  // The cheatsheet remembers where the reader was (page, search) across close and reopen.
  const [cheatsheetState, setCheatsheetState] =
    useState<CheatsheetPanelState>(CHEATSHEET_PANEL_START);
  const [editing, setEditing] = useState<(EditingNote & { anchor?: NoteAnchor | null }) | null>(
    null,
  );
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

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
      })
        .then(refreshWords)
        .catch(() => {});
    },
    [documentId, refreshWords],
  );

  const handleNoteFromSelection = useCallback(() => {
    const anchor = anchorSelection();
    if (!anchor) return;
    setEditing({ quote: anchor.quote, body: '', pageNumber: anchor.pageNumber, anchor });
    window.getSelection()?.removeAllRanges();
  }, []);

  // A note that is about the page rather than about a phrase. It gets no
  // rectangle, so nothing is drawn over the page — it lives in the panel, which
  // is where "this whole exercise was hard" belongs anyway.
  const handleNoteOnPage = useCallback(() => {
    setEditing({ quote: '', body: '', pageNumber: currentPageRef.current });
  }, []);

  // Rejects on failure: the dialog stays open with the text still in it and says why.
  const handleSaveNote = useCallback(
    async (body: string) => {
      if (!editing) return;
      const anchor = editing.anchor;
      // The local update writes every column, so a re-saved note carries its
      // stored place and text anchor along rather than blanking them.
      const stored = notesData.find((item) => item.id === editing.id);
      await saveReaderNote({
        id: editing.id,
        document_id: documentId,
        page: editing.pageNumber,
        quote: editing.quote,
        body,
        run_start: anchor ? anchor.runStart : (stored?.run_start ?? null),
        run_end: anchor ? anchor.runEnd : (stored?.run_end ?? null),
        rect: anchor?.rect ?? existingRect(stored),
      });
      setEditing(null);
      void refreshNotes();
    },
    [editing, documentId, notesData, refreshNotes],
  );

  const handleDeleteNote = useCallback(async () => {
    if (!editing?.id) return;
    await deleteReaderNote({ id: editing.id, document_id: documentId });
    setEditing(null);
    void refreshNotes();
  }, [editing, documentId, refreshNotes]);

  /** Go to a note and mark it, so arriving somewhere mid-page still shows WHERE. */
  const openNoteInPlace = useCallback(
    (note: { id: string; page_number: number; rect_y: number }) => {
      viewHandle.current?.scrollToPage(note.page_number, Number(note.rect_y));
      setActiveNoteId(note.id);
    },
    [],
  );
  const openNote = useCallback(
    (note: { id: string; quote: string; body: string; page_number: number }) =>
      setEditing({ id: note.id, quote: note.quote, body: note.body, pageNumber: note.page_number }),
    [],
  );

  const pageText = usePageText(pdf, documentId, currentPage);

  // The language the reader picks is the document's own from then on, and everything that
  // depends on it (lookup, voice, levels) reads the same state, so it follows at once.
  const changeLanguage = useCallback(
    (code: string) => {
      setPickedLanguage(code);
      setReaderLanguage({ document_id: documentId, language: code }).catch(() => {
        // Kept for this sitting even if it could not be saved.
      });
    },
    [documentId],
  );
  // A document stored under the wrong default language is corrected once, from its own text.
  const correction = useLanguageCorrection({
    documentId,
    language,
    pageText,
    onCorrected: setPickedLanguage,
  });

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

  /*
   * THE SCANNED PAGES' WORDS, read on this computer.
   *
   * Free for everyone, no page caps: the engine (`../ocr`) reads the page in front
   * of the reader first, then the other scanned pages, and keeps going in the
   * background. The OCR language is the DOCUMENT's — the toolbar's picker changes how
   * words are looked up, not how the print was set.
   */
  const boilerplate = useMemo<Promise<ReadonlySet<string>>>(
    () => (pdf ? documentBoilerplate(pdf) : Promise.resolve(new Set<string>())),
    [pdf],
  );
  const { state: ocrState, controller: ocrController } = useDocumentOcr(
    pdf,
    documentId,
    file?.language,
    boilerplate,
    currentPage,
  );
  const ocrLayer = useMemo<PdfOcrLayer>(
    () => ({
      documentId,
      active: true,
      onScanPage: (page) => ocrController?.reportScan(page),
      onPageWanted: (page) => ocrController?.prioritize(page),
      boilerplate,
      waiting: ocrState.status === 'running' || ocrState.status === 'pending',
    }),
    [documentId, ocrController, boilerplate, ocrState.status],
  );

  /*
   * BOOK EDITIONS. Which published book this file is — it unlocks the book's recordings,
   * videos and subtitles. The catalogue is the account's (`book-editions`), so it needs a
   * signed-in account; the document itself is local, so naming the edition is a local write.
   */
  const signedIn = useAuthStore((s) => !!s.session);
  const [editions, setEditions] = useState<BookEdition[]>([]);
  useEffect(() => {
    if (!signedIn) {
      setEditions([]);
      return;
    }
    let cancelled = false;
    getBookEditions()
      .then((answer) => !cancelled && setEditions(answer.items ?? []))
      .catch(() => !cancelled && setEditions([]));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Null until the reader changes it, so the document's own answer leads and a choice made
  // here wins from then on — the same shape as the language picker.
  const [pickedEdition, setPickedEdition] = useState<string | null>(null);
  const editionId = pickedEdition ?? file?.book_edition ?? '';
  const chooseEdition = useCallback(
    (id: string) => {
      setPickedEdition(id);
      setReaderEdition({ document_id: documentId, edition: id || null }).catch(() => {});
    },
    [documentId],
  );
  const edition = editions.find((item) => item.id === editionId) ?? null;

  // Name the edition to the account, so the server will sign its hosted recordings for this
  // local document. Before the server update this answers "unknown action" and nothing
  // visible happens (the audio panel keeps its own calm state).
  useEffect(() => {
    if (signedIn && editionId) claimBookEdition(editionId).catch(() => {});
  }, [signedIn, editionId]);

  // A book whose index the server holds (its PDF is a scan, with no text for `readTrackIndex`
  // to read) takes the list as it is.
  const listedIndex = useMemo(
    () => (pdf && edition?.tracks?.length ? indexFromList(edition, pdf.numPages) : null),
    [pdf, edition],
  );
  // Kept WITH the edition it was read for, so switching books cannot show the previous
  // book's pages. `index: null` means "read, and this book has no track index".
  const [indexed, setIndexed] = useState<{ editionId: string; index: TrackIndex | null } | null>(
    null,
  );
  // The book's own track index, read from its transcription pages at the back: a few pages
  // of text, never rendered, and only once a book is named.
  useEffect(() => {
    if (!pdf || !edition || edition.tracks?.length) return;
    let cancelled = false;
    const readFor = edition.id;
    readTrackIndex(pdf, edition)
      .then((index) => !cancelled && setIndexed({ editionId: readFor, index }))
      // A list by number is still true; a half-read map would not be.
      .catch(() => !cancelled && setIndexed({ editionId: readFor, index: null }));
    return () => {
      cancelled = true;
    };
  }, [pdf, edition]);
  const readIndex = indexed?.editionId === editionId ? indexed.index : null;
  const trackIndex = edition?.tracks?.length ? listedIndex : readIndex;
  const indexing = edition?.tracks?.length
    ? !pdf
    : Boolean(edition) && indexed?.editionId !== editionId;

  // The activity's name when the book gives one — "Track 34" means nothing to someone
  // holding page 35.
  const trackLabel = useCallback(
    (track: number) => trackIndex?.byTrack.get(track)?.title ?? t('pdf.audio.track', { n: track }),
    [t, trackIndex],
  );
  const player = useTrackPlayer(edition, { label: trackLabel });

  // The recording waits while a word is being read, a note written or spoken, or a book
  // video plays — and Space/arrows then belong to those, not the recording.
  const [wordDialogOpen, setWordDialogOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const audioHeld =
    wordDialogOpen || editing !== null || spoken.speaking || spoken.loading || videoPlaying;
  useAudioHold(audioHeld);
  usePlayerKeys(!audioHeld);

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
      noteLabel={t('pdf.notes.add')}
      onNote={handleNoteFromSelection}
      onDialogOpenChange={setWordDialogOpen}
    >
      <ReaderToolbar
        fileName={title}
        currentPage={currentPage}
        totalPages={pdf.numPages}
        zoom={zoom}
        language={language}
        noteCount={notes.length}
        notesOpen={panel === 'notes'}
        onToggleNotes={() => setPanel((open) => (open === 'notes' ? null : 'notes'))}
        wordCount={words.length}
        wordsOpen={panel === 'words'}
        onToggleWords={() => setPanel((open) => (open === 'words' ? null : 'words'))}
        writing={writing}
        onToggleWriting={toggleWriting}
        writtenCount={writtenCount}
        writtenOpen={panel === 'written'}
        onToggleWritten={() => setPanel((open) => (open === 'written' ? null : 'written'))}
        cheatsheetOpen={panel === 'cheatsheet'}
        onToggleCheatsheet={
          (CHEATSHEET_LANGS as readonly string[]).includes(language)
            ? () => setPanel((open) => (open === 'cheatsheet' ? null : 'cheatsheet'))
            : undefined
        }
        editionId={editionId}
        editions={editions}
        onEditionChange={chooseEdition}
        editionsNote={signedIn ? undefined : tDesk('audio.signInForEditions')}
        audioOpen={panel === 'audio'}
        audioCount={edition?.track_count ?? 0}
        onToggleAudio={
          edition ? () => setPanel((open) => (open === 'audio' ? null : 'audio')) : undefined
        }
        videoOpen={panel === 'video'}
        videoCount={edition?.videos?.length ?? 0}
        onToggleVideo={
          edition?.videos?.length
            ? () => setPanel((open) => (open === 'video' ? null : 'video'))
            : undefined
        }
        onZoomChange={changeZoom}
        tapToSpeak={tapToSpeak}
        onTapToSpeakChange={setTapToSpeak}
        onLanguageChange={changeLanguage}
        onGoToPage={(pageNumber) => viewHandle.current?.scrollToPage(pageNumber)}
      >
        <ReaderDeckButton
          pageText={pageText}
          page={currentPage}
          documentTitle={title}
          language={language}
        />
      </ReaderToolbar>

      {correction.note && (
        <LanguageNote
          code={correction.note.code}
          onPick={changeLanguage}
          onDismiss={correction.dismiss}
        />
      )}

      {writing && <PdfEditorBar store={boxStore} marks={markStore} onDone={toggleWriting} />}

      {/* Said, not swallowed: a page that silently shows none of your answers
          looks exactly like a page you never wrote on. */}
      {writeLoadFailed && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-border bg-error/10 px-4 py-2 text-xs text-error"
        >
          <span className="font-semibold">{t('pdf.write.loadFailed')}</span>
          <button
            type="button"
            onClick={loadWritten}
            className="inline-flex items-center rounded-md border border-error/40 px-2 py-0.5 font-semibold hover:bg-error/10"
          >
            {t('pdf.write.tryAgain')}
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <PdfTextLayerStatus state={ocrState} onRetry={() => ocrController?.retry()} />
          <PdfDocumentView
            pdf={pdf}
            zoom={zoom}
            onCurrentPageChange={setCurrentPage}
            handleRef={viewHandle}
            notes={notes}
            onOpenNote={openNote}
            activeNoteId={activeNoteId}
            language={language}
            onWordLookedUp={handleWordLookedUp}
            onSpeakWord={tapToSpeak ? speakWord : undefined}
            speech={speech}
            onStopSpeaking={stopSpeaking}
            ocr={ocrLayer}
            boxStore={boxStore}
            markStore={markStore}
            writing={writing}
            tool={writing ? 'select' : tool}
            onZoomChange={changeZoom}
          />
          <PdfViewControls
            zoom={zoom}
            onZoomChange={changeZoom}
            tool={tool}
            onToolChange={chooseTool}
            showTools={!writing}
            hint={handHint}
            onDismissHint={() => setHandHint(false)}
          />
        </div>

        {panel === 'notes' && (
          <PdfNotesPanel
            notes={notesData}
            currentPage={currentPage}
            onOpen={openNote}
            onGoToNote={openNoteInPlace}
            onAddToCurrentPage={handleNoteOnPage}
            onClose={() => setPanel(null)}
          />
        )}

        {panel === 'words' && (
          <PdfWordsPanel
            words={words}
            loading={wordsLoading}
            documentTitle={title}
            language={language}
            onGoToPage={(pageNumber) => viewHandle.current?.scrollToPage(pageNumber)}
            onClose={() => setPanel(null)}
          />
        )}

        {panel === 'written' && (
          <PdfWritingPanel
            store={boxStore}
            currentPage={currentPage}
            onGoToBox={(box) => {
              // Lands at the height the box sits at, not at the top of the
              // page — on a dense page the answer is the thing being looked for.
              viewHandle.current?.scrollToPage(box.page, box.y);
              if (writing) boxStore.setActive(box.key);
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'cheatsheet' && (
          <CheatsheetPanel
            lang={language}
            state={cheatsheetState}
            onStateChange={setCheatsheetState}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'video' && edition && !!edition.videos?.length && (
          <PdfVideoPanel
            edition={edition}
            // Until the book's index is read there is no offset to apply; a printed page is
            // the PDF page in a book without front matter.
            offset={trackIndex?.offset ?? edition.page_offset ?? 0}
            currentPage={currentPage}
            onGoToPage={(pageNumber) => viewHandle.current?.scrollToPage(pageNumber)}
            onPlayingChange={setVideoPlaying}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'audio' && edition && (
          <PdfAudioPanel
            edition={edition}
            index={trackIndex}
            indexing={indexing}
            currentPage={currentPage}
            player={player}
            onGoToPage={(pageNumber) => viewHandle.current?.scrollToPage(pageNumber)}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

      {editing && (
        <PdfNoteDialog
          key={editing.id ?? 'new'}
          note={editing}
          onSave={handleSaveNote}
          onDelete={editing.id ? handleDeleteNote : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </LookupProvider>
  );
}
