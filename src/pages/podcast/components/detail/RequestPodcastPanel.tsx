import { useState } from 'react';
import { Loader2, Send, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePodcastDetailStore } from '../../stores/podcastDetailStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * Shown only for podcasts FlexiLingo hasn't curated yet. Curation is what
 * produces transcripts, difficulty scores and vocabulary — so this is the user's
 * way of asking for a podcast to enter the pipeline.
 */
export function RequestPodcastPanel({ feedId }: { feedId: number }) {
  const { t } = useTranslation('common');
  const session = useAuthStore((s) => s.session);
  const { myRequest, isRequesting, submitRequest, error } = usePodcastDetailStore();
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!session) return null;

  if (myRequest) {
    const { status } = myRequest;
    const Icon = status === 'approved' ? CheckCircle2 : status === 'rejected' ? XCircle : Clock;
    const tone =
      status === 'approved'
        ? 'border-success/30 bg-success/10 text-success'
        : status === 'rejected'
          ? 'border-error/30 bg-error/10 text-error'
          : 'border-accent/30 bg-accent/10 text-accent';
    return (
      <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${tone}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">{t(`podcast.requestStatus_${status}`)}</p>
          {myRequest.admin_notes && (
            <p className="mt-0.5 text-xs opacity-90">{myRequest.admin_notes}</p>
          )}
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      await submitRequest(feedId, message.trim() || undefined);
      setMessage('');
    } catch {
      setLocalError(error ?? t('podcast.requestFailed'));
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">{t('podcast.requestTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('podcast.requestHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('podcast.requestMessagePlaceholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          className="min-w-60 flex-1 text-sm"
        />
        <Button onClick={handleSubmit} disabled={isRequesting} size="sm">
          {isRequesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t('podcast.requestSubmit')}
        </Button>
      </div>

      {localError && <p className="text-xs text-error">{localError}</p>}
    </div>
  );
}
