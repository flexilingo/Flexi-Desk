import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  getReaderOcrSummary,
  saveReaderOcrPage,
  setReaderTextLayerState,
} from '../services/readerService';
import type { ReaderTextLayerStatus } from '../types';
import { createOcrEngine, workerCount, type OcrEngine } from './engine';
import { emitOcrChanged } from './events';
import { ocrLanguageFor, type OcrLanguage } from './languages';
import { OcrQueue } from './queue';
import { releaseCanvas, renderPageForOcr } from './render';
import { isScanPage, paintsImage } from './scan-detection';

/** Why reading failed, for `readerDesk` `errors.*`. */
export const OCR_ERROR_ENGINE = 'OCR_ENGINE_FAILED';
export const OCR_ERROR_LANGUAGE = 'OCR_LANGUAGE_DOWNLOAD_FAILED';
export const OCR_ERROR_PAGE = 'OCR_PAGE_FAILED';

export type OcrPhase = 'idle' | 'download' | 'reading';

export interface OcrState {
  /** Null while nothing in the document has needed reading. */
  status: ReaderTextLayerStatus | null;
  done: number;
  /** Scanned pages found so far; final once the whole document has been looked at. */
  total: number | null;
  phase: OcrPhase;
  /** 0..1, while `phase` is `download`. */
  downloadProgress: number;
  /** The language being read, and whether it is a stand-in for one we have no data for. */
  language: OcrLanguage;
  errorCode: string | null;
  retrying: boolean;
}

/** Everything the controller needs from outside, so it can be driven without a webview. */
export interface OcrDeps {
  createEngine: typeof createOcrEngine;
  render: (pdf: PDFDocumentProxy, page: number) => Promise<HTMLCanvasElement>;
  workers: number;
  api: {
    summary: typeof getReaderOcrSummary;
    save: typeof saveReaderOcrPage;
    setState: typeof setReaderTextLayerState;
  };
  emit: typeof emitOcrChanged;
}

