import { useCallback, useEffect, useRef, useState } from 'react';
import { drawPipFrame, readPipPalette, type PipFrame, type PipPalette } from '../utils/pipFrame';

/**
 * Picture-in-Picture for the player: a small always-on-top window with the line being spoken, so a
 * learner can keep reading while they work in another app. Two ways in, by what the webview has:
 *  - "document": Chromium webviews (WebView2 on Windows) open a real mini window. The caller renders
 *    into `container` with a portal.
 *  - "video": WebKit webviews only float a <video>. The frame is drawn on a canvas, streamed into a
 *    hidden muted video, and that video floats.
 * Where neither exists the button is not offered (`supported` is false).
 */

export type PipKind = 'document' | 'video';

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

type WebkitVideo = HTMLVideoElement & {
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

type CaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

const DOC_WINDOW = { width: 420, height: 260 };

const documentPip = (): DocumentPictureInPicture | null =>
  typeof window === 'undefined'
    ? null
    : ((window as unknown as { documentPictureInPicture?: DocumentPictureInPicture })
        .documentPictureInPicture ?? null);

/** What this webview can float. Null: nothing. */
export function detectPipKind(): PipKind | null {
  if (typeof window === 'undefined') return null;
  if (documentPip()) return 'document';
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  const video = HTMLVideoElement.prototype as WebkitVideo;
  if (document.pictureInPictureEnabled) return 'video';
  if (typeof video.webkitSetPresentationMode === 'function') return 'video';
  return null;
}

/** The page's stylesheets into the mini window, so its Tailwind classes work there. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.head.appendChild(link);
      continue;
    }
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      const style = target.createElement('style');
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      /* a cross-origin sheet cannot be read */
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.body.className = document.body.className;
}

interface Options {
  enabled: boolean;
  frame: PipFrame;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
}

