import { useEffect, useRef } from 'react';
import {
  Mic,
  Download,
  X,
  Check,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useJobStore, type Job } from '@/stores/jobStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';
import type { RawPodcastEpisode } from '@/pages/podcast/types';
import { mapEpisode } from '@/pages/podcast/types';

function JobIcon({ job }: { job: Job }) {
  if (job.status === 'completed') {
    return <Check className="h-4 w-4 text-success" />;
  }
  if (job.status === 'failed') {
    return <AlertTriangle className="h-4 w-4 text-error" />;
  }
  if (job.type === 'transcribe') {
    return <Mic className="h-4 w-4 text-primary-light" />;
  }
  return <Download className="h-4 w-4 text-primary-light" />;
}

function statusText(job: Job): string {
  switch (job.status) {
    case 'running':
      if (job.type === 'transcribe') return `Transcribing ${Math.round(job.progress)}%`;
      return `Downloading ${Math.round(job.progress)}%`;
    case 'completed':
      return 'Completed';
    case 'failed':
      return job.error ?? 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function JobCard({ job, navigate, location }: { job: Job; navigate: ReturnType<typeof useNavigate>; location: ReturnType<typeof useLocation> }) {
  const cancelJob = useJobStore((s) => s.cancelJob);
  const dismissJob = useJobStore((s) => s.dismissJob);

  const isActive = job.status === 'running';
  const isDone = job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed';

  const handleNavigate = () => {
    invoke<RawPodcastEpisode>('podcast_get_episode', { id: job.episodeId })
      .then((raw) => {
        const episode = mapEpisode(raw);
        usePodcastStore.getState().openPlayer(episode);
        if (!location.pathname.includes('/podcast')) {
          navigate('/podcast');
        }
      })
      .catch(() => {});
  };

  return (
    <div
      onClick={handleNavigate}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-lg transition-all duration-300 cursor-pointer hover:bg-muted/50"
    >
      <div className="flex items-center gap-2">
        <JobIcon job={job} />
        <span className="max-w-[200px] truncate text-sm font-medium text-card-foreground">
          {job.episodeTitle}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-error"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isDone && (
            <button
              onClick={(e) => { e.stopPropagation(); dismissJob(job.id); }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}

      <span
        className={`text-xs ${
          job.status === 'failed'
            ? 'text-error'
            : job.status === 'completed'
              ? 'text-success'
              : 'text-muted-foreground'
        }`}
      >
        {statusText(job)}
      </span>
    </div>
  );
}

export function JobToastStack() {
  const jobs = useJobStore((s) => s.jobs);
  const collapsed = useJobStore((s) => s.collapsed);
  const toggleCollapsed = useJobStore((s) => s.toggleCollapsed);
  const dismissJob = useJobStore((s) => s.dismissJob);

  const currentEpisode = usePlayerStore((s) => s.currentEpisode);
  const view = usePodcastStore((s) => s.view);
  const navigate = useNavigate();
  const location = useLocation();

  // Track which jobs we've started auto-dismiss timers for
  const dismissTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const jobList = Object.values(jobs);

  // Auto-dismiss completed/cancelled jobs after 5 seconds
  useEffect(() => {
    for (const job of jobList) {
      const shouldAutoDismiss =
        job.status === 'completed' || job.status === 'cancelled';

      if (shouldAutoDismiss && !dismissTimers.current[job.id]) {
        dismissTimers.current[job.id] = setTimeout(() => {
          dismissJob(job.id);
          delete dismissTimers.current[job.id];
        }, 5000);
      }
    }

    // Cleanup timers for jobs that no longer exist
    for (const id of Object.keys(dismissTimers.current)) {
      if (!jobs[id]) {
        clearTimeout(dismissTimers.current[id]);
        delete dismissTimers.current[id];
      }
    }
  }, [jobList, jobs, dismissJob]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(dismissTimers.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  if (jobList.length === 0) return null;

  const showMiniPlayer = currentEpisode && view !== 'player';
  const activeCount = jobList.filter((j) => j.status === 'running').length;

  return (
    <div
      className={`fixed right-4 z-[190] flex flex-col gap-2 transition-all duration-300 ${
        showMiniPlayer ? 'bottom-44' : 'bottom-4'
      }`}
    >
      {collapsed ? (
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-2 self-end rounded-full border border-border bg-card px-3 py-1.5 shadow-lg transition-colors hover:bg-muted"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-light" />
          <span className="text-sm font-medium text-card-foreground">
            {activeCount > 0 ? `${activeCount} task${activeCount > 1 ? 's' : ''}` : `${jobList.length} done`}
          </span>
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ) : (
        <>
          {jobList.length > 1 && (
            <button
              onClick={toggleCollapsed}
              className="flex items-center gap-1 self-end rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className="h-3 w-3" />
              Collapse
            </button>
          )}
          <div className="flex w-72 flex-col gap-2">
            {jobList.map((job) => (
              <JobCard key={job.id} job={job} navigate={navigate} location={location} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
