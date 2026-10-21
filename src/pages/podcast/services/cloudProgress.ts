import { updateEpisodeActivity } from './podcastCloud';
import { useAuthStore } from '@/stores/authStore';

/**
 * Reports listening progress to the FlexiLingo account.
 *
 * Desk consumes `popular-episodes` / `my-podcasts` but never reported listening,
 * so its users' plays never counted toward either. This closes that loop.
 *
 * Three hard rules, because desk is offline-first and soon open-source:
 *   1. Only curated episodes have a `curated_episodes.id` UUID — everything else
 *      (PodcastIndex-only, local RSS) silently skips.
 *   2. Signed-out users skip.
 *   3. Failures are swallowed. Losing the network must never disturb playback.
 */

const HEARTBEAT_MS = 15_000;
const COMPLETION_RATIO = 0.9;

interface Tracked {
  curatedEpisodeId: string;
  lastSentAt: number;
  completionSent: boolean;
}

let tracked: Tracked | null = null;

function canReport(): boolean {
  return !!useAuthStore.getState().session;
}

/** Call when an episode starts playing. Safe to call repeatedly. */
export function beginCloudProgress(curatedEpisodeId: string | undefined | null): void {
  if (!curatedEpisodeId || !canReport()) {
    tracked = null;
    return;
  }
  if (tracked?.curatedEpisodeId === curatedEpisodeId) return;
  tracked = { curatedEpisodeId, lastSentAt: 0, completionSent: false };
}

export function endCloudProgress(): void {
  tracked = null;
}

/**
 * Called on every time update. Throttles to one heartbeat per 15 s, and sends a
 * one-shot `completed` once the listener passes 90 % of the episode.
 */
export function reportCloudProgress(positionSeconds: number, durationSeconds: number): void {
  if (!tracked || !canReport()) return;

  const now = Date.now();
  const ratio = durationSeconds > 0 ? positionSeconds / durationSeconds : 0;
  const isCompletion = !tracked.completionSent && ratio >= COMPLETION_RATIO;

  if (!isCompletion && now - tracked.lastSentAt < HEARTBEAT_MS) return;

  tracked.lastSentAt = now;
  if (isCompletion) tracked.completionSent = true;

  // Fire-and-forget: offline is the normal case for this app.
  void updateEpisodeActivity(tracked.curatedEpisodeId, positionSeconds, isCompletion).catch(
    () => {},
  );
}

/**
 * Sends the current position immediately, bypassing the heartbeat throttle.
 * Used when playback stops — otherwise up to 15 s of listening is lost.
 */
export function flushCloudProgress(positionSeconds: number): void {
  if (!tracked || !canReport() || positionSeconds <= 0) return;
  tracked.lastSentAt = Date.now();
  void updateEpisodeActivity(tracked.curatedEpisodeId, positionSeconds).catch(() => {});
}

/** Called when the audio element reaches the end. */
export function reportCloudCompletion(positionSeconds: number): void {
  if (!tracked || !canReport() || tracked.completionSent) return;
  tracked.completionSent = true;
  void updateEpisodeActivity(tracked.curatedEpisodeId, positionSeconds, true).catch(() => {});
}
