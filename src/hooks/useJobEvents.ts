import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useJobStore, type RawJobEvent } from '@/stores/jobStore';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';

export function useJobEvents() {
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    unlisteners.push(
      listen<RawJobEvent>('job-started', (event) => {
        useJobStore.getState().handleJobStarted(event.payload);
      }),
    );

    unlisteners.push(
      listen<RawJobEvent>('job-progress', (event) => {
        useJobStore.getState().handleJobProgress(event.payload);
      }),
    );

    unlisteners.push(
      listen<RawJobEvent>('job-completed', (event) => {
        useJobStore.getState().handleJobCompleted(event.payload);
        const { job_type, episode_id } = event.payload;

        if (job_type === 'transcribe') {
          // Update episode status in podcast store
          usePodcastStore.setState((s) => {
            const ep = s.episodes.find((e) => e.id === episode_id);
            if (ep) ep.transcriptStatus = 'completed';
            if (s.activeEpisode?.id === episode_id) {
              s.activeEpisode.transcriptStatus = 'completed';
            }
          });
          // If user is viewing this episode, reload transcript
          const podcastState = usePodcastStore.getState();
          if (podcastState.activeEpisode?.id === episode_id) {
            podcastState.fetchTranscriptSegments(episode_id);
            podcastState.fetchAnalysis(episode_id);
          }
        }

        if (job_type === 'download') {
          // Update episode download status
          usePodcastStore.setState((s) => {
            const ep = s.episodes.find((e) => e.id === episode_id);
            if (ep) ep.isDownloaded = true;
            if (s.activeEpisode?.id === episode_id) {
              s.activeEpisode.isDownloaded = true;
            }
          });

          // Auto-start transcription if queued
          const jobState = useJobStore.getState();
          if (jobState.pendingTranscribeAfterDownload[episode_id]) {
            useJobStore.setState((s) => {
              delete s.pendingTranscribeAfterDownload[episode_id];
            });
            // Start transcription now that download is complete
            usePodcastStore.getState().transcribeEpisode(episode_id);
          }
        }
      }),
    );

    unlisteners.push(
      listen<RawJobEvent>('job-failed', (event) => {
        useJobStore.getState().handleJobFailed(event.payload);
      }),
    );

    unlisteners.push(
      listen<RawJobEvent>('job-cancelled', (event) => {
        useJobStore.getState().handleJobCancelled(event.payload);
      }),
    );

    // Sync active jobs on mount (recovers state after window reload)
    useJobStore.getState().syncActiveJobs();

    return () => {
      unlisteners.forEach((p) => p.then((fn) => fn()));
    };
  }, []);
}
