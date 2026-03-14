import { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabaseCall } from '@/lib/supabase';
import type { DictionaryResponse } from './types';

interface DictionaryTabProps {
  word: string;
  isActive: boolean;
}

export function DictionaryTab({ word, isActive }: DictionaryTabProps) {
  const [data, setData] = useState<DictionaryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isActive || !word) return;
    if (data?.found) return; // Already loaded

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await supabaseCall<DictionaryResponse>(
          'GET',
          `/dictionary?action=freedict&word=${encodeURIComponent(word)}`,
        );
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled) setData({ found: false, error: 'Failed to fetch dictionary data' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [word, isActive, data?.found]);

  const playAudio = (url: string) => {
    const audio = new Audio(url);
    audio.play().catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm text-muted-foreground">Loading dictionary...</span>
      </div>
    );
  }

  if (!data || !data.found || !data.entry) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <span className="text-3xl">📖</span>
        <p className="text-sm text-muted-foreground">
          {data?.error || 'Word not found in dictionary'}
        </p>
      </div>
    );
  }

  const entry = data.entry;
  const audioUrl = entry.phonetics?.find((p) => p.audio)?.audio;
  const phoneticText = entry.phonetics?.find((p) => p.text)?.text;

  return (
    <div className="space-y-5">
      {/* Phonetics */}
      {(phoneticText || audioUrl) && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          {phoneticText && (
            <span className="text-base text-foreground font-serif">{phoneticText}</span>
          )}
          {audioUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full"
              onClick={() => playAudio(audioUrl)}
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Meanings */}
      {entry.meanings.map((meaning, mIndex) => (
        <div key={mIndex} className="space-y-3">
          <Badge variant="outline" className="text-xs font-semibold uppercase">
            {meaning.partOfSpeech}
          </Badge>

          <div className="space-y-2.5">
            {meaning.definitions.slice(0, 4).map((def, dIndex) => (
              <div
                key={dIndex}
                className="rounded-lg border border-border bg-muted/20 p-3 border-l-2 border-l-primary"
              >
                <p className="text-sm leading-relaxed">
                  <span className="text-muted-foreground mr-2">{dIndex + 1}.</span>
                  {def.definition}
                </p>

                {def.example && (
                  <p className="text-sm text-muted-foreground italic mt-2 pl-3 border-l-2 border-border">
                    "{def.example}"
                  </p>
                )}

                {def.synonyms.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-[#8BB7A3] font-medium">Synonyms: </span>
                    <span className="text-xs text-muted-foreground">
                      {def.synonyms.slice(0, 5).join(', ')}
                    </span>
                  </div>
                )}

                {def.antonyms.length > 0 && (
                  <div className="mt-1">
                    <span className="text-xs text-red-400 font-medium">Antonyms: </span>
                    <span className="text-xs text-muted-foreground">
                      {def.antonyms.slice(0, 5).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Origin */}
      {entry.origin && (
        <div className="rounded-lg border border-[#C58C6E]/30 bg-[#C58C6E]/5 p-3">
          <span className="text-xs font-semibold text-[#C58C6E]">Origin: </span>
          <span className="text-xs text-foreground/80">{entry.origin}</span>
        </div>
      )}
    </div>
  );
}
