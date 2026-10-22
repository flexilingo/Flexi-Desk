import { useEffect, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { audioPath } from './api';

/**
 * A listening card's sound.
 *
 * The card's words never reach the app before it is answered — it holds a sealed
 * audio token instead, and the backend turns that into speech. The bytes come
 * through `supabase_fetch_bytes` (signed-in, with the same token refresh as every
 * other call) and are kept for the card, so «again» costs nothing.
 *
 * One clip plays at a time. A loop is `of` plays with a breath between them, or
 * until stopped (`of: null`); `rate` 0.7 is the slow pass.
 */

export type ClipSnapshot = {
  /** The token of the clip that is loading or playing, if any. */
  loadingId: string | null;
  playingId: string | null;
  /** Which play of a loop is running. */
  repeat: { id: string; round: number; of: number | null } | null;
  failed: string | null;
};

let snapshot: ClipSnapshot = { loadingId: null, playingId: null, repeat: null, failed: null };
const listeners = new Set<() => void>();
const publish = (next: Partial<ClipSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
};

const blobs = new Map<string, Blob>();
let audio: HTMLAudioElement | null = null;
let url: string | null = null;
let run = 0;

async function bytesOf(lang: string, token: string): Promise<Blob> {
  const cached = blobs.get(token);
  if (cached) return cached;
  const raw = await invoke<ArrayBuffer>('supabase_fetch_bytes', { path: audioPath(lang, token) });
  const bytes = raw instanceof ArrayBuffer ? raw : new Uint8Array(raw as ArrayLike<number>).buffer;
  if (bytes.byteLength === 0) throw new Error('EMPTY');
  const head = new Uint8Array(bytes.slice(0, 4));
  const wav = String.fromCharCode(...head) === 'RIFF';
  const blob = new Blob([bytes], { type: wav ? 'audio/wav' : 'audio/mpeg' });
  blobs.set(token, blob);
  return blob;
}

function releaseElement() {
  if (audio) {
    audio.onended = audio.onerror = null;
    audio.pause();
    audio = null;
  }
  if (url) {
    URL.revokeObjectURL(url);
    url = null;
  }
}

/** Stops whatever is playing. */
export function stopClip() {
  run++;
  releaseElement();
  publish({ loadingId: null, playingId: null, repeat: null });
}

function playOnce(blob: Blob, id: string, rate: number, mine: number): Promise<boolean> {
  return new Promise((resolve) => {
    releaseElement();
    url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.playbackRate = rate;
    audio = el;
    el.onended = () => resolve(true);
    el.onerror = () => resolve(false);
    el.play().then(
      () => {
        if (run === mine) publish({ loadingId: null, playingId: id });
      },
      () => resolve(false),
    );
  });
}

/**
 * Plays the card's clip. `times` plays in a row (1 by default); `null` loops until
 * stopped. Resolves with the number of plays that started, so the screen can count.
 */
export async function playClip(
  lang: string,
  id: string,
  opts: { rate?: number; times?: number | null; onPlay?: () => void } = {},
): Promise<void> {
  const { rate = 1, times = 1, onPlay } = opts;
  const mine = ++run;
  releaseElement();
  publish({ loadingId: id, playingId: null, repeat: null, failed: null });
  let blob: Blob;
  try {
    blob = await bytesOf(lang, id);
  } catch {
    if (run === mine) publish({ loadingId: null, failed: id });
    return;
  }
  if (run !== mine) return;
  for (let round = 1; times === null || round <= times; round++) {
    if (run !== mine) return;
    if (times !== 1) publish({ repeat: { id, round, of: times } });
    onPlay?.();
    const ok = await playOnce(blob, id, rate, mine);
    if (run !== mine) return;
    if (!ok) {
      releaseElement();
      publish({ loadingId: null, playingId: null, repeat: null, failed: id });
      return;
    }
    if (times === null || round < times) await new Promise((r) => setTimeout(r, 700));
  }
  if (run === mine) {
    releaseElement();
    publish({ loadingId: null, playingId: null, repeat: null });
  }
}

export function useClipState(): ClipSnapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/** Forgets a card's clip once it is answered. */
export function forgetClip(id: string | null | undefined) {
  if (id) blobs.delete(id);
}

/** Whether a clip has been started for this card (to open it once, on its own). */
const opened = new Map<string, number>();
export function useOpenOnce(id: string | null, start: () => void) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!id) return;
    const last = opened.get(id) ?? 0;
    if (Date.now() - last < 60_000) return;
    opened.set(id, Date.now());
    start();
    tick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}
