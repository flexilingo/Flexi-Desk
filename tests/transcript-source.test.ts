import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PodcastEpisode, TranscriptSourceInfo } from '@/pages/podcast/types';

/**
 * Switching episodes used to leave `transcriptSourceInfo` pointing at the PREVIOUS
 * episode. The auto-loader read it, saw `has_cloud: true` from the old episode,
 * and silently skipped fetching the new one's transcript — so the player showed
 * no subtitles until the user opened the dropdown and clicked FlexiLingo.
 */

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

import { usePodcastStore } from '@/pages/podcast/stores/podcastStore';

function episode(id: string): PodcastEpisode {
  return {
    id,
    feedId: 'f1',
    title: `Episode ${id}`,
    audioUrl: 'https://example.com/a.mp3',
    durationSeconds: 60,
    isDownloaded: false,
    playPosition: 0,
    isPlayed: false,
    transcriptStatus: 'none',
    createdAt: '',
    transcriptSource: 'local',
    cloudTranscriptStatus: 'unknown',
  };
}

function info(overrides: Partial<TranscriptSourceInfo> & { episode_id: string }): TranscriptSourceInfo {
  return {
    active: 'local',
    has_local: false,
    has_cloud: false,
    cloud_possible: false,
    cloud_status: 'unknown',
    ...overrides,
  };
}

/** Lets pending promise chains inside the store settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('transcript source resolution', () => {
  beforeEach(() => {
    invoke.mockReset();
    usePodcastStore.setState({
      activeEpisode: null,
      transcriptSegments: [],
      transcriptSourceInfo: null,
      nlpAnalysis: null,
    });
  });

  it('auto-loads the FlexiLingo transcript when the episode has one and no local transcript', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'podcast_transcript_source_info')
        return info({ episode_id: 'A', cloud_possible: true });
      if (cmd === 'podcast_fetch_cloud_transcript') return [];
      return [];
    });

    usePodcastStore.getState().loadEpisode(episode('A'));
    await flush();

    expect(invoke).toHaveBeenCalledWith('podcast_fetch_cloud_transcript', { episodeId: 'A' });
  });

  it('does NOT fetch the cloud transcript when a local one already exists', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'podcast_transcript_source_info')
        return info({ episode_id: 'A', cloud_possible: true, has_local: true });
      return [];
    });

    usePodcastStore.getState().loadEpisode(episode('A'));
    await flush();

    expect(invoke).not.toHaveBeenCalledWith('podcast_fetch_cloud_transcript', expect.anything());
  });

  it('switching episodes does not reuse the previous episode’s source info', async () => {
    // Episode A already has a cloud transcript; B has none but could get one.
    invoke.mockImplementation(async (cmd: string, args: { episodeId: string }) => {
      if (cmd === 'podcast_transcript_source_info') {
        return args.episodeId === 'A'
          ? info({ episode_id: 'A', has_cloud: true, cloud_possible: true, active: 'cloud' })
          : info({ episode_id: 'B', cloud_possible: true });
      }
      return [];
    });

    usePodcastStore.getState().loadEpisode(episode('A'));
    await flush();
    expect(invoke).not.toHaveBeenCalledWith('podcast_fetch_cloud_transcript', { episodeId: 'A' });

    // The moment B loads, A's info must be dropped, not reused.
    usePodcastStore.getState().loadEpisode(episode('B'));
    expect(usePodcastStore.getState().transcriptSourceInfo).toBeNull();

    await flush();
    expect(invoke).toHaveBeenCalledWith('podcast_fetch_cloud_transcript', { episodeId: 'B' });
  });

  it('a late source-info response for an old episode never overwrites the current one', async () => {
    usePodcastStore.setState({ activeEpisode: episode('B') });
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'podcast_transcript_source_info') return info({ episode_id: 'A', has_cloud: true });
      return [];
    });

    await usePodcastStore.getState().fetchTranscriptSourceInfo('A');

    expect(usePodcastStore.getState().transcriptSourceInfo).toBeNull();
  });

  it('skips the cloud when the episode was never curated', async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'podcast_transcript_source_info')
        return info({ episode_id: 'A', cloud_possible: false });
      return [];
    });

    usePodcastStore.getState().loadEpisode(episode('A'));
    await flush();

    expect(invoke).not.toHaveBeenCalledWith('podcast_fetch_cloud_transcript', expect.anything());
  });
});
