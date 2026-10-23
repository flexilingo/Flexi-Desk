import {
  forwardRef,
  useLayoutEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FileText,
  Headphones,
  ListChecks,
  Maximize2,
  Minimize2,
  Minus,
  PenLine,
  Plus,
  RefreshCw,
  Settings2,
  StickyNote,
  WholeWord,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { targetLanguages as sourceLanguages } from '@/config/languages';
import { cn } from '@/lib/utils';
import type { BookEdition } from '../types';
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN, stepTextScale } from './text-scale';
import { ZOOM_MAX, ZOOM_MIN, stepZoom } from './zoom';
import { useReaderFrame } from './reader-frame-context';

/**
 * One tool on the reader's bar: an icon with its name small underneath, no
 * frame. Eight framed buttons in a row read as eight equal calls to action
 * beside the page; the reader only needs to find a tool and see which panel
 * is open. Open is an olive line under the tool — it reports state, it is not
 * an action.
 *
 * `marked`: there is something of the reader's own behind it (words looked up,
 * answers, notes) — a dot, not a count; the panel's header has the number.
 */
export const ReaderToolbarItem = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'> & {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    marked?: boolean;
    busy?: boolean;
  }
>(function ReaderToolbarItem(
  { icon: Icon, label, active, marked, busy, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={rest['aria-label'] ?? label}
      className={`relative inline-flex h-9 min-w-9 shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:min-w-[3.25rem] ${
        active ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } ${className}`}
      {...rest}
    >
      <span className="relative">
        <Icon
          className={`h-[18px] w-[18px] ${busy ? 'animate-spin' : ''}`}
          strokeWidth={active ? 2.25 : 1.75}
        />
        {marked && (
          <span className="absolute -end-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </span>
      <span
        className={`hidden whitespace-nowrap text-[11px] leading-none sm:block ${active ? 'font-semibold' : 'font-medium'}`}
      >
        {label}
      </span>
      {active && <span className="absolute inset-x-2 -bottom-1 h-[2px] rounded-full bg-primary" />}
    </button>
  );
});

export function ReaderToolbar({
  fileName,
  subtitle,
  currentPage,
  totalPages,
  zoom,
  language,
  onZoomChange,
  onLanguageChange,
  scale,
  onScaleChange,
  tapToSpeak,
  onTapToSpeakChange,
  editionId,
  editions,
  onEditionChange,
  editionsNote,
  noteCount,
  notesOpen,
  onToggleNotes,
  wordCount,
  wordsOpen,
  onToggleWords,
  writing,
  onToggleWriting,
  writtenCount,
  writtenOpen,
  onToggleWritten,
  audioOpen,
  audioCount,
  onToggleAudio,
  videoOpen,
  videoCount,
  onToggleVideo,
  cheatsheetOpen,
  onToggleCheatsheet,
  onGoToPage,
  onChangeFile,
  children,
}: {
  fileName: string;
  /** A line under the title — an author, a level, a language. */
  subtitle?: string;
  currentPage: number;
  totalPages: number;
  /**
   * Zoom and text size are the SAME control to a reader and two different
   * things to the code: a PDF page is rasterised at a scale, reflowing text
   * just has bigger letters. Each surface passes the one it has, and the
   * settings popover shows that one.
   */
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  scale?: number;
  onScaleChange?: (scale: number) => void;
  /** A click on a word says it instead of opening it. Omitted where a surface has no such mode. */
  tapToSpeak?: boolean;
  onTapToSpeakChange?: (on: boolean) => void;
  /** Omitted when the text's language is not the reader's to change — a published book declares it. */
  language?: string;
  onLanguageChange?: (language: string) => void;
  /** Which published book this file is, if the reader recognises it. Unlocks its audio. */
  editionId?: string;
  editions?: BookEdition[];
  onEditionChange?: (id: string) => void;
  /** DESK: said in place of the edition picker when the catalogue cannot be reached (signed out). */
  editionsNote?: string;
  noteCount?: number;
  notesOpen?: boolean;
  onToggleNotes?: () => void;
  /** Words looked up in this document — the panel that turns them into cards. */
  wordCount?: number;
  wordsOpen?: boolean;
  onToggleWords?: () => void;
  /** Write mode is on: clicks on the page place text boxes. */
  writing?: boolean;
  onToggleWriting?: () => void;
  /** How many answers are written in this book. */
  writtenCount?: number;
  writtenOpen?: boolean;
  onToggleWritten?: () => void;
  audioOpen?: boolean;
  /** How many recordings the named book has. */
  audioCount?: number;
  onToggleAudio?: () => void;
  videoOpen?: boolean;
  /** How many videos the named book has. The button only exists when it has some. */
  videoCount?: number;
  onToggleVideo?: () => void;
  /** The grammar book beside the page. Only offered for a language the cheatsheet covers. */
  cheatsheetOpen?: boolean;
  onToggleCheatsheet?: () => void;
  onGoToPage: (pageNumber: number) => void;
  /** Omitted for a stored document: it is not "a file you opened", it is a book you own. */
  onChangeFile?: () => void;
  /** Anything this surface adds to the end of the row — the page deck, for one. */
  children?: ReactNode;
}) {
  const { t } = useTranslation('reader');

  // Null means "not being edited", so the field simply shows whichever page
  // scrolling has reached. Holding a copy of `currentPage` in state instead
  // would need an effect to re-sync it on every scroll, and that effect is a
  // render behind — the number visibly lags the page.
  const [draftPage, setDraftPage] = useState<string | null>(null);
  const pageValue = draftPage ?? String(currentPage);

  const commitPage = () => {
    const parsed = Number.parseInt(pageValue, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= totalPages) onGoToPage(parsed);
    setDraftPage(null);
  };

  // Inside a ReaderFrame the toolbar carries the frame's way back and its
  // full-screen switch, so the page has one bar of chrome rather than two.
  const frame = useReaderFrame();
  const setHasToolbar = frame?.setHasToolbar;
  useLayoutEffect(() => {
    if (!setHasToolbar) return;
    setHasToolbar(true);
    return () => setHasToolbar(false);
  }, [setHasToolbar]);

  const progress =
    totalPages > 1 ? Math.min(100, Math.max(0, (currentPage / totalPages) * 100)) : null;

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-card px-3 py-1.5 sm:px-4">
      {/* How far into the book, at a glance and without a number: a hairline
          along the bar's bottom edge. */}
      {progress !== null && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px]" aria-hidden>
          {/* Reading progress, a continuous value. */}
          <div
            className="h-full bg-primary/70 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-2 sm:gap-3">
        {frame ? (
          <Link
            to="/reader"
            aria-label={t('read.backToLibrary')}
            title={t('read.backToLibrary')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ArrowLeft className="h-[18px] w-[18px] rtl:rotate-180" strokeWidth={1.75} />
          </Link>
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {/* The title takes the free width, so the page count sits at the
            bar's end. The subtitle is a desktop line: on a phone it was always
            cut ("by FlexiLingo · A1 · E…"), a third type size for nothing. */}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground" title={fileName}>
            {fileName}
          </span>
          {subtitle && (
            <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
              {subtitle}
            </span>
          )}
        </div>

        {/* Where you are, kept beside the title: it is about the book, not a tool.
            On a phone the arrows give their room to the title — the page's own
            Previous / Next sit under the text. */}
        <div className="flex shrink-0 items-center text-muted-foreground" dir="ltr">
          <button
            type="button"
            onClick={() => onGoToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label={t('read.prev')}
            className="hidden h-7 w-7 items-center justify-center rounded-md transition-colors sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            value={pageValue}
            onChange={(event) => setDraftPage(event.target.value)}
            onBlur={commitPage}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            inputMode="numeric"
            aria-label={t('read.goToPage')}
            title={t('read.goToPage')}
            className="h-7 w-8 rounded-md border border-transparent bg-transparent text-end text-[13px] font-semibold tabular-nums text-foreground transition-colors hover:border-border focus:border-accent focus:bg-card focus:text-center focus:outline-none"
          />
          {/* One size with the number beside it: a bold 14 next to a faint 12
              read as two different things. */}
          {/* Hidden while the total is unknown (it reads as 1 on a later page of a gated book). */}
          {totalPages >= currentPage && (
            <span className="ms-1 pe-1 text-[13px] tabular-nums text-muted-foreground">
              / {totalPages}
            </span>
          )}
          <button
            type="button"
            onClick={() => onGoToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label={t('read.next')}
            className="hidden h-7 w-7 items-center justify-center rounded-md transition-colors sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/*
        In the order a lesson is worked: listen and watch, look things up,
        then your own work. Small gaps between the groups, no lines — a line
        between every group was one more thing to look at.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {(onToggleAudio || onToggleVideo) && (
          <div className="flex items-center">
            {onToggleAudio && (
              <ReaderToolbarItem
                icon={Headphones}
                label={t('pdf.audio.button')}
                title={audioCount ? `${t('pdf.audio.button')} · ${audioCount}` : undefined}
                onClick={onToggleAudio}
                aria-pressed={audioOpen}
                active={audioOpen}
              />
            )}
            {onToggleVideo && (
              <ReaderToolbarItem
                icon={Clapperboard}
                label={t('pdf.video.button')}
                title={videoCount ? `${t('pdf.video.button')} · ${videoCount}` : undefined}
                onClick={onToggleVideo}
                aria-pressed={videoOpen}
                active={videoOpen}
              />
            )}
          </div>
        )}

        {(onToggleCheatsheet || onToggleWords || onToggleWritten || children) && (
          <div className="flex items-center">
            {onToggleCheatsheet && (
              <ReaderToolbarItem
                icon={BookMarked}
                label={t('pdf.cheatsheet.button')}
                onClick={onToggleCheatsheet}
                aria-pressed={cheatsheetOpen}
                active={cheatsheetOpen}
              />
            )}
            {onToggleWords && (
              <ReaderToolbarItem
                icon={WholeWord}
                label={t('pdf.words.button')}
                title={wordCount ? `${t('pdf.words.button')} · ${wordCount}` : undefined}
                onClick={onToggleWords}
                aria-pressed={wordsOpen}
                active={wordsOpen}
                marked={!!wordCount}
              />
            )}
            {onToggleWritten && (
              <ReaderToolbarItem
                icon={ListChecks}
                label={t('pdf.write.listButton')}
                title={writtenCount ? `${t('pdf.write.listButton')} · ${writtenCount}` : undefined}
                onClick={onToggleWritten}
                aria-pressed={writtenOpen}
                active={writtenOpen}
                marked={!!writtenCount}
              />
            )}
            {/* Anything this surface adds — the page deck, for one. */}
            {children}
          </div>
        )}

        {(onToggleWriting || onToggleNotes || onChangeFile) && (
          <div className="flex items-center">
            {/* A mode, not an action: the line under it says it is on. */}
            {onToggleWriting && (
              <ReaderToolbarItem
                icon={PenLine}
                label={t('pdf.write.button')}
                title={writing ? t('pdf.write.done') : t('pdf.write.hint')}
                onClick={onToggleWriting}
                aria-pressed={writing}
                active={writing}
              />
            )}
            {onToggleNotes && (
              <ReaderToolbarItem
                icon={StickyNote}
                label={t('pdf.notes.button')}
                title={noteCount ? `${t('pdf.notes.button')} · ${noteCount}` : undefined}
                onClick={onToggleNotes}
                aria-pressed={notesOpen}
                active={notesOpen}
                marked={!!noteCount}
              />
            )}
            {onChangeFile && (
              <ReaderToolbarItem
                icon={RefreshCw}
                label={t('pdf.changeFile')}
                onClick={onChangeFile}
              />
            )}
          </div>
        )}

        {/*
          WHAT THE PAGE IS, NOT WHERE YOU ARE.

          Zoom, language and the book are set once and then left alone, while the
          page number and the panels are used constantly. They sit behind one
          icon at the very end, past a divider — not a tool, so no name under it.
        */}
        <Popover>
          <div className="flex items-center gap-1">
            <span className="me-1 h-6 w-px bg-border" aria-hidden />
            {/* A mode, not an action: olive while it is on. */}
            {frame && (
              <button
                type="button"
                onClick={frame.toggleFullScreen}
                aria-pressed={frame.fullScreen}
                aria-label={frame.fullScreen ? t('read.exitFullScreen') : t('read.fullScreen')}
                title={frame.fullScreen ? t('read.exitFullScreen') : t('read.fullScreen')}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  frame.fullScreen
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {frame.fullScreen ? (
                  <Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                ) : (
                  <Maximize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                )}
              </button>
            )}
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t('pdf.settings.button')}
                title={t('pdf.settings.button')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted hover:text-foreground data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
              >
                <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
          </div>
          <PopoverContent align="end" className="w-72 rounded-lg border-border bg-popover p-3">
            {onZoomChange && zoom !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-primary">
                  {t('pdf.settings.zoom')}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onZoomChange(stepZoom(zoom, -1))}
                    disabled={zoom <= ZOOM_MIN}
                    aria-label={t('read.smaller')}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center text-xs font-semibold text-muted-foreground">
                    {Math.round(zoom * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onZoomChange(stepZoom(zoom, 1))}
                    disabled={zoom >= ZOOM_MAX}
                    aria-label={t('read.larger')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {onScaleChange && scale !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-primary">
                  {t('read.textSize')}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onScaleChange(stepTextScale(scale, -1))}
                    disabled={scale <= TEXT_SCALE_MIN}
                    aria-label={t('read.smaller')}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-12 text-center text-xs font-semibold text-muted-foreground">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onScaleChange(stepTextScale(scale, 1))}
                    disabled={scale >= TEXT_SCALE_MAX}
                    aria-label={t('read.larger')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {onTapToSpeakChange && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-xs font-bold uppercase tracking-wide text-primary"
                    htmlFor="pdf-tap-to-speak"
                  >
                    {t('pdf.settings.tapToSpeak')}
                  </label>
                  <button
                    id="pdf-tap-to-speak"
                    type="button"
                    role="switch"
                    aria-checked={!!tapToSpeak}
                    onClick={() => onTapToSpeakChange(!tapToSpeak)}
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      tapToSpeak ? 'bg-accent' : 'bg-muted-foreground/40',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-card transition-transform',
                        tapToSpeak ? 'translate-x-4' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {t('pdf.settings.tapToSpeakHint')}
                </p>
              </div>
            )}

            {onLanguageChange && language !== undefined && (
              <div className="mt-3 border-t border-border pt-3">
                <label
                  className="block text-xs font-bold uppercase tracking-wide text-primary"
                  htmlFor="pdf-language"
                >
                  {t('upload.language')}
                </label>
                <select
                  id="pdf-language"
                  value={language}
                  onChange={(event) => onLanguageChange(event.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  {sourceLanguages.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {onEditionChange && !editions?.length && editionsNote && (
              <p
                role="status"
                className="mt-3 border-t border-border pt-3 text-xs leading-snug text-muted-foreground"
              >
                {editionsNote}
              </p>
            )}

            {onEditionChange && !!editions?.length && (
              <div className="mt-3 border-t border-border pt-3">
                <label
                  className="block text-xs font-bold uppercase tracking-wide text-primary"
                  htmlFor="pdf-edition"
                >
                  {t('pdf.audio.edition')}
                </label>
                <select
                  id="pdf-edition"
                  value={editionId ?? ''}
                  onChange={(event) => onEditionChange(event.target.value)}
                  className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="">{t('pdf.audio.noEdition')}</option>
                  {editions.map((edition) => (
                    <option key={edition.id} value={edition.id}>
                      {edition.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
