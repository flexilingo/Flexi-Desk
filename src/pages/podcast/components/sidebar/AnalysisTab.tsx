import { useState, useMemo } from 'react';
import {
  BarChart3,
  BookOpen,
  MessageSquare,
  Library,
  Layers,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NlpAnalysis } from '../../types';

const CEFR_BAR_COLORS: Record<string, string> = {
  A1: 'bg-[#8BB7A3]',
  A2: 'bg-[#8BB7A3]/70',
  B1: 'bg-[#C58C6E]',
  B2: 'bg-[#C58C6E]/70',
  C1: 'bg-red-500',
  C2: 'bg-red-500/70',
};

type SubTab = 'overview' | 'grammar' | 'phrases' | 'collocations' | 'cefr' | 'vocabulary';

interface CloudAnalysis {
  grammar_patterns?: { name: string; count: number; category?: string }[];
  phrases?: { text: string; translation?: string }[];
  collocations?: { text: string; frequency?: number }[];
  sentences_count?: number;
}

interface AnalysisTabProps {
  analysis: NlpAnalysis | null;
  cloudAnalysis?: CloudAnalysis | null;
}

const SUB_TABS: {
  key: SubTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  getBadge?: (analysis: NlpAnalysis | null, cloud?: CloudAnalysis | null) => string | null;
}[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  {
    key: 'grammar',
    label: 'Grammar',
    icon: BookOpen,
    getBadge: (_a, cloud) => {
      const count = cloud?.grammar_patterns?.length ?? 0;
      return count > 0 ? String(count) : null;
    },
  },
  {
    key: 'phrases',
    label: 'Phrases',
    icon: MessageSquare,
    getBadge: (_a, cloud) => {
      const count = cloud?.phrases?.length ?? 0;
      return count > 0 ? String(count) : null;
    },
  },
  {
    key: 'collocations',
    label: 'Collocations',
    icon: Library,
    getBadge: (_a, cloud) => {
      const count = cloud?.collocations?.length ?? 0;
      return count > 0 ? String(count) : null;
    },
  },
  {
    key: 'cefr',
    label: 'CEFR Level',
    icon: Layers,
    getBadge: (a) => a?.cefrLevel ?? null,
  },
  {
    key: 'vocabulary',
    label: 'Vocabulary',
    icon: FileText,
    getBadge: (a) => (a?.totalWords ? a.totalWords.toLocaleString() : null),
  },
];

