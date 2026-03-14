import { Languages } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { TranslationResult } from '../../types';

interface GoogleTabProps {
  translation: TranslationResult | null;
  isLoading: boolean;
  error: string | null;
}

export function GoogleTab({ translation, isLoading, error }: GoogleTabProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm text-muted-foreground">Translating...</span>
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

  if (!translation) return null;

  return (
    <div className="space-y-5">
      {/* Main Translation */}
      <div className="rounded-xl border-2 border-[#8BB7A3]/40 bg-[#8BB7A3]/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Languages className="h-4 w-4 text-[#8BB7A3]" />
          <span className="text-xs font-semibold text-[#8BB7A3] uppercase tracking-wide">
            Translation
          </span>
        </div>
        <p className="text-xl font-semibold text-foreground" dir="auto">
          {translation.translation}
        </p>
      </div>

      {/* Alternative Translations */}
      {translation.alternatives.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Alternative Translations
          </p>
          <div className="space-y-3">
            {translation.alternatives.map((alt) => (
              <div key={alt.pos}>
                <span className="text-[11px] font-medium text-[#C58C6E] uppercase">{alt.pos}</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {alt.words.slice(0, 5).map((w, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm"
                      dir="auto"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Examples */}
      {translation.examples.length > 0 && (
        <div>
          <Separator className="mb-4" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Examples
          </p>
          <div className="space-y-2">
            {translation.examples.map((ex, i) => (
              <p
                key={i}
                className="text-sm text-foreground/70 italic pl-3 border-l-2 border-[#8BB7A3]/30"
              >
                {ex}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
