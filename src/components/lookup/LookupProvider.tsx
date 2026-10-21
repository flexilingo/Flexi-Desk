import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Languages, StickyNote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WordDialog } from '@/pages/podcast/components/WordDialog';
import { LookupContext, type LookupFn } from './lookup-context';
import { SpeakButton } from './SpeakButton';
import { useSelectionPhrase } from './useSelectionPhrase';

/**
 * Makes every word beneath it openable in the word dialog, and optionally lets
 * a dragged phrase be translated as a whole.
 *
 * DESK: the dialog is the app's existing podcast `WordDialog` (translation,
 * dictionary tabs, add-to-deck), the same one the CELPIP lookup opens. Its
 * source language is the language the TEXT is in and the sentence travels as
 * context. The website's `initialTab` and in-dialog target-language state have
 * no counterpart: the desk dialog owns its tabs and has its own language picker.
 *
 * `translateLabel` is a plain STRING rather than a `useTranslation()` call
 * inside, as on the website, so the host decides the wording.
 */

/**
 * Where the chip sits next to a mouse selection: just below it, so it never
 * covers the line the reader just chose; above it only when there is no room
 * below. (On a touch screen it is a card at the bottom of the screen instead —
 * see `touch` in the provider.)
 *
 * The one inline style of the module: live pointer-derived coordinates, which no
 * Tailwind class can express.
 */
function chipPosition(chip: { x: number; y: number; bottom: number }): CSSProperties {
  const GAP = 8;
  const CHIP_HEIGHT = 36;
  // Half the widest chip (listen + translate + note), plus a margin, so a
  // phrase ending near the window's edge never pushes half the chip off it.
  const HALF_WIDTH = 130;
  const left = Math.min(
    Math.max(chip.x, HALF_WIDTH),
    Math.max(HALF_WIDTH, window.innerWidth - HALF_WIDTH),
  );
  const roomBelow = chip.bottom + GAP + CHIP_HEIGHT <= window.innerHeight;

  return roomBelow
    ? { left, top: chip.bottom + GAP }
    : { left, top: chip.y - GAP, transform: 'translate(-50%, -100%)' };
}

