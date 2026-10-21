import { useState, useEffect, useCallback } from 'react';

// Ported verbatim from front's `src/hooks/useMicrophonePermission.ts`. Lives
// locally under the session directory because SectionIntro (the speaking gate)
// is the only desk surface that needs it, and this agent owns that gate.

export type MicStatus =
  | 'idle' // not asked yet (or Permissions API unavailable)
  | 'pending' // permission prompt / device check in flight
  | 'granted' // permission granted and a device responded
  | 'denied' // user (or policy) blocked the permission — needs settings fix
  | 'no-device' // permission ok but no microphone hardware found
  | 'in-use' // device exists but another app/tab holds it
  | 'unsupported'; // no getUserMedia (or insecure context)

interface UseMicrophonePermissionResult {
  status: MicStatus;
  requestPermission: () => Promise<void>;
}

export function useMicrophonePermission(): UseMicrophonePermissionResult {
  const [status, setStatus] = useState<MicStatus>(() => {
    if (typeof navigator === 'undefined') return 'idle';
    return typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'idle' : 'unsupported';
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    // Read the current permission state without prompting.
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((result) => {
          const apply = () => {
            if (result.state === 'granted') setStatus('granted');
            else if (result.state === 'denied') setStatus('denied');
            else setStatus('idle');
          };
          apply();
          // Recover live when the user flips the OS/webview toggle.
          result.onchange = apply;
        })
        .catch(() => {
          // Permissions API can't query 'microphone' here — leave 'idle';
          // requestPermission() will surface the real state.
        });
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('pending');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Only permission was needed — release the device immediately.
      stream.getTracks().forEach((track) => track.stop());
      setStatus('granted');
    } catch (err) {
      // Each failure needs different guidance — don't collapse them.
      const name = err instanceof DOMException ? err.name : '';
      if (
        name === 'NotFoundError' ||
        name === 'DevicesNotFoundError' ||
        name === 'OverconstrainedError'
      ) {
        setStatus('no-device');
      } else if (
        name === 'NotReadableError' ||
        name === 'TrackStartError' ||
        name === 'AbortError'
      ) {
        setStatus('in-use');
      } else {
        // NotAllowedError / PermissionDeniedError / SecurityError
        setStatus('denied');
      }
    }
  }, []);

  return { status, requestPermission };
}
