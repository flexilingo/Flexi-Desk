import { CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { CefrBadge } from '@/components/common/CefrBadge';
import type { AnalyzedItem, CEFRLevel } from '../../types';

interface Props {
  items: AnalyzedItem[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function AnalyzedItemsList({ items, selectedIndices, onToggle, onSelectAll, onDeselectAll }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const allSelected = selectedIndices.size === items.length;

  const POS_COLORS: Record<string, string> = {
    noun: 'bg-blue-500/10 text-blue-600',
    verb: 'bg-[#C58C6E]/10 text-[#C58C6E]',
    adjective: 'bg-purple-500/10 text-purple-600',
    adverb: 'bg-green-500/10 text-green-600',
    phrase: 'bg-[#8BB7A3]/10 text-[#8BB7A3]',
    collocation: 'bg-yellow-500/10 text-yellow-600',
    grammar: 'bg-slate-500/10 text-slate-600',
  };

  return (
    <div className="space-y-2">
      {/* Controls row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selectedIndices.size} of {items.length} selected
        </span>
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-primary hover:underline text-xs"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Item list */}
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {items.map((item, i) => {
          const selected = selectedIndices.has(i);
          const expanded = expandedIndex === i;
          const posColor = POS_COLORS[item.pos?.toLowerCase() ?? ''] ?? 'bg-muted text-muted-foreground';

          return (
            <div
              key={i}
              className={`border rounded-lg transition-colors ${
                selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Checkbox */}
                <button
                  onClick={() => onToggle(i)}
                  className="mt-0.5 shrink-0 text-primary"
                >
                  {selected
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4 text-muted-foreground" />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{item.word}</span>
                    {item.ipa && (
                      <span className="text-xs text-muted-foreground">/{item.ipa}/</span>
                    )}
                    {item.pos && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${posColor}`}>
                        {item.pos}
                      </span>
                    )}
                    {item.cefrLevel && (
                      <CefrBadge level={item.cefrLevel as CEFRLevel} />
                    )}
                  </div>

                  {item.translation && (
                    <p className="text-sm text-muted-foreground mt-0.5">{item.translation}</p>
                  )}
                  {item.definition && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-1">{item.definition}</p>
                  )}
                </div>

                {/* Expand toggle */}
                {(item.examples.length > 0 || item.memoryHook || item.collocations.length > 0) && (
                  <button
                    onClick={() => setExpandedIndex(expanded ? null : i)}
                    className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* Expanded details */}
              {expanded && (
                <div className="px-10 pb-3 space-y-2 text-xs text-muted-foreground">
                  {item.examples.length > 0 && (
                    <div>
                      <span className="font-medium text-foreground/70">Example: </span>
                      {item.examples[0].source}
                      {item.examples[0].target && (
                        <span className="block text-muted-foreground/60 italic">{item.examples[0].target}</span>
                      )}
                    </div>
                  )}
                  {item.memoryHook && (
                    <div>
                      <span className="font-medium text-foreground/70">Hook: </span>
                      {item.memoryHook}
                    </div>
                  )}
                  {item.collocations.length > 0 && (
                    <div>
                      <span className="font-medium text-foreground/70">Collocations: </span>
                      {item.collocations.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