export function LookupProvider({
  children,
  language = 'en',
  enabled = true,
  phraseSelection = false,
  translateLabel,
  audioLabel,
  closeLabel = 'Close',
  onNote,
  noteLabel,
  onDialogOpenChange,
  targetLanguage,
}: {
  /** The language to explain the word in. Omitted, the dialog uses the user's own setting. */
  targetLanguage?: string;
  children: ReactNode;
  /** The language the TEXT is written in — not the user's own language. */
  language?: string;
  enabled?: boolean;
  phraseSelection?: boolean;
  translateLabel?: string;
  /** Tooltip for the chip's play button. Omitted, the chip offers no audio. */
  audioLabel?: string;
  /** The phone card's close button. */
  closeLabel?: string;
  /**
   * Called with the selected phrase when the reader chooses to note it.
   * Omitted, the chip offers no note button — most places that look words up
   * have nowhere to put a note. (Notes arrive in a later phase.)
   */
  onNote?: (selected: { text: string; context?: string }) => void;
  noteLabel?: string;
  /**
   * Told when the word dialog opens and when it closes.
   *
   * The dialog's open state is private to this provider — the host must not be
   * able to open one. But a host that is PLAYING something needs to know.
   *
   * Called on every open, including a second word opened while the first
   * dialog is still up — so a listener must treat `true` as "at least one is
   * open", not as a transition.
   */
  onDialogOpenChange?: (open: boolean) => void;
}) {
  const [lookup, setLookup] = useState<{ word: string; context?: string } | null>(null);
  const { chip, consume } = useSelectionPhrase(enabled && phraseSelection);
  /*
   * On a touch screen the system draws its own menu beside the selection and
   * decides by itself whether that goes above or below, which can land exactly
   * on our chip. So there the chip is a card at the bottom of the screen, the
   * one place the system menu never goes. Read only while a chip exists.
   */
  const touch = !!chip && window.matchMedia('(pointer: coarse)').matches;

  // Held in a ref rather than closed over, so `openLookup` keeps ONE identity
  // for the life of the provider. It is the context value; a new identity each
  // render would re-render every consumer whenever the host re-rendered.
  const announceRef = useRef(onDialogOpenChange);
  useEffect(() => {
    announceRef.current = onDialogOpenChange;
  }, [onDialogOpenChange]);

  const openLookup = useCallback<LookupFn>((word, context) => {
    const clean = word?.trim();
    if (!clean) return;
    setLookup({ word: clean, context });
    announceRef.current?.(true);
  }, []);

  const closeLookup = useCallback(() => {
    setLookup(null);
    announceRef.current?.(false);
  }, []);

  const lookupSelection = useCallback(() => {
    const selected = consume();
    if (selected) openLookup(selected.text, selected.context);
  }, [consume, openLookup]);

  // Reads the selection BEFORE `consume` clears it, because the note needs the
  // live selection's geometry to anchor itself to the page.
  const noteSelection = useCallback(() => {
    if (!onNote || !chip) return;
    onNote({ text: chip.text, context: chip.context });
  }, [onNote, chip]);

  return (
    <LookupContext.Provider value={enabled ? openLookup : null}>
      {children}

      {enabled && phraseSelection && chip && (
        <div
          // pointerdown fires before the browser collapses the selection on
          // tap, and preventing it is what keeps the selection alive long
          // enough for a button to act on it.
          onPointerDown={(e) => e.preventDefault()}
          className={
            touch
              ? 'fixed inset-x-3 bottom-3 z-[9999] rounded-2xl border border-border bg-card p-3.5 shadow-lg'
              : 'fixed z-[9999] flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-accent/30 bg-card p-1 shadow-lg'
          }
          style={touch ? undefined : chipPosition(chip)}
        >
          {/* On a phone the card shows WHAT it will translate. */}
          {touch && (
            <>
              {/* A way out that does not depend on knowing that a tap on the
                  page clears a selection. */}
              <button
                type="button"
                onClick={() => consume()}
                aria-label={closeLabel}
                className="absolute end-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <p
                dir="auto"
                className="m-0 line-clamp-2 pe-7 text-sm italic leading-6 text-foreground"
              >
                “{chip.text}”
              </p>
            </>
          )}

          <div className={touch ? 'mt-3 flex items-center justify-between gap-2' : 'contents'}>
            <div className={touch ? 'flex items-center gap-1' : 'contents'}>
              {audioLabel && (
                <SpeakButton
                  text={chip.text}
                  lang={language}
                  title={audioLabel}
                  label={touch ? audioLabel : undefined}
                  // Deliberately does NOT consume the selection: hearing a phrase
                  // and then translating it is one thought, and clearing the
                  // selection after the first would take the second away.
                  className={
                    touch
                      ? 'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-muted px-3.5 text-[13px] font-semibold text-primary transition-colors hover:bg-muted/70'
                      : 'inline-flex h-7 w-7 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent/10'
                  }
                  iconClassName={touch ? 'h-4 w-4' : 'h-3.5 w-3.5'}
                />
              )}
              {onNote && (
                <button
                  type="button"
                  onClick={noteSelection}
                  className={
                    touch
                      ? 'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-muted'
                      : 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10'
                  }
                >
                  <StickyNote className={touch ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                  {noteLabel}
                </button>
              )}
            </div>

            {touch ? (
              <Button size="md" onClick={lookupSelection}>
                <Languages className="h-4 w-4" />
                {translateLabel}
              </Button>
            ) : (
              <button
                type="button"
                onClick={lookupSelection}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
              >
                <Languages className="h-3.5 w-3.5" />
                {translateLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Self-fetching: it resolves the user's own target language internally.
          `sourceLang` is the language this text is in — without it a French page
          would be looked up as English. */}
      {lookup && (
        <WordDialog
          word={lookup.word}
          open
          onOpenChange={(open) => {
            if (!open) closeLookup();
          }}
          sourceLang={language}
          targetLang={targetLanguage}
          sentenceContext={lookup.context}
        />
      )}
    </LookupContext.Provider>
  );
}
