import { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabaseCall } from '@/lib/supabase';
import type { AITranslationResponse, AIWordAnalysis } from './types';

interface AITabProps {
  word: string;
  sentenceContext?: string;
  sourceLang: string;
  targetLang: string;
  isActive: boolean;
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-[#8BB7A3]/20 text-[#8BB7A3] border-[#8BB7A3]/40',
  A2: 'bg-[#8BB7A3]/15 text-[#8BB7A3] border-[#8BB7A3]/30',
  B1: 'bg-[#C58C6E]/20 text-[#C58C6E] border-[#C58C6E]/40',
  B2: 'bg-[#C58C6E]/15 text-[#C58C6E] border-[#C58C6E]/30',
  C1: 'bg-red-500/20 text-red-400 border-red-500/40',
  C2: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function AITab({ word, sentenceContext, sourceLang, targetLang, isActive }: AITabProps) {
  const [data, setData] = useState<AIWordAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);

  useEffect(() => {
    if (!isActive || !sentenceContext) return;

    let cancelled = false;

    const fetchAI = async () => {
      setLoading(true);
      setError(null);
      setRequiresAuth(false);

      try {
        const response = await supabaseCall<AITranslationResponse>('POST', '/get-ai-translation', {
          word,
          sentence: sentenceContext,
          targetLanguage: targetLang,
          sourceLanguage: sourceLang,
        });

        if (cancelled) return;

        if (response.found && response.data) {
          setData(response.data);
          setCached(response.cached ?? false);
        } else {
          if (response.requiresAuth || response.code === 'AUTH_REQUIRED') {
            setRequiresAuth(true);
          } else {
            setError(response.error || 'Failed to get AI analysis');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAI();
    return () => {
      cancelled = true;
    };
  }, [word, sentenceContext, targetLang, sourceLang, isActive]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-[#C58C6E]" />
        <span className="text-sm text-muted-foreground">Analyzing with AI...</span>
      </div>
    );
  }

  if (requiresAuth) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Lightbulb className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Sign in to use AI analysis</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          Get AI-powered contextual translations, grammar tips, and synonyms.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!sentenceContext) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <p className="text-sm text-muted-foreground italic">
          No sentence context available for AI analysis.
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="text-sm font-semibold text-[#C58C6E]">AI Analysis</span>
        </div>
        {cached && (
          <span className="text-[10px] text-[#8BB7A3] bg-[#8BB7A3]/10 px-2 py-0.5 rounded">
            Cached
          </span>
        )}
      </div>

      {/* Word + IPA */}
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold">{data.word}</span>
        {data.ipa && <span className="text-sm text-muted-foreground font-serif">{data.ipa}</span>}
      </div>

      {/* Contextual Translation */}
      <div className="rounded-xl border-2 border-[#C58C6E]/40 bg-[#C58C6E]/5 p-5">
        <p className="text-xs font-semibold text-[#C58C6E] uppercase tracking-wide mb-2">
          Contextual Translation
        </p>
        <p className="text-lg font-semibold" dir="auto">
          {data.contextualTranslation}
        </p>
      </div>

      {/* Definition */}
      {data.definition && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm leading-relaxed" dir="auto">
            {data.definition}
          </p>
        </div>
      )}

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">
          {data.partOfSpeech}
        </Badge>
        {data.difficulty && (
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold border ${CEFR_COLORS[data.difficulty] || 'bg-muted text-muted-foreground border-border'}`}
          >
            {data.difficulty}
          </Badge>
        )}
      </div>

      {/* Examples */}
      {data.examples && data.examples.length > 0 && (
        <div>
          <Separator className="mb-4" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Examples
          </p>
          <div className="space-y-3">
            {data.examples.map((ex, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-muted/30 p-3 border-l-2 border-l-[#8BB7A3]"
              >
                <p className="text-sm italic mb-1">"{ex.source}"</p>
                <p className="text-sm text-muted-foreground" dir="auto">
                  "{ex.target}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tip */}
      {data.tip && (
        <div className="rounded-lg border border-[#C58C6E]/30 bg-[#C58C6E]/5 p-4">
          <p className="text-xs font-semibold text-[#C58C6E] uppercase tracking-wide mb-2">
            💡 Tip
          </p>
          <p className="text-sm leading-relaxed" dir="auto">
            {data.tip}
          </p>
        </div>
      )}

      {/* Synonyms */}
      {data.synonyms && data.synonyms.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Synonyms
          </p>
          <div className="flex flex-wrap gap-2">
            {data.synonyms.map((syn, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs"
              >
                {syn}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
