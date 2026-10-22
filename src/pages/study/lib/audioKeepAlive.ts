import { useEffect } from 'react';

/**
 * A one-second, seamlessly loopable 40 Hz tone at about -53 dBFS.
 *
 * Why a tone and not silence: a webview stops running a hidden window's timers on
 * their real schedule — after a few seconds `setTimeout` is clamped to 1 s, then to
 * about one wake a minute. A page that is PRODUCING AUDIO is exempt, which is why a
 * podcast keeps its timers. The exemption is decided by the engine's audio power
 * monitor against a silence threshold of about -72 dBFS, so digital zeroes buy
 * nothing; this clip carries a real signal 20 dB above it and far below anything a
 * listener can hear. 8000 Hz x 1 s holds exactly 40 whole cycles, so the loop seam
 * lands on a zero crossing and never clicks.
 */
let keepAliveUrl: string | null = null;

/** The WAV bytes of the keep-alive clip (exported for the test). */
export function keepAliveWav(): ArrayBuffer {
  const rate = 8000;
  const samples = rate;
  const bytes = samples * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const view = new DataView(buf);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, bytes, true);
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(100 * Math.sin((2 * Math.PI * 40 * i) / rate)), true);
  }
  return buf;
}

function getKeepAliveUrl(): string {
  if (!keepAliveUrl)
    keepAliveUrl = URL.createObjectURL(new Blob([keepAliveWav()], { type: 'audio/wav' }));
  return keepAliveUrl;
}

/**
 * Keeps the window counted as audible while `active`, so a hands-free run keeps its
 * schedule when the learner switches to another window (the way a podcast does).
 * Its own element, separate from the one the voice plays through: that one is idle
 * between clips, and those gaps are exactly when throttling would take hold.
 */
export function useAudioKeepAlive(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const audio = new Audio(getKeepAliveUrl());
    audio.loop = true;
    void audio.play().catch(() => {
      // Autoplay refused until a gesture unlocks audio; the retry below picks it up.
    });
    const retry = () => {
      void audio.play().catch(() => {});
    };
    document.addEventListener('click', retry);
    document.addEventListener('keydown', retry);
    return () => {
      document.removeEventListener('click', retry);
      document.removeEventListener('keydown', retry);
      audio.pause();
      audio.src = '';
    };
  }, [active]);
}
