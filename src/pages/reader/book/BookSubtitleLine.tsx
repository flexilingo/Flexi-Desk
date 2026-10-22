import { useCallback, useMemo, useRef, useState } from 'react';
import { WordDialog } from '@/components/WordDialog';
import { AddToDeckDialog } from '@/pages/podcast/components/AddToDeckDialog';
import {
  SelectionActionBar,
  useWordRangeSelection,
} from '@/pages/podcast/components/SubtitleBarSelection';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { lineWords } from '../lib/line-words';

/**
 * The spoken line in the book track's player (website: `MiniSubtitleLine` with a
 * book selection). A word opens the word dialog; a dragged range can be added to a
 * deck, translated or copied — the reader has no full player to go to. The
 * recording waits while a dialog is open and carries on when it closes.
 */
export function BookSubtitleLine({
  text,
  lineId,
  language,
  trackId,
}: {
  text: string;
  /** Changes with each line, so a selection never outlives the line it was made on. */
  lineId: string;
  language: string;
  trackId: string;
}) {
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const containerRef = useRef<HTMLDivElement>(null);
  const words = useMemo(() => lineWords(text), [text]);
  const [dialogWord, setDialogWord] = useState<string | null>(null);
  const [deckWords, setDeckWords] = useState<string[] | null>(null);
  // Translate clears the selection as it opens the dialog; the dialog resumes when it
  // closes, not the selection.
  const translatingRef = useRef(false);

  const onResumeAfterDialog = useCallback(() => {
    if (!translatingRef.current) resume();
  }, [resume]);
  const selection = useWordRangeSelection(words, lineId, pause, onResumeAfterDialog, containerRef);

  const closeDialog = () => {
    translatingRef.current = false;
    setDialogWord(null);
    resume();
  };

  return (
    <>
      <div
        ref={containerRef}
        dir="auto"
        className={`relative flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 px-4 py-2.5 text-base leading-snug text-foreground ${
          selection.selectionState.isSelecting ? 'select-none' : ''
        }`}
      >
        {selection.isSelectionActive && (
          <SelectionActionBar
            selectedText={selection.selectedText}
            words={words}
            selectedIndices={selection.selectedIndices}
            onClear={selection.clearSelection}
            containerRef={containerRef}
            hideNote
            onPauseForDialog={pause}
            onResumeAfterDialog={onResumeAfterDialog}
            onAddToDeck={(word) => setDeckWords([word.cleanText || word.text])}
            onTranslate={(selected) => {
              translatingRef.current = true;
              setDialogWord(selected);
            }}
          />
        )}
        {words.map((word) => (
          <span
            key={word.index}
            data-word-index={word.index}
            onMouseDown={(event) => selection.handlers.onWordMouseDown(word.index, event)}
            onMouseEnter={() => selection.handlers.onWordMouseEnter(word.index)}
            onMouseUp={(event) => selection.handlers.onWordMouseUp(word.index, event)}
            onClick={() => {
              if (selection.isDragging || selection.isSelectionActive) return;
              pause();
              setDialogWord(word.text);
            }}
            className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-primary/15 ${
              selection.isWordSelected(word.index) ? 'bg-success/30' : ''
            }`}
          >
            {word.text}
          </span>
        ))}
      </div>

      {dialogWord && (
        <WordDialog
          word={dialogWord}
          open
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          sourceLang={language}
          sentenceContext={text}
        />
      )}
      {deckWords && (
        <AddToDeckDialog
          open
          words={deckWords}
          episodeId={trackId}
          sentenceContext={text}
          onClose={() => {
            setDeckWords(null);
            resume();
          }}
        />
      )}
    </>
  );
}