const defaultDeps = (): OcrDeps => ({
  createEngine: createOcrEngine,
  render: renderPageForOcr,
  workers: workerCount(),
  api: { summary: getReaderOcrSummary, save: saveReaderOcrPage, setState: setReaderTextLayerState },
  emit: emitOcrChanged,
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Reads a document's scanned pages on this computer and keeps their words in
 * the local database, so a scan becomes tappable like a digital page.
 *
 * Order of work: the page in front of the reader first, then the rest of the
 * scanned pages. A page is recognised at most once — what an earlier sitting
 * finished is read back from the database (`resume`), and closing the document
 * (`dispose`) stops after the page in flight, which is simply read again next time.
 */
export class DocumentOcr {
  private readonly queue = new OcrQueue();
  private readonly listeners = new Set<() => void>();
  private engine: Promise<OcrEngine> | null = null;
  private disposed = false;
  private started = false;
  private classified = false;
  private loops = 0;
  private lastPageError: string | null = null;
  private stateSnapshot: OcrState;
  private persistedRunning = false;

  constructor(
    private readonly pdf: PDFDocumentProxy,
    private readonly documentId: string,
    language: string | null | undefined,
    private readonly boilerplate: Promise<ReadonlySet<string>>,
    private readonly deps: OcrDeps = defaultDeps(),
  ) {
    this.stateSnapshot = {
      status: null,
      done: 0,
      total: null,
      phase: 'idle',
      downloadProgress: 0,
      language: ocrLanguageFor(language),
      errorCode: null,
      retrying: false,
    };
  }

  // ── observable state ─────────────────────────────────────────────────────
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  readonly getState = (): OcrState => this.stateSnapshot;

  private patch(next: Partial<OcrState>): void {
    this.stateSnapshot = { ...this.stateSnapshot, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  /** Learn what is already done, then start looking for scanned pages. */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    try {
      const summary = await this.deps.api.summary(this.documentId);
      if (this.disposed) return;
      this.queue.resume(summary.ready_pages, summary.failed_pages);
      const dbStatus = summary.state.status;
      // A layer that failed last time is simply tried again: nothing else would ever read it.
      this.patch({
        status: dbStatus === 'pending' || dbStatus === 'failed' ? 'running' : dbStatus,
        done: summary.ready_pages.length,
        total: summary.state.pages_total,
      });
      if (dbStatus === 'failed') {
        void this.persistState('running', summary.state.pages_total ?? undefined);
      }
      // Finished in an earlier sitting: nothing to look for, nothing to read.
      if (dbStatus === 'ready') {
        this.classified = true;
        return;
      }
      this.persistedRunning = dbStatus === 'running' || dbStatus === 'failed';
    } catch {
      // No summary is no reason to stop: the pages simply get looked at again.
    }
    void this.classify();
    this.pump();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    const engine = this.engine;
    this.engine = null;
    void engine?.then((e) => e.terminate()).catch(() => {});
  }

  // ── what the viewer tells us ─────────────────────────────────────────────
  /** The page in front of the reader. */
  setCurrentPage(page: number): void {
    this.queue.setCurrent(page);
    this.pump();
  }

  /** A rendered page turned out to be a scan. */
  reportScan(page: number): void {
    if (this.disposed || this.queue.isKnown(page)) return;
    this.queue.markScan(page);
    this.publishTotals();
    void this.ensureRunning();
    this.pump();
  }

  /** The reader asked for this page (clicked it while it was still being read). */
  prioritize(page: number): void {
    this.queue.setCurrent(page);
    this.pump();
  }

  /** Give failed pages, and a failed engine, another go. */
  retry(): void {
    if (this.disposed) return;
    this.queue.retry();
    this.lastPageError = null;
    // A language download that failed leaves a rejected engine behind: drop it.
    this.engine = null;
    this.patch({ status: 'running', errorCode: null, retrying: true });
    void this.persistState('running', this.stateSnapshot.total ?? undefined);
    this.pump();
  }

  // ── scan classification: which pages are scans? ──────────────────────────
  private async classify(): Promise<void> {
    try {
      const boilerplate = await this.boilerplate;
      const ops = (await import('pdfjs-dist')).OPS as unknown as Record<string, number>;
      // The page in front of the reader is looked at first, so its words are the first asked for.
      const first = this.queue.currentPage;
      const order: number[] = [];
      if (first !== null && first >= 1 && first <= this.pdf.numPages) order.push(first);
      for (let n = 1; n <= this.pdf.numPages; n += 1) if (n !== first) order.push(n);
      for (const n of order) {
        if (this.disposed) break;
        if (this.queue.isKnown(n)) continue;
        try {
          const page = await this.pdf.getPage(n);
          const content = await page.getTextContent();
          const own = content.items.map((item) => ('str' in item ? item.str : ''));
          let scan = false;
          // Only a page with little text can be a scan; skip the (costlier) operator list otherwise.
          if (isScanPage(own, boilerplate, true)) {
            const operators = await page.getOperatorList();
            scan = isScanPage(own, boilerplate, paintsImage(ops, operators.fnArray));
          }
          page.cleanup();
          if (scan) this.reportScan(n);
        } catch {
          // An unreadable page is the viewer's problem to show, not a reason to stop looking.
        }
        await tick();
      }
    } finally {
      this.classified = true;
      this.publishTotals();
      void this.finishIfIdle();
    }
  }

  private publishTotals(): void {
    const total = this.queue.totalKnown;
    // The total is only the total once every page has been looked at.
    this.patch({
      total: this.classified ? total || null : this.stateSnapshot.total,
      done: this.queue.doneCount,
    });
    if (this.classified && total > 0) {
      void this.persistState(this.queue.doneCount >= total ? 'ready' : 'running', total);
    }
  }

  // ── persistence ──────────────────────────────────────────────────────────
  private async persistState(
    status: ReaderTextLayerStatus,
    pagesTotal?: number,
    errorCode?: string,
  ): Promise<void> {
    try {
      await this.deps.api.setState({
        document_id: this.documentId,
        status,
        pages_total: pagesTotal,
        error_code: errorCode,
      });
      this.deps.emit(this.documentId, null);
    } catch {
      // The words themselves are saved per page; a state that could not be written is rewritten next time.
    }
  }

  /** The first scan found: the layer is on its way. */
  private async ensureRunning(): Promise<void> {
    if (this.persistedRunning) {
      return;
    }
    this.persistedRunning = true;
    if (this.stateSnapshot.status !== 'failed') this.patch({ status: 'running' });
    await this.persistState('running');
  }

  // ── the read loop ────────────────────────────────────────────────────────
  private getEngine(): Promise<OcrEngine> {
    this.engine ??= this.deps.createEngine({
      language: this.stateSnapshot.language.code,
      workers: this.deps.workers,
      isCancelled: () => this.disposed,
      onStatus: (s) => {
        if (this.disposed) return;
        this.patch(
          s.loadingLanguage
            ? { phase: 'download', downloadProgress: s.progress }
            : this.stateSnapshot.phase === 'download'
              ? { phase: 'reading' }
              : {},
        );
      },
    });
    return this.engine;
  }

  /** Start as many read loops as there are workers, if there is anything to read. */
  private pump(): void {
    // A failed engine stays failed until Retry; turning pages must not hammer the download.
    if (this.disposed || !this.started || this.stateSnapshot.status === 'failed') return;
    const size = this.deps.workers;
    while (this.loops < size && this.queue.next() !== null) {
      const slot = this.loops;
      this.loops += 1;
      void this.loop(slot).finally(() => {
        this.loops -= 1;
        void this.finishIfIdle();
      });
    }
  }

  private async loop(slot: number): Promise<void> {
    let engine: OcrEngine;
    try {
      engine = await this.getEngine();
    } catch {
      if (this.disposed) return;
      // The engine itself could not start: say so once, for the document, and do not mark pages failed.
      const code = this.stateSnapshot.phase === 'download' ? OCR_ERROR_LANGUAGE : OCR_ERROR_ENGINE;
      this.engine = null;
      this.patch({ status: 'failed', errorCode: code, phase: 'idle', retrying: false });
      void this.persistState('failed', this.stateSnapshot.total ?? undefined, code);
      return;
    }
    if (this.disposed) return;
    this.patch({ phase: 'reading', retrying: false });

    for (;;) {
      if (this.disposed) return;
      const page = this.queue.next();
      if (page === null) return;
      this.queue.markStarted(page);
      let canvas: HTMLCanvasElement | null = null;
      const began = performance.now();
      try {
        canvas = await this.deps.render(this.pdf, page);
        const rendered = performance.now();
        const words = await engine.recognize(canvas, slot);
        console.info('reader-ocr: page read', {
          page,
          renderMs: Math.round(rendered - began),
          recognizeMs: Math.round(performance.now() - rendered),
          words: words.words.length,
        });
        if (this.disposed) return;
        await this.deps.api.save({ document_id: this.documentId, page, words });
        this.queue.markDone(page);
        this.patch({ done: this.queue.doneCount });
        this.deps.emit(this.documentId, page);
      } catch (cause) {
        if (this.disposed) return;
        console.error('reader-ocr: page failed', { page, cause });
        this.lastPageError = OCR_ERROR_PAGE;
        this.queue.markFailed(page);
        try {
          await this.deps.api.save({
            document_id: this.documentId,
            page,
            error_code: OCR_ERROR_PAGE,
          });
        } catch {
          // Not stored: it is simply read again next sitting.
        }
        this.deps.emit(this.documentId, page);
      } finally {
        if (canvas) releaseCanvas(canvas);
      }
    }
  }

  /** All loops are over: the layer is finished, or it ended with pages that failed. */
  private async finishIfIdle(): Promise<void> {
    if (this.disposed || this.loops > 0 || this.queue.busy || !this.classified) return;
    if (this.stateSnapshot.status === 'failed') return; // an engine failure stands until Retry
    if (this.queue.next() !== null) {
      this.pump();
      return;
    }
    const total = this.queue.totalKnown;
    if (total === 0) return;
    if (this.queue.failedCount > 0) {
      const code = this.lastPageError ?? OCR_ERROR_PAGE;
      this.patch({ status: 'failed', errorCode: code, phase: 'idle', retrying: false });
      await this.persistState('failed', total, code);
      return;
    }
    this.patch({
      status: 'ready',
      phase: 'idle',
      errorCode: null,
      retrying: false,
      done: this.queue.doneCount,
      total,
    });
    await this.persistState('ready', total);
  }
}
