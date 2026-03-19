import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useReadingStore } from '../stores/readingStore';
import { WordPopover } from './WordPopover';
import { ReadingToolbar } from './ReadingToolbar';
import type { Token } from '../types';

const cefrColors: Record<string, string> = {
  A1: 'bg-emerald-100 dark:bg-emerald-900/30',
  A2: 'bg-green-100 dark:bg-green-900/30',
  B1: 'bg-yellow-100 dark:bg-yellow-900/30',
  B2: 'bg-orange-100 dark:bg-orange-900/30',
  C1: 'bg-red-100 dark:bg-red-900/30',
  C2: 'bg-purple-100 dark:bg-purple-900/30',
};

interface Props {
  onBack: () => void;
}

export function InteractiveReader({ onBack }: Props) {
  const { activeDocument, highlights, updateProgress, selectedTokenIndex, selectToken, cefrHighlight } =
    useReadingStore();
  const readerRef = useRef<HTMLDivElement>(null);
  const [popoverState, setPopoverState] = useState<{
    token: Token;
    sentence: string;
    position: { x: number; y: number };
  } | null>(null);

  // Build a set of highlighted words for fast lookup
  const highlightedWords = useMemo(() => {
    const set = new Set<string>();
    for (const h of highlights) {
      set.add(h.word.toLowerCase());
    }
    return set;
  }, [highlights]);

  // Extract sentence from tokens around a given token
  const getSentence = useCallback((token: Token, tokens: Token[]): string => {
    const sentenceTokens = tokens.filter((t) => t.sentence_index === token.sentence_index);
    return sentenceTokens.map((t) => t.text).join(' ');
  }, []);

  // Handle word click
  const handleWordClick = useCallback(
    (token: Token, event: React.MouseEvent) => {
      if (!token.is_word || !activeDocument) return;

      const rect = (event.target as HTMLElement).getBoundingClientRect();
      const sentence = getSentence(token, activeDocument.tokens);

      selectToken(token.index);
      setPopoverState({
        token,
        sentence,
        position: { x: rect.left, y: rect.bottom },
      });
    },
    [activeDocument, getSentence, selectToken],
  );

  const closePopover = useCallback(() => {
    setPopoverState(null);
    selectToken(null);
  }, [selectToken]);

  // Track reading progress on scroll
  const handleScroll = useCallback(() => {
    if (!readerRef.current || !activeDocument) return;
    const el = readerRef.current;
    const scrollPercent = el.scrollTop / (el.scrollHeight - el.clientHeight);
    const progress = Math.min(Math.max(scrollPercent, 0), 1);

    if (progress > activeDocument.progress) {
      updateProgress(progress, Math.round(el.scrollTop));
    }
  }, [activeDocument, updateProgress]);

  // Restore scroll position
  useEffect(() => {
    if (readerRef.current && activeDocument && activeDocument.lastPosition > 0) {
      readerRef.current.scrollTop = activeDocument.lastPosition;
    }
  }, [activeDocument?.id]); // Only on document change

  if (!activeDocument) return null;

  const tokens = activeDocument.tokens;
  const uniqueWords = new Set(tokens.filter((t) => t.is_word).map((t) => t.lower)).size;

  // Group tokens by sentence for rendering with proper spacing
  const renderedTokens = tokens.map((token, i) => {
    const isWord = token.is_word;
    const isHighlighted = isWord && highlightedWords.has(token.lower);
    const isSelected = token.index === selectedTokenIndex;

    // Add space before word tokens (except first token or after opening punctuation)
    const prevToken = i > 0 ? tokens[i - 1] : null;
    const needsSpace =
      i > 0 && isWord && prevToken && prevToken.text !== '(' && prevToken.text !== '"';

    const cefrClass = cefrHighlight && token.cefr_level && !token.is_stop
      ? cefrColors[token.cefr_level] ?? ''
      : '';

    return (
      <span key={token.index}>
        {needsSpace && ' '}
        {isWord ? (
          <span
            onClick={(e) => handleWordClick(token, e)}
            className={cn(
              'cursor-pointer rounded-sm px-0.5 py-0.5 transition-colors',
              isSelected
                ? 'bg-primary/20 text-primary'
                : isHighlighted
                  ? 'bg-accent/15 text-accent underline decoration-accent/30 decoration-dotted underline-offset-4'
                  : cefrClass || 'hover:bg-muted hover:text-foreground',
            )}
            title={cefrHighlight && token.cefr_level ? `${token.pos ?? ''} · ${token.cefr_level}` : undefined}
          >
            {token.text}
          </span>
        ) : // Check for sentence breaks — add line break after sentence-ending punctuation
        token.sentence_index !== (tokens[i + 1]?.sentence_index ?? token.sentence_index) ? (
          <>
            <span className="text-muted-foreground">{token.text}</span>
            {'\n'}
          </>
        ) : (
          <span className="text-muted-foreground">{token.text}</span>
        )}
      </span>
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-lg font-bold text-foreground">{activeDocument.title}</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{activeDocument.wordCount} words</span>
              <span>{uniqueWords} unique</span>
              <span>{highlights.length} highlighted</span>
              {activeDocument.progress > 0 && (
                <Badge variant="outline" className="text-xs">
                  {Math.round(activeDocument.progress * 100)}% read
                </Badge>
              )}
            </div>
          </div>
        </div>
        <ReadingToolbar />
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted mb-4">
        <div
          className="h-full rounded-full bg-success transition-all"
          style={{ width: `${Math.round(activeDocument.progress * 100)}%` }}
        />
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Reader */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0">
            <div
              ref={readerRef}
              onScroll={handleScroll}
              className="h-[calc(100vh-240px)] overflow-y-auto p-6 text-base leading-relaxed whitespace-pre-wrap"
            >
              {renderedTokens}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar — highlighted words */}
        {highlights.length > 0 && (
          <Card className="w-56 shrink-0 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-accent" />
                Highlights ({highlights.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto px-4 pb-4">
                <div className="space-y-1">
                  {highlights.map((h) => (
                    <div
                      key={h.id}
                      className="rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted cursor-default"
                    >
                      {h.word}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Word popover */}
      {popoverState && (
        <WordPopover
          token={popoverState.token}
          sentence={popoverState.sentence}
          documentLanguage={activeDocument.language}
          position={popoverState.position}
          onClose={closePopover}
        />
      )}
    </div>
  );
}
