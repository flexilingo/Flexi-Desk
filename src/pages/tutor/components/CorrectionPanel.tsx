import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CorrectionItem } from './CorrectionItem';
import type { GrammarCorrection } from '../types';

interface CorrectionPanelProps {
  corrections: GrammarCorrection[];
}

export function CorrectionPanel({ corrections }: CorrectionPanelProps) {
  const { t } = useTranslation('tutor');
  const [expanded, setExpanded] = useState(false);

  if (corrections.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
      >
        <span>{t('corrections.title', { count: corrections.length })}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-3">
          {corrections.map((correction, index) => (
            <CorrectionItem key={index} correction={correction} className="bg-card" />
          ))}
        </div>
      )}
    </div>
  );
}
