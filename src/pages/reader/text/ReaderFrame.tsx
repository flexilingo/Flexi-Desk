import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReaderFrameContext } from './reader-frame-context';
import { useListenStore } from '../listen/listenStore';

const FULL_SCREEN_KEY = 'reader-full-screen';

function readFullScreen(): boolean {
  try {
    return window.localStorage.getItem(FULL_SCREEN_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * The frame every reader shares: the page, and a way back out of it.
 *
 * ONE BAR. The way back and the full-screen switch live in the toolbar. The frame
 * only draws its own "back" while no toolbar is showing (loading, an error), because
 * the way out of full screen must never be hidden along with everything else.
 *
 * FULL SCREEN IS THE PAGE'S, NOT THE WINDOW'S. On the website it takes the
 * dashboard's own chrome away; on desk the frame covers the app shell (sidebar and
 * header) with a fixed layer, and the choice is remembered like the text size is.
 */
export function ReaderFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation('reader');
  const [fullScreen, setFullScreenState] = useState(readFullScreen);
  const [hasToolbar, setHasToolbar] = useState(false);
  const listening = useListenStore((s) => !!s.source);

  const setFullScreen = useCallback((on: boolean) => {
    setFullScreenState(on);
    try {
      window.localStorage.setItem(FULL_SCREEN_KEY, String(on));
    } catch {
      /* no storage: the in-memory choice still applies */
    }
  }, []);

  const state = useMemo(
    () => ({ fullScreen, toggleFullScreen: () => setFullScreen(!fullScreen), setHasToolbar }),
    [fullScreen, setFullScreen],
  );

  return (
    <ReaderFrameContext.Provider value={state}>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col bg-muted',
          fullScreen && 'fixed inset-0 z-40 bg-background',
          // The player bar stays over a full-screen page; the page ends above it.
          fullScreen && listening && 'pb-28',
        )}
      >
        {!hasToolbar && (
          <div className="border-b border-border bg-card px-4 py-2">
            <Link
              to="/reader"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
              {t('read.backToLibrary')}
            </Link>
          </div>
        )}
        {children}
      </div>
    </ReaderFrameContext.Provider>
  );
}
