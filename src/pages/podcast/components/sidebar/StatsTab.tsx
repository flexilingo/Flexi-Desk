import { useMemo } from 'react';
import { BookPlus, StickyNote, Eye, FileText, Brain, BookOpen, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface StatsTabProps {
  wordsClicked: number;
  wordsAddedToDeck: number;
  activeTimeSpent: number; // ms
  segmentCount: number;
  cefrLevel?: string;
  cefrDistribution?: string; // JSON string like {"A1": 5, "A2": 25, ...}
  uniqueWords?: number;
  totalWords?: number;
  notesCount?: number;
  onStartQuiz?: () => void;
  onNavigateToVocab?: () => void;
  onNavigateToAnalysis?: () => void;
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const CEFR_BAR_COLORS: Record<string, string> = {
  A1: 'bg-[#8BB7A3]',
  A2: 'bg-[#8BB7A3]/70',
  B1: 'bg-[#C58C6E]',
  B2: 'bg-[#C58C6E]/70',
  C1: 'bg-red-500',
  C2: 'bg-red-500/70',
};

const CEFR_BADGE_COLORS: Record<string, string> = {
  A1: 'bg-[#8BB7A3]/20 text-[#8BB7A3]',
  A2: 'bg-[#8BB7A3]/15 text-[#8BB7A3]',
  B1: 'bg-[#C58C6E]/20 text-[#C58C6E]',
  B2: 'bg-[#C58C6E]/15 text-[#C58C6E]',
  C1: 'bg-red-500/20 text-red-400',
  C2: 'bg-red-500/15 text-red-400',
};

function formatTimeMMSS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StatsTab({
  wordsClicked,
  wordsAddedToDeck,
  activeTimeSpent,
  segmentCount,
  cefrLevel,
  cefrDistribution,
  uniqueWords,
  totalWords,
  notesCount = 0,
  onStartQuiz,
  onNavigateToVocab,
  onNavigateToAnalysis,
}: StatsTabProps) {
  const cefrData = useMemo<Record<string, number>>(() => {
    if (!cefrDistribution) return {};
    try {
      return JSON.parse(cefrDistribution);
    } catch {
      return {};
    }
  }, [cefrDistribution]);

  const cefrTotal = useMemo(() => {
    return Object.values(cefrData).reduce((sum, v) => sum + v, 0);
  }, [cefrData]);

  const wordsRecognized = totalWords ? totalWords - (uniqueWords ?? 0) : 0;
  const knownPercent = totalWords ? Math.round((wordsRecognized / totalWords) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* THIS SESSION block */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          This Session
        </h3>

        {/* Study time */}
        <div className="text-center py-2">
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {formatTimeMMSS(activeTimeSpent)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">study time</p>
        </div>

        {/* Words recognized progress */}
        {totalWords != null && totalWords > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Words recognized</span>
              <span className="font-semibold tabular-nums">
                {wordsRecognized} / {totalWords}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[#8BB7A3] transition-all duration-500"
                style={{ width: `${knownPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{knownPercent}% known</span>
              <span>{wordsClicked} looked up</span>
            </div>
          </div>
        )}

        {/* 3-column grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-background/50 p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Eye className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold tabular-nums">{wordsClicked}</p>
            <p className="text-[9px] text-muted-foreground">words seen</p>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <BookPlus className="h-3 w-3 text-[#C58C6E]" />
            </div>
            <p className="text-lg font-bold tabular-nums">{wordsAddedToDeck}</p>
            <p className="text-[9px] text-muted-foreground">looked up</p>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <StickyNote className="h-3 w-3 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold tabular-nums">{notesCount}</p>
            <p className="text-[9px] text-muted-foreground">notes</p>
          </div>
        </div>
      </div>

      {/* EPISODE block */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Episode
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              <FileText className="h-3 w-3 inline mr-0.5" />
              {segmentCount} segments
            </span>
            {cefrLevel && (
              <Badge
                className={`text-[10px] px-1.5 py-0 font-semibold border-0 ${CEFR_BADGE_COLORS[cefrLevel] || 'bg-muted text-muted-foreground'}`}
              >
                {cefrLevel}
              </Badge>
            )}
          </div>
        </div>

        {/* CEFR bar chart */}
        {cefrTotal > 0 && (
          <div className="space-y-1.5">
            <div className="flex h-3 rounded-full overflow-hidden bg-muted">
              {CEFR_ORDER.map((level) => {
                const val = cefrData[level] ?? 0;
                if (val === 0) return null;
                const pct = (val / cefrTotal) * 100;
                return (
                  <div
                    key={level}
                    className={`${CEFR_BAR_COLORS[level]} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                    title={`${level}: ${Math.round(pct)}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {CEFR_ORDER.map((level) => {
                const val = cefrData[level] ?? 0;
                if (val === 0) return null;
                const pct = Math.round((val / cefrTotal) * 100);
                return (
                  <div key={level} className="flex items-center gap-1 text-[10px]">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${CEFR_BAR_COLORS[level]}`}
                    />
                    <span className="text-muted-foreground">
                      {level} {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Two stat cards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-background/50 p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{uniqueWords ?? '-'}</p>
            <p className="text-[10px] text-muted-foreground">unique words</p>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3 text-center">
            <p className="text-lg font-bold tabular-nums">
              {uniqueWords != null && totalWords != null ? totalWords - uniqueWords : '-'}
            </p>
            <p className="text-[10px] text-muted-foreground">new for you</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="space-y-2 pt-1">
        {onStartQuiz && (
          <Button
            onClick={onStartQuiz}
            className="w-full bg-[#8BB7A3] hover:bg-[#8BB7A3]/90 text-white"
            size="sm"
          >
            <Brain className="h-4 w-4 mr-1.5" />
            Start Quiz
          </Button>
        )}

        {onNavigateToVocab && (
          <button
            onClick={onNavigateToVocab}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <BookOpen className="h-4 w-4 text-[#C58C6E]" />
            Vocabulary
            {uniqueWords != null && (
              <span className="text-[10px] text-muted-foreground ml-1">({uniqueWords} words)</span>
            )}
          </button>
        )}

        {onNavigateToAnalysis && (
          <button
            onClick={onNavigateToAnalysis}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            Full Analysis
          </button>
        )}
      </div>
    </div>
  );
}
