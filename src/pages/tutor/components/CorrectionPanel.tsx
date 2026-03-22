import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { GrammarCorrection, CorrectionType } from '../types';

interface CorrectionPanelProps {
  corrections: GrammarCorrection[];
}

const borderColorByType: Record<CorrectionType, string> = {
  grammar: 'border-l-primary',
  spelling: 'border-l-[#C58C6E]',
  word_choice: 'border-l-[#8BB7A3]',
  word_order: 'border-l-muted',
};

export function CorrectionPanel({ corrections }: CorrectionPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (corrections.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
      >
        <span>Corrections ({corrections.length})</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-3">
          {corrections.map((correction, index) => (
            <div
              key={index}
              className={`border-l-4 ${borderColorByType[correction.type]} rounded bg-card p-3 space-y-1`}
            >
              <p className="text-sm text-muted-foreground line-through">
                ❌ {correction.original}
              </p>
              <p className="text-sm font-medium text-foreground">
                ✅ {correction.corrected}
              </p>
              <p className="text-sm text-muted-foreground">
                💡 {correction.explanation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
