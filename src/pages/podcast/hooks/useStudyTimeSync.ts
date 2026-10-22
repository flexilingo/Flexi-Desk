import { useEffect, useRef } from 'react';
import { supabaseCall } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import { SYNC_INTERVAL_MS, nextStudyDelta, type StudySnapshot } from '../utils/studyTime';

/**
 * Listening time counts toward the account's daily goal: a minute of playback posts its delta to
 * `sync-study-time`, and the rest is flushed when the player closes. Guests have no goal to credit, so
 * nothing is sent for them. A failed post is retried with the next tick (the delta is kept).
 */
export function useStudyTimeSync(isPlaying: boolean) {
  const signedIn = useAuthStore((s) => !!s.session);
  const last = useRef<StudySnapshot>({ seconds: 0, clicks: 0, words: 0 });
  const busy = useRef(false);

  const sync = useRef(async () => {
    if (busy.current || !useAuthStore.getState().session) return;
    const st = usePlayerStore.getState();
    const now: StudySnapshot = {
      seconds: Math.floor(st.activeTimeSpent / 1000),
      clicks: st.wordsClicked,
      words: st.wordsClicked,
    };
    const delta = nextStudyDelta(last.current, now);
    if (!delta) return;
    busy.current = true;
    try {
      await supabaseCall('POST', '/sync-study-time', delta);
      last.current = now;
    } catch {
      // Kept for the next tick; study time must never interrupt listening.
    } finally {
      busy.current = false;
    }
  });

  // Each episode starts its own session counters.
  const episodeId = usePlayerStore((s) => s.currentEpisode?.id);
  useEffect(() => {
    last.current = { seconds: 0, clicks: 0, words: 0 };
  }, [episodeId]);

  useEffect(() => {
    if (!isPlaying || !signedIn) return;
    const id = setInterval(() => void sync.current(), SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, signedIn]);

  useEffect(() => {
    const flush = sync.current;
    return () => void flush();
  }, []);
}