export function usePictureInPicture({
  enabled,
  frame,
  isPlaying,
  onPlay,
  onPause,
  onTogglePlay,
}: Options) {
  const [kind, setKind] = useState<PipKind | null>(null);
  const [active, setActive] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setKind(enabled ? detectPipKind() : null);
  }, [enabled]);

  const windowRef = useRef<Window | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<WebkitVideo | null>(null);
  const trackRef = useRef<CaptureTrack | null>(null);
  const paletteRef = useRef<PipPalette | null>(null);
  const frameRef = useRef(frame);
  const playingRef = useRef(isPlaying);
  const activeRef = useRef(false);
  const handlersRef = useRef({ onPlay, onPause, onTogglePlay });
  useEffect(() => {
    frameRef.current = frame;
    playingRef.current = isPlaying;
    activeRef.current = active;
    handlersRef.current = { onPlay, onPause, onTogglePlay };
  });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paletteRef.current ??= readPipPalette();
    drawPipFrame(canvas, frameRef.current, paletteRef.current);
    trackRef.current?.requestFrame?.();
  }, []);

  // The hidden video for video mode, made once and kept: a float request must find it with its first
  // frame loaded, inside the same user gesture.
  const ensureVideo = useCallback(() => {
    if (videoRef.current) return videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    canvasRef.current = canvas;
    redraw();
    const canRequestFrame =
      typeof window.CanvasCaptureMediaStreamTrack !== 'undefined' &&
      'requestFrame' in window.CanvasCaptureMediaStreamTrack.prototype;
    const stream = canvas.captureStream(canRequestFrame ? 0 : 4);
    trackRef.current = (stream.getVideoTracks()[0] as CaptureTrack | undefined) ?? null;
    const video = document.createElement('video') as WebkitVideo;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.className = 'pointer-events-none fixed bottom-0 right-0 h-0.5 w-0.5 opacity-0';
    video.srcObject = stream;
    document.body.appendChild(video);
    redraw();
    // The window's own play/pause: our own play()/pause() calls always match the player, so only a
    // press in the window disagrees.
    video.addEventListener('play', () => {
      if (activeRef.current && !playingRef.current) handlersRef.current.onPlay();
    });
    video.addEventListener('pause', () => {
      if (activeRef.current && playingRef.current) handlersRef.current.onPause();
    });
    video.addEventListener('enterpictureinpicture', () => setActive(true));
    video.addEventListener('leavepictureinpicture', () => setActive(false));
    video.addEventListener('webkitpresentationmodechanged', () =>
      setActive(video.webkitPresentationMode === 'picture-in-picture'),
    );
    videoRef.current = video;
    video.play().catch(() => {});
    return video;
  }, [redraw]);

  useEffect(() => {
    if (kind === 'video' && isPlaying) ensureVideo();
  }, [kind, isPlaying, ensureVideo]);

  // Every change of line, title or progress is a new frame.
  useEffect(() => {
    if (kind === 'video') redraw();
  }, [kind, frame, redraw]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [isPlaying, active]);

  const closeWindow = useCallback(() => {
    const win = windowRef.current;
    windowRef.current = null;
    setContainer(null);
    setActive(false);
    win?.close();
  }, []);

  const openDocument = useCallback(async () => {
    const api = documentPip();
    if (!api) throw new Error('PIP_UNAVAILABLE');
    const win = await api.requestWindow(DOC_WINDOW);
    copyStyles(win.document);
    win.document.title = frameRef.current.title || document.title;
    win.addEventListener('pagehide', () => {
      if (windowRef.current !== win) return;
      windowRef.current = null;
      setContainer(null);
      setActive(false);
    });
    win.document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        handlersRef.current.onTogglePlay();
      }
    });
    windowRef.current = win;
    setContainer(win.document.body);
    setActive(true);
  }, []);

  const openVideo = useCallback(async () => {
    const video = ensureVideo();
    redraw();
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          video.removeEventListener('loadedmetadata', onReady);
          reject(new Error('PIP_NOT_READY'));
        }, 3000);
        const onReady = () => {
          window.clearTimeout(timer);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady, { once: true });
      });
    }
    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
      await video.requestPictureInPicture();
      return;
    }
    if (typeof video.webkitSetPresentationMode !== 'function') throw new Error('PIP_UNAVAILABLE');
    video.webkitSetPresentationMode('picture-in-picture');
    await new Promise<void>((resolve, reject) => {
      if (video.webkitPresentationMode === 'picture-in-picture') return resolve();
      const onChange = () => {
        if (video.webkitPresentationMode !== 'picture-in-picture') return;
        window.clearTimeout(timer);
        video.removeEventListener('webkitpresentationmodechanged', onChange);
        resolve();
      };
      const timer = window.setTimeout(() => {
        video.removeEventListener('webkitpresentationmodechanged', onChange);
        reject(new Error('PIP_REFUSED'));
      }, 1500);
      video.addEventListener('webkitpresentationmodechanged', onChange);
    });
  }, [ensureVideo, redraw]);

  const close = useCallback(() => {
    if (windowRef.current) closeWindow();
    const video = videoRef.current;
    if (video && document.pictureInPictureElement === video)
      document.exitPictureInPicture().catch(() => {});
    else if (video?.webkitPresentationMode === 'picture-in-picture')
      video.webkitSetPresentationMode?.('inline');
    setActive(false);
  }, [closeWindow]);

  /** Call from the key press or click itself: webviews only open the window for a user gesture. */
  const toggle = useCallback(() => {
    if (!kind) return;
    if (activeRef.current) {
      close();
      return;
    }
    setFailed(false);
    (kind === 'document' ? openDocument() : openVideo()).catch(() => {
      setActive(false);
      setFailed(true);
    });
  }, [kind, close, openDocument, openVideo]);

  const release = useCallback(() => {
    windowRef.current?.close();
    windowRef.current = null;
    const video = videoRef.current;
    if (video) {
      if (document.pictureInPictureElement === video)
        document.exitPictureInPicture().catch(() => {});
      else if (video.webkitPresentationMode === 'picture-in-picture')
        video.webkitSetPresentationMode?.('inline');
      video.pause();
      video.srcObject = null;
      video.remove();
    }
    trackRef.current?.stop();
    videoRef.current = null;
    trackRef.current = null;
    canvasRef.current = null;
    setContainer(null);
    setActive(false);
  }, []);

  // Leaving the player lets go of the window, the video, the stream and the canvas.
  useEffect(() => release, [release]);

  return {
    kind,
    supported: kind !== null,
    active,
    /** Document mode: render the window's content into this with a portal. */
    container,
    failed,
    dismissFailure: useCallback(() => setFailed(false), []),
    toggle,
  };
}
