import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { speakStudy, stopStudySpeech } from './studySpeak';
import {
  createShadowQueue,
  type QueueDeps,
  type QueueSettings,
  type QueueState,
} from './shadowQueue';

/** The real voice, clock and dice. `speak` from the shared speech module resolves when the sound ENDS. */
export function realDeps(accent: () => 'us' | 'uk'): QueueDeps {
  return {
    speak: (text, language) => speakStudy(text, language, accent()),
    stop: stopStudySpeech,
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    random: Math.random,
  };
}

/**
 * One controller per mounted screen. Settings and the English accent are read
 * through refs, so a change made in the menu applies to the very next word — the
 * controller is never rebuilt (that would cut a run off).
 */
export function useShadowQueue(
  settings: QueueSettings,
  accent: 'us' | 'uk' = 'us',
  deps?: QueueDeps,
) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const queue = useMemo(
    () => createShadowQueue(deps ?? realDeps(() => accentRef.current), () => settingsRef.current),
    [deps],
  );
  useEffect(() => () => queue.dispose(), [queue]);
  const state: QueueState = useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);
  return { queue, state };
}
