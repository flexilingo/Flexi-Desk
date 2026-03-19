import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Palette } from 'lucide-react';
import { useReadingStore } from '../stores/readingStore';
import type { RawReadingDocument } from '../types';
import { mapDocument } from '../types';

export function ReadingToolbar() {
  const { activeDocument, cefrHighlight, setCefrHighlight, setActiveDocument } = useReadingStore();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  if (!activeDocument) return null;

  const hasNlpData = activeDocument.tokens.some((t) => t.pos || t.cefr_level);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const raw = await invoke<RawReadingDocument>('reading_analyze_document', {
        documentId: activeDocument.id,
      });
      setActiveDocument(mapDocument(raw));
    } catch (err) {
      setAnalyzeError(String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* NLP Analyze button */}
      {!hasNlpData ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isAnalyzing ? 'Analyzing...' : 'Analyze with spaCy'}
        </Button>
      ) : (
        <Badge variant="outline" className="text-xs gap-1">
          <Sparkles className="h-3 w-3" />
          NLP analyzed
        </Badge>
      )}

      {/* CEFR highlight toggle */}
      {hasNlpData && (
        <Button
          size="sm"
          variant={cefrHighlight ? 'default' : 'outline'}
          onClick={() => setCefrHighlight(!cefrHighlight)}
        >
          <Palette className="mr-1.5 h-3.5 w-3.5" />
          CEFR Colors
        </Button>
      )}

      {analyzeError && (
        <span className="text-xs text-destructive">{analyzeError}</span>
      )}
    </div>
  );
}
