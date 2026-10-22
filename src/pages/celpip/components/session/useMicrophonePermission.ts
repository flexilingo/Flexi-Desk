import { useState, useCallback } from 'react';
import {
  detectOs,
  micFailureOf,
  probeVerdict,
  readMicLevel,
  startMicProbe,
  stopMicProbe,
} from '../../services/micProbe';

export type MicStatus =
  | 'idle' // not asked yet
  | 'pending' // device check in flight
  | 'granted' // the system let us record and a device responded
  | 'denied' // the system blocks the microphone - needs a settings change
  | 'no-device' // no microphone hardware found
  | 'in-use' // another app (or recording) holds it
  | 'silent' // it opened, but not a single sample of sound arrived (muted / blocked)
  | 'unsupported';

interface UseMicrophonePermissionResult {
  status: MicStatus;
  requestPermission: () => Promise<void>;
}

const PROBE_READINGS = 4;
const PROBE_GAP_MS = 150;

/**
 * Checks the microphone through the native capture the exam really records with
 * (CPAL). macOS asks for permission on the first capture; a microphone the user
 * (or the system) blocked either fails to open (Windows) or gives pure silence
 * (macOS). Never records anything to disk.
 */
export function useMicrophonePermission(): UseMicrophonePermissionResult {
  const [status, setStatus] = useState<MicStatus>('idle');

  const requestPermission = useCallback(async () => {
    setStatus('pending');
    try {
      await startMicProbe();
    } catch (err) {
      setStatus(micFailureOf(err));
      return;
    }
    try {
      let peak = -100;
      for (let i = 0; i < PROBE_READINGS; i++) {
        await new Promise((r) => setTimeout(r, PROBE_GAP_MS));
        peak = Math.max(peak, await readMicLevel());
      }
      setStatus(probeVerdict(peak, detectOs()));
    } catch {
      setStatus('denied');
    } finally {
      await stopMicProbe();
    }
  }, []);

  return { status, requestPermission };
}
