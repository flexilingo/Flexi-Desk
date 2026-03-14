import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { NlpAnalysis } from '../../types';

const CEFR_LEVELS = ['C1', 'C2', 'B2', 'B1', 'A2', 'A1'] as const;

const CEFR_CHIP_COLORS: Record<string, { active: string; badge: string }> = {
  A1: {
    active: 'bg-[#8BB7A3]/20 text-[#8BB7A3] border-[#8BB7A3]/40',
    badge: 'bg-[#8BB7A3]/20 text-[#8BB7A3]',
  },
  A2: {
    active: 'bg-[#8BB7A3]/15 text-[#8BB7A3] border-[#8BB7A3]/30',
    badge: 'bg-[#8BB7A3]/15 text-[#8BB7A3]',
  },
  B1: {
    active: 'bg-[#C58C6E]/20 text-[#C58C6E] border-[#C58C6E]/40',
    badge: 'bg-[#C58C6E]/20 text-[#C58C6E]',
  },
  B2: {
    active: 'bg-[#C58C6E]/15 text-[#C58C6E] border-[#C58C6E]/30',
    badge: 'bg-[#C58C6E]/15 text-[#C58C6E]',
  },
  C1: {
    active: 'bg-red-500/20 text-red-400 border-red-500/40',
    badge: 'bg-red-500/20 text-red-400',
  },
  C2: {
    active: 'bg-red-500/15 text-red-400 border-red-500/30',
    badge: 'bg-red-500/15 text-red-400',
  },
};

const CEFR_WORD_CHIP_COLORS: Record<string, { selected: string; unselected: string }> = {
  A1: {
    selected: 'bg-[#8BB7A3]/20 text-[#8BB7A3] border-[#8BB7A3]/40',
    unselected: 'bg-transparent text-foreground border-border hover:border-[#8BB7A3]/40',
  },
  A2: {
    selected: 'bg-[#8BB7A3]/15 text-[#8BB7A3] border-[#8BB7A3]/30',
    unselected: 'bg-transparent text-foreground border-border hover:border-[#8BB7A3]/30',
  },
  B1: {
    selected: 'bg-[#C58C6E]/20 text-[#C58C6E] border-[#C58C6E]/40',
    unselected: 'bg-transparent text-foreground border-border hover:border-[#C58C6E]/40',
  },
  B2: {
    selected: 'bg-[#C58C6E]/15 text-[#C58C6E] border-[#C58C6E]/30',
    unselected: 'bg-transparent text-foreground border-border hover:border-[#C58C6E]/30',
  },
  C1: {
    selected: 'bg-red-500/20 text-red-400 border-red-500/40',
    unselected: 'bg-transparent text-foreground border-border hover:border-red-500/40',
  },
  C2: {
    selected: 'bg-red-500/15 text-red-400 border-red-500/30',
    unselected: 'bg-transparent text-foreground border-border hover:border-red-500/30',
  },
};

interface WordFreq {
  word: string;
  count: number;
  cefr: string;
}

interface VocabTabProps {
  analysis: NlpAnalysis | null;
  onAddToDeck?: (words: string[]) => void;
}

export function VocabTab({ analysis, onAddToDeck }: VocabTabProps) {
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set(CEFR_LEVELS));
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());

  // Parse top_words from analysis (JSON string)
  const topWords = useMemo<WordFreq[]>(() => {
    if (!analysis?.topWords) return [];
    try {
      return JSON.parse(analysis.topWords);
    } catch {
      return [];
    }
  }, [analysis?.topWords]);

  // Count words per CEFR level
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of topWords) {
      counts[w.cefr] = (counts[w.cefr] ?? 0) + 1;
    }
    return counts;
  }, [topWords]);

  // Group words by CEFR level, filtered by selected levels
  const groupedWords = useMemo(() => {
    const groups: { level: string; words: WordFreq[] }[] = [];
    for (const level of CEFR_LEVELS) {
      if (!selectedLevels.has(level)) continue;
      const words = topWords.filter((w) => w.cefr === level);
      if (words.length > 0) {
        groups.push({ level, words });
      }
    }
    return groups;
  }, [topWords, selectedLevels]);

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const toggleWord = useCallback((word: string) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(word)) {
        next.delete(word);
      } else {
        next.add(word);
      }
      return next;
    });
  }, []);

  const selectAllInLevel = useCallback((words: WordFreq[]) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      const allSelected = words.every((w) => next.has(w.word));
      if (allSelected) {
        // Deselect all in this level
        for (const w of words) {
          next.delete(w.word);
        }
      } else {
        // Select all in this level
        for (const w of words) {
          next.add(w.word);
        }
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedWords(new Set());
  }, []);

  const handleAddToDeck = useCallback(() => {
    if (onAddToDeck && selectedWords.size > 0) {
      onAddToDeck(Array.from(selectedWords));
    }
  }, [onAddToDeck, selectedWords]);

  // Levels that have words
  const availableLevels = CEFR_LEVELS.filter((l) => (levelCounts[l] ?? 0) > 0);

  const totalFilteredWords = groupedWords.reduce((sum, g) => sum + g.words.length, 0);

  if (!analysis) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Transcribe the episode to see vocabulary analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-3 flex-1 pb-16">
        <h3 className="text-sm font-semibold">Vocabulary</h3>

        {/* CEFR filter chips with counts */}
        <div className="flex flex-wrap gap-1.5">
          {availableLevels.map((level) => {
            const count = levelCounts[level] ?? 0;
            const isActive = selectedLevels.has(level);
            const colors = CEFR_CHIP_COLORS[level];
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors flex items-center gap-1 ${
                  isActive
                    ? colors.active
                    : 'bg-transparent text-muted-foreground/50 border-border/50'
                }`}
              >
                {level}
                <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Selection bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {selectedWords.size > 0 ? (
            <>
              <span className="font-medium text-foreground">{selectedWords.size} selected</span>
              <button
                onClick={clearSelection}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </>
          ) : (
            <span>{totalFilteredWords} words</span>
          )}
        </div>

        {/* Words grouped by CEFR level */}
        <div className="space-y-4">
          {groupedWords.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No words match the selected levels.
            </p>
          ) : (
            groupedWords.map((group) => {
              const colors = CEFR_CHIP_COLORS[group.level];
              const allSelected = group.words.every((w) => selectedWords.has(w.word));
              return (
                <div key={group.level} className="space-y-2">
                  {/* Level header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        className={`text-[10px] px-1.5 py-0 font-semibold border-0 ${colors.badge}`}
                      >
                        {group.level}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {group.words.length} words
                      </span>
                    </div>
                    <button
                      onClick={() => selectAllInLevel(group.words)}
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  {/* Word chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {group.words.map((w) => {
                      const isSelected = selectedWords.has(w.word);
                      const chipColors = CEFR_WORD_CHIP_COLORS[w.cefr];
                      return (
                        <button
                          key={w.word}
                          onClick={() => toggleWord(w.word)}
                          className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                            isSelected
                              ? (chipColors?.selected ?? '')
                              : (chipColors?.unselected ?? 'border-border')
                          }`}
                        >
                          {w.word}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 left-0 right-0 p-3 bg-card border-t border-border -mx-3 -mb-3">
        {selectedWords.size === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg py-3 text-center">
            <p className="text-xs text-muted-foreground">Tap to select words</p>
          </div>
        ) : (
          <Button
            onClick={handleAddToDeck}
            className="w-full bg-[#8BB7A3] hover:bg-[#8BB7A3]/90 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add {selectedWords.size} word{selectedWords.size !== 1 ? 's' : ''} to Deck
          </Button>
        )}
      </div>
    </div>
  );
}
