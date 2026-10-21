import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Speaks text through the existing Rust TTS command (OpenAI TTS when an API key
 * is configured, otherwise the OS voice). Failures are non-fatal — audio is an
 * enhancement, never a blocker for an activity.
 */
export function useSpeak() {
  const speak = useCallback((text: string, language?: string) => {
    if (!text?.trim()) return;
    invoke('tutor_speak_text', { text, language: language ?? null }).catch(() => {});
  }, []);

  const stop = useCallback(() => {
    invoke('tutor_stop_speaking').catch(() => {});
  }, []);

  return { speak, stop };
}
