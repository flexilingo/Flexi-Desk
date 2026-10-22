import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDiscoverStore } from '../../stores/discoverStore';
import { useAuthStore } from '@/stores/authStore';
import { PodcastTileGrid } from '../hub/PodcastTileCard';
import { SignedOutNotice } from './SignedOutNotice';
import { LibraryEmpty } from './LibraryParts';

/** Followed podcasts, as the website's "Saved" tab: the same tiles as the hub. */
export function SavedPodcastsTab() {
  const { t } = useTranslation('common');
  const { t: tp } = useTranslation('podcastUi');
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const { followedPodcasts, isFollowedLoading, fetchFollowed } = useDiscoverStore();

  useEffect(() => {
    if (session) fetchFollowed();
  }, [session, fetchFollowed]);

  if (!session) return <SignedOutNotice message={t('podcast.signInForSaved')} />;

  if (isFollowedLoading && followedPodcasts.length === 0) {
    return <PodcastTileGrid podcasts={[]} isLoading onOpen={() => {}} />;
  }

  if (followedPodcasts.length === 0) {
    return (
      <LibraryEmpty icon={Heart} title={tp('savedEmptyTitle')} description={tp('savedEmptyDesc')} />
    );
  }

  return (
    <PodcastTileGrid
      podcasts={followedPodcasts}
      onOpen={(feedId) => navigate(`/podcast/show/${feedId}`)}
    />
  );
}
