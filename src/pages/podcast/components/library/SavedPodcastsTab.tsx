import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Loader2, Bookmark, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { CefrBadge } from '@/components/common/CefrBadge';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useAuthStore } from '@/stores/authStore';
import { SignedOutNotice } from './SignedOutNotice';

export function SavedPodcastsTab() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const {
    followedPodcasts,
    isFollowedLoading,
    followingFeedId,
    updatingFollowFeedId,
    fetchFollowed,
    unfollowPodcast,
    setAutoTranscribe,
  } = useDiscoverStore();

  useEffect(() => {
    if (session) fetchFollowed();
  }, [session, fetchFollowed]);

  if (!session) return <SignedOutNotice message={t('podcast.signInForSaved')} />;

  if (isFollowedLoading && followedPodcasts.length === 0) {
    return (
      <div className="flex justify-center py-14">
        <LoadingSpinner />
      </div>
    );
  }

  if (followedPodcasts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Bookmark className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t('podcast.noSavedPodcasts')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {followedPodcasts.map((p) => {
        const isUnfollowing = followingFeedId === p.feed_id;
        const isUpdating = updatingFollowFeedId === p.feed_id;
        return (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Headphones className="h-5 w-5 text-muted-foreground/50" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate(`/podcast/show/${p.feed_id}`)}
              className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted"
            >
              <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                {p.author && <span className="truncate">{p.author}</span>}
                <span className="tabular-nums">
                  {t('podcast.transcribedOfTotal', {
                    transcribed: p.transcribed_episodes,
                    total: p.total_episodes,
                  })}
                </span>
              </div>
            </button>

            {p.cefr_level && <CefrBadge level={p.cefr_level} />}

            {/* Auto-transcribe: cloud pre-transcribes new episodes of this podcast. */}
            <Button
              variant={p.auto_transcribe ? 'default' : 'outline'}
              size="sm"
              disabled={isUpdating}
              onClick={() => setAutoTranscribe(p.feed_id, !p.auto_transcribe)}
              title={t('podcast.autoTranscribeHint')}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {t('podcast.autoTranscribe')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={isUnfollowing}
              onClick={() => unfollowPodcast(p.feed_id)}
            >
              {isUnfollowing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('podcast.unfollow')}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
