import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  line: string | null;
  nextLine: string | null;
  idle: string;
  progress: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
}

/** What the real mini window (document Picture-in-Picture) shows: the line, the next one, the transport. */
export function PipWindow({
  title,
  line,
  nextLine,
  idle,
  progress,
  isPlaying,
  onTogglePlay,
  onPrevLine,
  onNextLine,
}: Props) {
  const { t } = useTranslation('podcastUi');
  return (
    <div className="flex h-screen flex-col gap-2 bg-background p-4 text-foreground">
      <p dir="auto" className="truncate text-xs font-semibold text-muted-foreground">
        {title}
      </p>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        <p
          dir="auto"
          className={line ? 'text-xl font-bold leading-snug' : 'text-sm text-muted-foreground'}
        >
          {line ?? idle}
        </p>
        {line && nextLine && (
          <p dir="auto" className="line-clamp-2 text-xs text-muted-foreground">
            {nextLine}
          </p>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onPrevLine}
          title={t('prevLine')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted hover:bg-muted/80"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          title={isPlaying ? t('pause') : t('play')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onNextLine}
          title={t('nextLine')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted hover:bg-muted/80"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
