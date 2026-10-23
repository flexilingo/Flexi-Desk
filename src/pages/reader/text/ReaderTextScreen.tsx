import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pointer, X } from 'lucide-react';
import { LookupProvider } from '@/components/lookup/LookupProvider';
import { speak } from '@/lib/speech';
import { ReaderDeckButton } from '../components/ReaderDeckButton';
import {
  CheatsheetPanel,
  CHEATSHEET_PANEL_START,
  type CheatsheetPanelState,
} from '@/pages/cheatsheet';
import { CHEATSHEET_LANGS } from '@/pages/cheatsheet/lib/types';
import { ReaderToolbar } from './ReaderToolbar';
import { ReaderPageBody } from './ReaderPageBody';
import { ReaderPager } from './ReaderPager';
import { usePersistedPreference } from './persisted-preference';
import { useReaderListen } from '../listen/useReaderListen';
import { ListenStrip } from '../listen/ListenStrip';
import type { ListenInvite, ListenSource } from '../listen/listenStore';
import type { ReaderPagerState } from './useReaderPager';
import {
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_KEY,
  parseTextScale,
  serializeTextScale,
} from './text-scale';

const HINT_KEY = 'flexi.reader.lookup-hint-seen';
/** Shared with the PDF view: one choice for every reader. */
export const TAP_TO_SPEAK_KEY = 'flexi-reader-tap-to-speak';
const parseSeen = (raw: string) => raw === 'true';
const serializeFlag = (on: boolean) => String(on);

/**
 * Reading text in the reader's own frame — the same one a PDF gets.
 *
 * THE FRAME IS THE PRODUCT, THE SURFACE IS THE DETAIL: one chrome (`ReaderToolbar` and this
 * full-height column), and what differs is only the SURFACE inside it — rasterised pages
 * when the layout carries meaning, reflowing text when the words are all there is. What the
 * toolbar offers is decided by what this surface can do: ink, text boxes and the printed
 * audio index are pinned to a fixed page box, so they are not offered here.
 */
