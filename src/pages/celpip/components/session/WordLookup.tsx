import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { WordDialog } from '@/components/WordDialog';
import { ClickableText } from '@/pages/study/components/session/ClickableText';

// Ported from front's `WordLookupProvider.tsx`. Difference: desk already has its
// own word dialog (podcast's WordDialog) and its own tokenizer (study's
// ClickableText), so this file only supplies the provider/context plumbing and
// renders those two, instead of shipping a fresh dialog.

type LookupFn = (word: string, sentence?: string) => void;

// Null when no provider is mounted — LookupText then renders plain text.
const WordLookupContext = createContext<LookupFn | null>(null);

export function useWordLookup(): LookupFn | null {
  return useContext(WordLookupContext);
}

interface SelectionChip {
  x: number;
  y: number;
  text: string;
  context?: string;
}

interface ActiveLookup {
  word: string;
  sentence?: string;
}

/**
 * Makes every `LookupText` beneath it word-clickable, opening the podcast
 * WordDialog (translation, examples, add-to-deck). Also supports MULTI-WORD
 * lookup: drag-select a phrase inside any LookupText and a floating "Translate"
 * chip appears above the selection.
 *
 * `enabled={false}` renders everything plain — the exam engine pairs this with a
 * user-facing toggle so word-clicks never fight answer selection.
 */
export function WordLookupProvider({
  children,
  enabled = true,
  contentLang = 'en',
}: {
  children: ReactNode;
  enabled?: boolean;
  /** Language of the exam content - the word dialog's source language (CELPIP en, TCF fr). */
  contentLang?: 'en' | 'fr';
}) {
  const { t } = useTranslation('celpip');
  const [lookup, setLookup] = useState<ActiveLookup | null>(null);
  const [chip, setChip] = useState<SelectionChip | null>(null);

  const openLookup = useCallback((word: string, sentence?: string) => {
    const clean = word?.trim();
    if (!clean) return;
    setLookup({ word: clean, sentence });
  }, []);

  // Track native text selection inside lookup-enabled text. When disabled no
  // listeners attach and the chip is render-gated.
  useEffect(() => {
    if (!enabled) return;
    const updateFromSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setChip(null);
        return;
      }
      const text = sel.toString().replace(/\s+/g, ' ').trim();
      // Phrase lookups only — single words already open on click; cap length so
      // a select-all doesn't produce a useless chip.
      if (!text || !text.includes(' ') || text.length > 220) {
        setChip(null);
        return;
      }
      const anchorEl =
        sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const container = anchorEl?.closest('[data-lookup-text]');
      if (!container) {
        setChip(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setChip(null);
        return;
      }
      setChip({
        x: rect.left + rect.width / 2,
        y: rect.top,
        text,
        context: container.textContent ?? undefined,
      });
    };

    document.addEventListener('selectionchange', updateFromSelection);
    // Chip is viewport-fixed — reposition on scroll/resize.
    window.addEventListener('scroll', updateFromSelection, true);
    window.addEventListener('resize', updateFromSelection);
    return () => {
      document.removeEventListener('selectionchange', updateFromSelection);
      window.removeEventListener('scroll', updateFromSelection, true);
      window.removeEventListener('resize', updateFromSelection);
    };
  }, [enabled]);

  const lookupSelection = useCallback(() => {
    if (!chip) return;
    openLookup(chip.text, chip.context);
    window.getSelection()?.removeAllRanges();
    setChip(null);
  }, [chip, openLookup]);

  return (
    <WordLookupContext.Provider value={enabled ? openLookup : null}>
      {children}

      {/* Floating phrase-translate chip above the current selection */}
      {enabled && chip && (
        <button
          // pointerdown fires before the browser collapses the selection on tap —
          // onClick would hide the chip before it could act.
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            lookupSelection();
          }}
          className="fixed z-[9999] -translate-x-1/2 -translate-y-full inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary/90 transition-colors"
          // The only inline style in the module: these are live pointer
          // coordinates, which no Tailwind class can express.
          style={{ left: chip.x, top: chip.y - 8 }}
        >
          <Languages className="w-3.5 h-3.5" />
          {t('translateSelection')}
        </button>
      )}

      {/* Desk's podcast word dialog — self-fetching, resolves the target
          language from user settings internally. */}
      {lookup && (
        <WordDialog
          word={lookup.word}
          open
          onOpenChange={(o) => {
            if (!o) setLookup(null);
          }}
          // The exam's own language: English for CELPIP, French for the TCF family.
          sourceLang={contentLang}
          sentenceContext={lookup.sentence}
        />
      )}
    </WordLookupContext.Provider>
  );
}

/**
 * Text that becomes word-by-word clickable (and phrase-selectable) when rendered
 * inside a WordLookupProvider; plain otherwise.
 */
export function LookupText({ text, className }: { text: string; className?: string }) {
  const lookup = useWordLookup();
  if (!lookup) return <span className={className}>{text}</span>;
  return (
    <span data-lookup-text="">
      <ClickableText text={text} onWordClick={lookup} className={className} />
    </span>
  );
}
