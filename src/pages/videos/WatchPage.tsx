import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { SignInForMusic } from './components/SignInForMusic';
import { VideoWatchView } from './VideoWatchView';
import { getVideo, isLoginRequired } from './lib/videosApi';
import { analyseTranscript, toPodcastSegments } from './lib/transcript';
import { importVideoEpisode } from './lib/videoEpisode';
import { videoListHref } from './lib/listMemory';
import { useCloudQuery } from './lib/useCloudQuery';

/**
 * /videos/watch/:id — loads the video and its transcript, puts the video on the shared player and
 * renders the player. Leaving keeps the video playing in the floating mini player (the Shell hosts
 * it); only the per-video transcript state is dropped.
 */
export function WatchPage() {
  const { t } = useTranslation('videos');
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const videoQ = useCloudQuery(id ? `video|${id}` : null, () => getVideo(id));
  const detail = videoQ.currentData;
  const [prepared, setPrepared] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!detail) return;
    let live = true;
    setPrepareError(false);
    const video = detail.video;
    (async () => {
      try {
        const { episode, feed } = await importVideoEpisode(video);
        if (!live) return;
        const segments = toPodcastSegments(
          episode.id,
          video.language,
          detail.transcript?.segments ?? [],
        );
        usePodcastStore.setState((s) => {
          s.activeEpisode = episode;
          s.activeFeed = feed;
          s.transcriptSegments = segments;
          s.isLoadingTranscript = false;
          s.nlpAnalysis = null;
          s.transcriptSourceInfo = null;
          s.error = null;
        });
        usePlayerStore.getState().play(episode, feed);
        setPrepared(video.id);
        // The vocabulary tabs fill in once the words' levels are known.
        void analyseTranscript(episode.id, video.language, segments).then((analysis) => {
          if (live && analysis && usePodcastStore.getState().activeEpisode?.id === episode.id) {
            usePodcastStore.setState((s) => {
              s.nlpAnalysis = analysis;
            });
          }
        });
      } catch {
        if (live) setPrepareError(true);
      }
    })();
    return () => {
      live = false;
      // The transcript belongs to this page; the picture keeps playing in the mini player.
      usePodcastStore.getState().clearEpisode();
    };
  }, [detail, attempt]);

  const back = (
    <Button variant="outline" size="sm" onClick={() => navigate(videoListHref())}>
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      {t('backToCatalogue')}
    </Button>
  );

  // A music video answers 401 VIDEO_LOGIN_REQUIRED for a signed-out viewer.
  if (videoQ.error !== undefined && isLoginRequired(videoQ.error)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="w-full max-w-md">
          <SignInForMusic compact />
        </div>
        {back}
      </div>
    );
  }

  if (videoQ.error !== undefined) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-base font-bold">{t('notFound.title')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('notFound.subtitle')}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="accent" size="sm" onClick={videoQ.reload}>
            {t('retry')}
          </Button>
          {back}
        </div>
      </div>
    );
  }

  if (prepareError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <InlineError message={t('watch.importFailed')} />
        <div className="flex gap-2">
          <Button variant="accent" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            {t('retry')}
          </Button>
          {back}
        </div>
      </div>
    );
  }

  if (!detail || prepared !== detail.video.id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{t('watch.preparing')}</span>
        <Link to="/videos" className="sr-only">
          {t('backToCatalogue')}
        </Link>
      </div>
    );
  }

  return <VideoWatchView video={detail.video} />;
}
