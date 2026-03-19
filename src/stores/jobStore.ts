import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '@tauri-apps/api/core';

export type JobType = 'transcribe' | 'download';
export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  type: JobType;
  episodeId: string;
  episodeTitle: string;
  status: JobStatus;
  progress: number; // 0-100
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface RawJobEvent {
  id: string;
  job_type: 'transcribe' | 'download';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  episode_id: string;
  episode_title: string;
  progress: number;
  error: string | null;
}

function mapRawEvent(raw: RawJobEvent): Partial<Job> {
  return {
    id: raw.id,
    type: raw.job_type,
    episodeId: raw.episode_id,
    episodeTitle: raw.episode_title,
    status: raw.status,
    progress: raw.progress,
    error: raw.error ?? undefined,
  };
}

interface JobState {
  jobs: Record<string, Job>;
  collapsed: boolean;
  // Episode IDs that should auto-start transcription after download completes
  pendingTranscribeAfterDownload: Record<string, boolean>;

  handleJobStarted: (raw: RawJobEvent) => void;
  handleJobProgress: (raw: RawJobEvent) => void;
  handleJobCompleted: (raw: RawJobEvent) => void;
  handleJobFailed: (raw: RawJobEvent) => void;
  handleJobCancelled: (raw: RawJobEvent) => void;
  cancelJob: (id: string) => Promise<void>;
  dismissJob: (id: string) => void;
  toggleCollapsed: () => void;
  syncActiveJobs: () => Promise<void>;
  queueTranscribeAfterDownload: (episodeId: string) => void;
}

export const useJobStore = create<JobState>()(
  immer((set, get) => ({
    jobs: {},
    collapsed: false,
    pendingTranscribeAfterDownload: {},

    handleJobStarted: (raw) =>
      set((s) => {
        const mapped = mapRawEvent(raw);
        s.jobs[raw.id] = {
          ...mapped,
          id: raw.id,
          type: mapped.type!,
          episodeId: mapped.episodeId!,
          episodeTitle: mapped.episodeTitle!,
          status: 'running',
          progress: 0,
          startedAt: Date.now(),
        } as Job;
      }),

    handleJobProgress: (raw) =>
      set((s) => {
        if (s.jobs[raw.id]) {
          s.jobs[raw.id].progress = Math.round(raw.progress);
        }
      }),

    handleJobCompleted: (raw) =>
      set((s) => {
        if (s.jobs[raw.id]) {
          s.jobs[raw.id].status = 'completed';
          s.jobs[raw.id].progress = 100;
          s.jobs[raw.id].completedAt = Date.now();
        }
      }),

    handleJobFailed: (raw) =>
      set((s) => {
        if (s.jobs[raw.id]) {
          s.jobs[raw.id].status = 'failed';
          s.jobs[raw.id].error = raw.error ?? 'Unknown error';
          s.jobs[raw.id].completedAt = Date.now();
        }
      }),

    handleJobCancelled: (raw) =>
      set((s) => {
        if (s.jobs[raw.id]) {
          s.jobs[raw.id].status = 'cancelled';
          s.jobs[raw.id].completedAt = Date.now();
        }
      }),

    cancelJob: async (id) => {
      try {
        await invoke('job_cancel', { jobId: id });
      } catch {
        // Job may have already completed
      }
    },

    dismissJob: (id) =>
      set((s) => {
        delete s.jobs[id];
      }),

    toggleCollapsed: () =>
      set((s) => {
        s.collapsed = !s.collapsed;
      }),

    queueTranscribeAfterDownload: (episodeId) =>
      set((s) => {
        s.pendingTranscribeAfterDownload[episodeId] = true;
      }),

    syncActiveJobs: async () => {
      try {
        const rawJobs = await invoke<RawJobEvent[]>('job_list');
        set((s) => {
          for (const raw of rawJobs) {
            if (!s.jobs[raw.id]) {
              s.jobs[raw.id] = {
                id: raw.id,
                type: raw.job_type,
                episodeId: raw.episode_id,
                episodeTitle: raw.episode_title,
                status: 'running',
                progress: raw.progress,
                startedAt: Date.now(),
              };
            }
          }
        });
      } catch {
        // Ignore sync errors
      }
    },
  })),
);

// Standalone selectors (can be used outside React)
export const isEpisodeTranscribing = (episodeId: string): boolean =>
  Object.values(useJobStore.getState().jobs).some(
    (j) => j.episodeId === episodeId && j.type === 'transcribe' && j.status === 'running',
  );

export const isEpisodeDownloading = (episodeId: string): boolean =>
  Object.values(useJobStore.getState().jobs).some(
    (j) => j.episodeId === episodeId && j.type === 'download' && j.status === 'running',
  );

export const getEpisodeDownloadProgress = (episodeId: string): number => {
  const job = Object.values(useJobStore.getState().jobs).find(
    (j) => j.episodeId === episodeId && j.type === 'download' && j.status === 'running',
  );
  return job?.progress ?? 0;
};
