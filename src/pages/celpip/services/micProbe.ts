import { invoke } from '@tauri-apps/api/core';

/**
 * The microphone, as the exam sees it. Capture is native (Rust/CPAL), so the
 * operating system - not the web view - decides whether the microphone may be
 * used. These helpers open a throwaway capture, read its level and close it.
 */

export type MicFailure = 'no-device' | 'in-use' | 'denied';

/** What a failed capture start means, from the message Rust sent. */
export function micFailureOf(err: unknown): MicFailure {
  const text = String(err ?? '');
  if (/RECORDING_ALREADY_ACTIVE|busy|in use|exclusive/i.test(text)) return 'in-use';
  if (
    /no default audio input|device not found|no supported input|NotFound|no input device/i.test(
      text,
    )
  ) {
    return 'no-device';
  }
  return 'denied';
}

export type DesktopOs = 'mac' | 'windows' | 'other';

export function detectOs(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): DesktopOs {
  if (/mac os x|macintosh/i.test(ua)) return 'mac';
  if (/windows/i.test(ua)) return 'windows';
  return 'other';
}

/** Digital silence over a whole probe: macOS hands a blocked app a silent stream instead of an error. */
export const DIGITAL_SILENCE_DBFS = -99;

/** Is this probe's loudest reading the "blocked by the system" signature? */
export function looksBlockedBySystem(peakDbfs: number, os: DesktopOs): boolean {
  return os === 'mac' && Number.isFinite(peakDbfs) && peakDbfs <= DIGITAL_SILENCE_DBFS;
}

export const startMicProbe = () => invoke<void>('celpip_mic_probe_start');
export const stopMicProbe = () => invoke<void>('celpip_mic_probe_stop').catch(() => undefined);
export const readMicLevel = () => invoke<number>('celpip_record_level');
export const openMicSettings = () => invoke<void>('celpip_open_mic_settings');