export function ReaderTextScreen({
  title,
  subtitle,
  language,
  pager,
  pageAbove,
  pageBelow,
  pageEnd,
  footer,
  errorText,
  onLanguageChange,
  notice,
  gate,
  speakLabel,
  around,
  listen,
}: {
  title: string;
  subtitle?: string;
  /** The language the TEXT is in — what the lookup explains FROM. */
  language: string;
  pager: ReaderPagerState;
  /** Inside the reading column, above the text — a chapter heading. */
  pageAbove?: ReactNode;
  /** Inside the reading column, below the text — "next episode", a truncation notice. */
  pageBelow?: ReactNode;
  /** In place of Next on the last page — the next episode, the way back. */
  pageEnd?: ReactNode;
  /** Under the reading column — the licence and attribution line. */
  footer?: ReactNode;
  /** The message for a page that failed to load, already translated. */
  errorText: string;
  /** Omitted where the language is not the reader's to change — a published book declares it. */
  onLanguageChange?: (language: string) => void;
  /** Replaces the page (and its error) with an invitation — a page that needs a free account. */
  gate?: ReactNode;
  /** A line under the toolbar — the language-corrected note. */
  notice?: ReactNode;
  /** A speaker after every paragraph reads it aloud (library books); off when absent. */
  speakLabel?: string;
  /**
   * Lays the reading card out among other columns (a library book: its season's episodes,
   * the fit card, the way to the next episode). Gets the card; the result replaces the
   * default single column, so `footer` is the caller's to place. The scroller is a size
   * container, so the layout can follow the room the reader really has (`@5xl:` …) rather
   * than the window's width.
   */
  around?: (card: ReactNode) => ReactNode;
  /**
   * The «Listen» player (library books): the app's player bar reading the book sentence by
   * sentence — page after page for Pro. `source` is the book; `playLabel` names a paragraph's
   * «play from here»; `invite` draws what the reader is offered where reading stopped for an
   * account or for Pro. Off when absent.
   */
  listen?: {
    source: ListenSource;
    playLabel: string;
    invite: (kind: ListenInvite, dismiss: () => void) => ReactNode;
  };
}) {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  // The grammar book beside the page; it keeps its place (page, search) across close and reopen.
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [cheatsheetState, setCheatsheetState] =
    useState<CheatsheetPanelState>(CHEATSHEET_PANEL_START);
  const cheatsheetSupported = (CHEATSHEET_LANGS as readonly string[]).includes(language);
  const [scale, setScale] = usePersistedPreference(
    TEXT_SCALE_KEY,
    TEXT_SCALE_DEFAULT,
    parseTextScale,
    serializeTextScale,
  );
  const [tapToSpeak, setTapToSpeak] = usePersistedPreference(
    TAP_TO_SPEAK_KEY,
    false,
    parseSeen,
    serializeFlag,
  );
  // Nothing on a page of text says its words open. Said once, until the reader has opened
  // one — after that the tip has done its job.
  const [hintSeen, setHintSeen] = usePersistedPreference(HINT_KEY, false, parseSeen, serializeFlag);

  // A turned page starts at its beginning. Without this the reader lands halfway down the
  // next page, at whatever height they left the last one.
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
  }, [pager.page]);

  // Each tap cuts the last word off rather than queueing behind it (the speech module does that).
  const speakWord = useCallback((word: string) => void speak(word, language), [language]);

  const player = useReaderListen({
    source: listen?.source ?? null,
    pager,
    enabled: !!listen && !gate,
  });
  // The sentence being read stays in view: scrolled to only when it is not already well inside.
  const marked = player.activeSentence
    ? `${player.activeSentence.paragraph}:${player.activeSentence.sentence}`
    : null;
  useEffect(() => {
    if (marked === null) return;
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-sentence="${marked}"]`);
    if (!box || !el) return;
    const view = box.getBoundingClientRect();
    const here = el.getBoundingClientRect();
    if (here.top >= view.top + 48 && here.bottom <= view.bottom - 48) return;
    el.scrollIntoView?.({
      block: here.height > view.height * 0.6 ? 'start' : 'center',
      behavior: 'smooth',
    });
  }, [marked]);

  const card = (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8 lg:p-10">
      {gate ? (
        gate
      ) : pager.error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
        >
          <span className="min-w-0 flex-1">{errorText}</span>
          <button
            type="button"
            onClick={pager.retry}
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            {tDesk('home.retry')}
          </button>
        </div>
      ) : pager.isLoading ? (
        <div data-testid="reader-text-loading" className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          {listen ? <ListenStrip listen={player} text={pager.text} /> : null}
          {!hintSeen && (
            <p className="mb-6 flex items-start gap-2 rounded-lg bg-primary/[0.08] px-3.5 py-2.5 text-[13px] leading-5 text-primary">
              <Pointer className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t('read.hint')}</span>
              <button
                type="button"
                onClick={() => setHintSeen(true)}
                aria-label={t('read.hintDismiss')}
                title={t('read.hintDismiss')}
                className="-me-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          {pageAbove}
          <ReaderPageBody
            text={pager.text}
            language={language}
            scale={scale}
            onSpeakWord={tapToSpeak ? speakWord : undefined}
            speakLabel={speakLabel}
            listen={
              listen
                ? {
                    activeSentence: player.activeSentence,
                    activeParagraph: player.activeParagraph,
                    playFrom: player.playFromParagraph,
                    playLabel: listen.playLabel,
                  }
                : undefined
            }
          />
          {pager.truncated && (
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              {t('read.truncated')}
            </p>
          )}
          {pageBelow}
          {listen && player.invite ? (
            <div className="mt-8">{listen.invite(player.invite, player.dismissInvite)}</div>
          ) : null}
        </>
      )}

      <div className="mt-8">
        <ReaderPager
          page={pager.page}
          total={pager.total}
          hasPrev={pager.hasPrev}
          hasNext={pager.hasNext}
          onPrev={pager.prev}
          onNext={pager.next}
          disabled={pager.isFetching || (!!pager.error && !gate)}
          end={pageEnd}
        />
      </div>
    </div>
  );

  return (
    <LookupProvider
      language={language}
      phraseSelection
      translateLabel={t('read.translateSelection')}
      audioLabel={t('read.playSelection')}
      closeLabel={t('pdf.notes.close')}
      onDialogOpenChange={(open) => {
        if (open && !hintSeen) setHintSeen(true);
      }}
    >
      <ReaderToolbar
        fileName={title}
        subtitle={subtitle}
        currentPage={pager.page}
        totalPages={pager.total}
        scale={scale}
        onScaleChange={setScale}
        tapToSpeak={tapToSpeak}
        onTapToSpeakChange={setTapToSpeak}
        language={language}
        onLanguageChange={onLanguageChange}
        onGoToPage={pager.goTo}
        cheatsheetOpen={cheatsheetOpen}
        onToggleCheatsheet={
          cheatsheetSupported ? () => setCheatsheetOpen((open) => !open) : undefined
        }
      >
        <ReaderDeckButton
          pageText={pager.text}
          page={pager.page}
          documentTitle={title}
          language={language}
        />
      </ReaderToolbar>

      {notice}

      <div className="flex min-h-0 flex-1">
        <div
          ref={scroller}
          className="@container min-h-0 flex-1 overflow-y-auto bg-muted p-4 sm:p-6 lg:p-8"
        >
          {around ? (
            around(card)
          ) : (
            // Reading measure: prose is unreadable at full width, so the page is a column on
            // the surface rather than the surface itself.
            <div className="mx-auto max-w-[68ch] space-y-4">
              {card}
              {footer}
            </div>
          )}
        </div>

        {cheatsheetOpen && cheatsheetSupported && (
          <CheatsheetPanel
            lang={language}
            state={cheatsheetState}
            onStateChange={setCheatsheetState}
            onClose={() => setCheatsheetOpen(false)}
          />
        )}
      </div>
    </LookupProvider>
  );
}
