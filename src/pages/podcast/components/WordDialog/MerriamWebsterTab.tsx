import { ExternalLink } from 'lucide-react';

interface MerriamWebsterTabProps {
  word: string;
  isActive: boolean;
}

export function MerriamWebsterTab({ word }: MerriamWebsterTabProps) {
  const mwUrl = `https://www.merriam-webster.com/dictionary/${encodeURIComponent(word)}`;

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
      {/* M-W Branding */}
      <div className="flex items-center gap-2 pb-1">
        <span className="text-sm font-bold text-red-500 uppercase">Merriam-Webster</span>
      </div>

      <span className="text-3xl">📚</span>

      <div className="space-y-1.5 max-w-xs">
        <p className="text-sm font-medium text-foreground">
          Merriam-Webster requires an API key
        </p>
        <p className="text-xs text-muted-foreground">
          This feature uses a private API and is not available in local mode.
          You can look up the word directly on the Merriam-Webster website.
        </p>
      </div>

      <a
        href={mwUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in Merriam-Webster
      </a>
    </div>
  );
}
