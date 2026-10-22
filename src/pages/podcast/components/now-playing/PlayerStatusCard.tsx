import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Clock, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Why there is no line to read right now (website: `PlayerStatusCard`). In the now-playing layout it
 * takes the lines' place, so the screen says what is happening instead of an empty page.
 */
export type PlayerStatusKind =
  | 'loading'
  | 'processing'
  | 'failed'
  | 'unsupported'
  | 'noTranscript'
  | 'noSubtitlesVideo'
  | 'startsIn';

function clock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function PlayerStatusCard({
  kind,
  secondsLeft = 0,
  isVideo = false,
  percent = null,
  action,
  className,
}: {
  kind: PlayerStatusKind;
  /** startsIn: seconds until the first line. */
  secondsLeft?: number;
  isVideo?: boolean;
  /** processing: how far the subtitles have got. */
  percent?: number | null;
  /** The way to make subtitles (no transcript yet): this computer's tools. */
  action?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('podcastUi');
  let icon: ReactNode;
  let title: string;
  let body: string | null = null;
  let tone: 'olive' | 'danger' = 'olive';

  switch (kind) {
    case 'loading':
      icon = <Loader2 className="h-4 w-4 animate-spin" />;
      title = t('np.loading');
      break;
    case 'processing':
      icon = <Loader2 className="h-4 w-4 animate-spin" />;
      title =
        percent !== null && percent > 0
          ? `${t('np.npPreparing')} ${percent}%`
          : t('np.npPreparing');
      body = isVideo ? t('np.npPreparingHintVideo') : t('np.npPreparingHint');
      break;
    case 'failed':
      icon = <AlertCircle className="h-4 w-4" />;
      tone = 'danger';
      title = t('np.transcribeFailed');
      break;
    case 'unsupported':
      icon = <AlertCircle className="h-4 w-4" />;
      tone = 'danger';
      title = t('np.unsupportedLanguage');
      break;
    case 'noTranscript':
      icon = <FileText className="h-4 w-4" />;
      title = t('np.npNoTranscript');
      break;
    case 'noSubtitlesVideo':
      icon = <FileText className="h-4 w-4" />;
      title = t('np.npNoSubtitlesVideo');
      break;
    case 'startsIn':
      icon = <Clock className="h-4 w-4" />;
      title = t('np.npStartsIn', { time: clock(secondsLeft) });
      break;
  }

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border border-border bg-card p-3.5 shadow-md',
        className,
      )}
    >
      <span
        className={cn(
          'mt-px inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]',
          tone === 'danger' ? 'bg-error/[0.12] text-error' : 'bg-primary-light/[0.12] text-primary',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug tabular-nums text-foreground">{title}</p>
        {body && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>}
        {action && <div className="mt-2.5 flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