export function AnalysisTab({ analysis, cloudAnalysis }: AnalysisTabProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('overview');

  const cefrDist = useMemo<Record<string, number>>(() => {
    if (!analysis?.cefrDistribution) return {};
    try {
      return JSON.parse(analysis.cefrDistribution);
    } catch {
      return {};
    }
  }, [analysis?.cefrDistribution]);

  const topWords = useMemo<{ word: string; count: number; level?: string }[]>(() => {
    if (!analysis?.topWords) return [];
    try {
      return JSON.parse(analysis.topWords);
    } catch {
      return [];
    }
  }, [analysis?.topWords]);

  if (!analysis) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Transcribe the episode to see NLP analysis.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status badge */}
      <div className="flex items-center gap-1.5 text-xs text-[#8BB7A3] font-medium">
        <CheckCircle className="h-3.5 w-3.5" />
        Analysis complete
      </div>

      {/* Sub-tab buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        {SUB_TABS.map(({ key, label, icon: Icon, getBadge }) => {
          const badge = getBadge?.(analysis, cloudAnalysis);
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'border-[#8BB7A3] bg-[#8BB7A3]/10 text-[#8BB7A3]'
                  : 'border-border bg-background/50 text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate w-full text-center">{label}</span>
              {badge && (
                <span className="text-[9px] font-bold bg-muted/50 rounded-full px-1.5 py-0.5 leading-none">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div className="pt-1">
        {activeTab === 'overview' && (
          <OverviewContent analysis={analysis} cloudAnalysis={cloudAnalysis} />
        )}
        {activeTab === 'grammar' && <GrammarContent cloudAnalysis={cloudAnalysis} />}
        {activeTab === 'phrases' && <PhrasesContent cloudAnalysis={cloudAnalysis} />}
        {activeTab === 'collocations' && <CollocationsContent cloudAnalysis={cloudAnalysis} />}
        {activeTab === 'cefr' && <CefrContent cefrDist={cefrDist} cefrLevel={analysis.cefrLevel} />}
        {activeTab === 'vocabulary' && (
          <VocabularyContent topWords={topWords} cefrDist={cefrDist} />
        )}
      </div>
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────── */

function OverviewContent({
  analysis,
  cloudAnalysis,
}: {
  analysis: NlpAnalysis;
  cloudAnalysis?: CloudAnalysis | null;
}) {
  const sentencesCount =
    cloudAnalysis?.sentences_count ?? Math.round(analysis.totalWords / analysis.avgSentenceLength);

  return (
    <div className="space-y-4">
      {/* Video Statistics */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Statistics</h4>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Sentences" value={sentencesCount.toLocaleString()} />
          <MetricCard label="Words" value={analysis.totalWords.toLocaleString()} />
          <MetricCard label="Unique Words" value={analysis.uniqueWords.toLocaleString()} />
          <MetricCard label="CEFR Level" value={analysis.cefrLevel ?? 'N/A'} />
        </div>
      </div>

      {/* Grammar Patterns chips */}
      {cloudAnalysis?.grammar_patterns && cloudAnalysis.grammar_patterns.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Grammar Patterns</h4>
          <div className="flex flex-wrap gap-1.5">
            {cloudAnalysis.grammar_patterns.slice(0, 12).map((gp) => (
              <span
                key={gp.name}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-foreground"
              >
                <span className="truncate max-w-[60px]">{gp.name}</span>
                <span className="text-muted-foreground">{gp.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Grammar ───────────────────────────────────────────── */

function GrammarContent({ cloudAnalysis }: { cloudAnalysis?: CloudAnalysis | null }) {
  const patterns = cloudAnalysis?.grammar_patterns;

  if (!patterns || patterns.length === 0) {
    return <EmptyState text="No grammar patterns available." />;
  }

  return (
    <div className="space-y-1">
      {patterns.map((gp) => (
        <div
          key={gp.name}
          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30"
        >
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium truncate block">{gp.name}</span>
            {gp.category && (
              <span className="text-[10px] text-muted-foreground">{gp.category}</span>
            )}
          </div>
          <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
            {gp.count}
          </Badge>
        </div>
      ))}
    </div>
  );
}

/* ── Phrases ───────────────────────────────────────────── */

function PhrasesContent({ cloudAnalysis }: { cloudAnalysis?: CloudAnalysis | null }) {
  const phrases = cloudAnalysis?.phrases;

  if (!phrases || phrases.length === 0) {
    return <EmptyState text="No phrases available." />;
  }

  return (
    <div className="space-y-1">
      {phrases.map((p, i) => (
        <div key={`${p.text}-${i}`} className="py-1.5 px-2 rounded-md hover:bg-muted/30">
          <p className="text-xs font-medium">{p.text}</p>
          {p.translation && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{p.translation}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Collocations ──────────────────────────────────────── */

function CollocationsContent({ cloudAnalysis }: { cloudAnalysis?: CloudAnalysis | null }) {
  const collocations = cloudAnalysis?.collocations;

  if (!collocations || collocations.length === 0) {
    return <EmptyState text="No collocations available." />;
  }

  return (
    <div className="space-y-1">
      {collocations.map((c, i) => (
        <div
          key={`${c.text}-${i}`}
          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30"
        >
          <span className="text-xs font-medium">{c.text}</span>
          {c.frequency != null && (
            <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
              {c.frequency}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── CEFR ──────────────────────────────────────────────── */

function CefrContent({
  cefrDist,
  cefrLevel,
}: {
  cefrDist: Record<string, number>;
  cefrLevel?: string;
}) {
  const totalForDist = Object.values(cefrDist).reduce((a, b) => a + b, 0) || 1;

  if (Object.keys(cefrDist).length === 0) {
    return <EmptyState text="No CEFR distribution data available." />;
  }

  return (
    <div className="space-y-3">
      {cefrLevel && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Overall Level:</span>
          <Badge variant="outline" className="text-xs font-bold">
            {cefrLevel}
          </Badge>
        </div>
      )}

      <div className="space-y-1.5">
        {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => {
          const count = cefrDist[level] || 0;
          const pct = (count / totalForDist) * 100;
          return (
            <div key={level} className="flex items-center gap-2">
              <span className="text-[10px] font-mono w-6 text-muted-foreground">{level}</span>
              <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all ${CEFR_BAR_COLORS[level]}`}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Vocabulary ────────────────────────────────────────── */

function VocabularyContent({
  topWords,
  cefrDist,
}: {
  topWords: { word: string; count: number; level?: string }[];
  cefrDist: Record<string, number>;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, { word: string; count: number }[]> = {};
    for (const w of topWords) {
      const level = w.level ?? 'Unknown';
      if (!groups[level]) groups[level] = [];
      groups[level].push(w);
    }
    return groups;
  }, [topWords]);

  if (topWords.length === 0 && Object.keys(cefrDist).length === 0) {
    return <EmptyState text="No vocabulary data available." />;
  }

  // If we have topWords with levels, show grouped
  if (topWords.length > 0) {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unknown'];
    return (
      <div className="space-y-3">
        {levels.map((level) => {
          const words = grouped[level];
          if (!words || words.length === 0) return null;
          return (
            <div key={level}>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-[10px] font-bold">
                  {level}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{words.length} words</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {words.slice(0, 20).map((w) => (
                  <span
                    key={w.word}
                    className="inline-block rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-foreground"
                  >
                    {w.word}
                  </span>
                ))}
                {words.length > 20 && (
                  <span className="text-[10px] text-muted-foreground self-center">
                    +{words.length - 20} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: show CEFR distribution word counts
  return (
    <div className="space-y-2">
      {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => {
        const count = cefrDist[level];
        if (!count) return null;
        return (
          <div key={level} className="flex items-center justify-between px-2">
            <Badge variant="outline" className="text-[10px] font-bold">
              {level}
            </Badge>
            <span className="text-xs text-muted-foreground">{count} words</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Shared Components ─────────────────────────────────── */

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2.5 space-y-0.5">
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-6 text-xs text-muted-foreground">{text}</div>;
}
