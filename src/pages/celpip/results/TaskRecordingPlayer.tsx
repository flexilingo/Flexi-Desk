import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, TriangleAlert } from 'lucide-react';
import { ReviewAudioPlayer } from './ReviewAudioPlayer';

/** What we managed to load, and which path it belongs to. */
interface Loaded {
  path: string;
  url: string | null;
}

/**
 * Plays back the learner's own spoken answer on the results page.
 *
 * The server hands us the storage object PATH - never a URL. Rust downloads the
 * object with the learner's own session (`celpip_fetch_recording`), so the
 * bucket's owner-only policy is what grants access rather than any check of
 * ours, and the only address that ever exists is an in-page blob URL that dies
 * with the component.
 */
export function TaskRecordingPlayer({ path }: { path: string }) {
  const { t } = useTranslation('exam');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // A blob the player could not decode.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const revoke = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
    (async () => {
      try {
        const buffer = await invoke<ArrayBuffer | number[]>('celpip_fetch_recording', { path });
        if (cancelled) return;
        const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
        revoke();
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        urlRef.current = objectUrl;
        setLoaded({ path, url: objectUrl });
      } catch {
        if (!cancelled) setLoaded({ path, url: null });
      }
    })();
    return () => {
      cancelled = true;
      revoke();
    };
  }, [path]);

  const settled = loaded?.path === path ? loaded : null;

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-caption">
        {t('results.yourRecording')}
      </p>

      {!settled ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-3 text-[12.5px] text-caption">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          {t('results.loadingRecording')}
        </div>
      ) : settled.url && failedUrl !== settled.url ? (
        <ReviewAudioPlayer
          src={settled.url}
          label={t('results.yourRecording')}
          preload="metadata"
          onError={() => setFailedUrl(settled.url)}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-3 text-[12.5px] text-muted-foreground">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
          {t('results.recordingUnavailable')}
        </div>
      )}
    </div>
  );
}

/**
 * The one note a locked result shows where its media would be (the recording,
 * the picture, the listening audio and transcript). The server never sent them,
 * so there is nothing behind it to reveal - this only says where they live.
 */
export function MediaLockNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-4 py-3">
      <Lock className="h-3.5 w-3.5 shrink-0 text-caption" />
      <p className="text-[12.5px] leading-snug text-muted-foreground">{text}</p>
    </div>
  );
}

/**
 * A listening item's own recording, replayed on the results page (full result
 * only - get_results listening_audio). Nothing loads until it is played; a file
 * that fails says so instead of leaving a dead control.
 */
export function ListeningItemAudio({ src }: { src: string }) {
  const { t } = useTranslation('exam');
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-3 text-[12.5px] text-muted-foreground">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
        {t('results.recordingUnavailable')}
      </div>
    );
  }
  return (
    <ReviewAudioPlayer
      src={src}
      label={t('results.listenAgain')}
      onError={() => setFailedSrc(src)}
    />
  );
}
