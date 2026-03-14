import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Loader2, Info, X, Calendar, Clock, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EpisodeInfo {
  title: string;
  image?: string;
  podcastTitle?: string | null;
  publishDate?: string | null;
  durationSeconds?: number | null;
  cefrLevel?: string | null;
  description?: string | null;
  isDownloaded?: boolean;
}

interface TopBarProps {
  onBack: () => void;
  onTranscribe?: () => void;
  isTranscribing?: boolean;
  canTranscribe?: boolean;
  episodeInfo?: EpisodeInfo;
  sidebarAction?: React.ReactNode;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-cefr-a1 text-primary-foreground',
  A2: 'bg-cefr-a2 text-primary-foreground',
  B1: 'bg-cefr-b1 text-primary-foreground',
  B2: 'bg-cefr-b2 text-primary-foreground',
  C1: 'bg-cefr-c1 text-primary-foreground',
  C2: 'bg-cefr-c2 text-primary-foreground',
};

export function TopBar({
  onBack,
  onTranscribe,
  isTranscribing,
  canTranscribe,
  episodeInfo,
  sidebarAction,
}: TopBarProps) {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showInfo) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showInfo]);

  return (
    <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3 flex-shrink-0 border-b border-border bg-background gap-2 relative">
      {/* Left: Back */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg bg-muted text-foreground text-xs md:text-sm font-medium transition-colors hover:bg-muted/80 flex-shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Center: Episode title */}
      {episodeInfo?.title && (
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-2 hidden sm:flex">
          <p className="text-xs md:text-sm font-semibold text-foreground truncate max-w-full leading-tight">
            {episodeInfo.title}
          </p>
          {episodeInfo.podcastTitle && (
            <p className="text-[10px] md:text-xs text-muted-foreground truncate max-w-full leading-tight">
              {episodeInfo.podcastTitle}
            </p>
          )}
        </div>
      )}

      {/* Right: Info + Transcribe */}
      <div className="flex items-center gap-2 flex-shrink-0 relative" ref={panelRef}>
        {episodeInfo && (
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            title={t('podcast.episodeInfo')}
            className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
              showInfo
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            <Info className="w-4 h-4" />
          </button>
        )}

        {sidebarAction}

        {canTranscribe && onTranscribe && (
          <Button
            onClick={onTranscribe}
            disabled={isTranscribing}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground border-0"
          >
            {isTranscribing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Transcribing...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-1" />
                Transcribe
              </>
            )}
          </Button>
        )}

        {/* Info Panel */}
        {showInfo && episodeInfo && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-popover border border-border rounded-2xl shadow-2xl z-[10000] overflow-hidden">
            {/* Header with image */}
            <div className="flex gap-3 p-4 border-b border-border bg-muted/30">
              {episodeInfo.image ? (
                <img
                  src={episodeInfo.image}
                  alt={episodeInfo.title}
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                  {episodeInfo.title}
                </p>
                {episodeInfo.podcastTitle && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {episodeInfo.podcastTitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap border-b border-border">
              {episodeInfo.publishDate && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(episodeInfo.publishDate)}
                </span>
              )}
              {episodeInfo.durationSeconds && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(episodeInfo.durationSeconds)}
                </span>
              )}
              {episodeInfo.isDownloaded && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <HardDrive className="w-3.5 h-3.5" />
                  Downloaded
                </span>
              )}
              {episodeInfo.cefrLevel && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${CEFR_COLORS[episodeInfo.cefrLevel] ?? 'bg-muted text-foreground'}`}
                >
                  {episodeInfo.cefrLevel}
                </span>
              )}
            </div>

            {/* Description */}
            {episodeInfo.description && (
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                  {episodeInfo.description.replace(/<[^>]+>/g, '')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
